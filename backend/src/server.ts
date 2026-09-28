// backend/src/server.ts
// Enterprise: Silent connections, state-change-only logging, exponential backoff
// + Security hardening: request smuggling protection, cache poisoning prevention, robust admin creation

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'        
import { exec } from 'child_process'
import { promisify } from 'util'
import { registerCrons } from './lib/cron-registry.js';
import pRetry from 'p-retry';
import { systemLoadMiddleware } from './middleware/system-load.js';
import { v2 as cloudinary } from 'cloudinary';
import { runSeeds } from './lib/seed.js'





dotenv.config()
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const execAsync = promisify(exec)

import { publicRoutes } from './routes/public/index.js'
import { adminRoutes } from './routes/admin/index.js'
import { validateTailscalePeer } from './middleware/tailscale.js'
import { errorHandler } from './middleware/error-handler.js'
import { closeQueues } from './lib/queue.js'
import redis from './lib/redis.js'
import { supabase, testSupabaseConnection } from './lib/supabase.js'
import { handleCalcomWebhook } from './routes/public/calcom-webhook.js';


const PORT_PUBLIC = parseInt(process.env.PORT_PUBLIC || '4000')
const PORT_ADMIN = parseInt(process.env.PORT_ADMIN || '4001')
const NODE_ENV = process.env.NODE_ENV || 'development'
const PUBLIC_CORS_ORIGIN = process.env.PUBLIC_CORS_ORIGIN?.split(',') || ['http://localhost:3000']
const ADMIN_CORS_ORIGIN = process.env.ADMIN_CORS_ORIGIN?.split(',') || ['http://localhost:3000']

//const retryTimers: Record<string, NodeJS.Timeout | null> = {}

// ============================================
// SILENT CONNECTION MANAGER (Enterprise Pattern)
// ============================================

interface ConnectionState {
  connected: boolean
  announced: boolean
  failCount: number
}

const connections: Record<string, ConnectionState> = {
  redis: { connected: false, announced: false, failCount: 0 },
  supabase: { connected: false, announced: false, failCount: 0 }
}

const RETRY_BASE_MS = 5000
const RETRY_MAX_MS = 60000

function getRetryDelay(failCount: number): number {
  return Math.min(RETRY_BASE_MS * Math.pow(2, failCount), RETRY_MAX_MS)
}

// Flag to ensure admin creation runs only once after supabase connects
let seedsRun = false;



// Circuit breaker options
// ============================================
// SIMPLIFIED CONNECTION MANAGER (no opossum)
// ============================================

async function checkRedis(): Promise<boolean> {
  await redis.ping();
  return true;
}

async function checkSupabase(): Promise<boolean> {
  const ok = await testSupabaseConnection();
  if (!ok) throw new Error('Supabase unhealthy');
  return true;
}

async function manageConnection(
  name: string,
  checkFn: () => Promise<boolean>,
  onConnect?: () => Promise<void>
) {
  const state = connections[name];

  // Try the health check directly (with pRetry for backoff)
  try {
    await pRetry(async () => {
      await checkFn();
    }, {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 10000,
      onFailedAttempt: (err) => {
        console.log(`⚠️  ${name} health check attempt ${err.attemptNumber} failed`);
      },
    });

    // Success
    if (!state.connected) {
      state.connected = true;
      state.failCount = 0;
      console.log(`✅ ${name} connected`);
      if (onConnect) await onConnect();
    }
    state.connected = true;
    state.failCount = 0;
  } catch {
    // All retries failed
    if (state.connected) {
      console.log(`⚠️  ${name} disconnected`);
      state.connected = false;
    }
    state.failCount++;
    const delay = getRetryDelay(state.failCount);
    console.log(`⚠️  ${name} will retry in ${delay / 1000}s`);
    setTimeout(() => manageConnection(name, checkFn, onConnect), delay);
  }
}

function startConnectionManagers() {
  // Redis
  manageConnection('redis', checkRedis);
  setInterval(() => manageConnection('redis', checkRedis), 30_000);

  // Supabase — run ALL seeds once on first successful connect
  manageConnection('supabase', checkSupabase, async () => {
    if (!seedsRun) {
      await runSeeds();
      seedsRun = true;
      console.log('✅ Seeds completed on first Supabase connect');
    }
  });
  setInterval(() => manageConnection('supabase', checkSupabase), 30_000);
}

// ============================================
// TAILSCALE
// ============================================

async function getTailscaleIP(): Promise<string> {
  if (process.env.TAILSCALE_SERVER_IP) {
    return process.env.TAILSCALE_SERVER_IP
  }
  try {
    const { stdout } = await execAsync('tailscale ip -4')
    return stdout.trim()
  } catch {
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ Failed to get Tailscale IP in production. Set TAILSCALE_SERVER_IP env.')
      process.exit(1)
    }
    console.warn('⚠️ Tailscale not detected, falling back to localhost for development')
    return '127.0.0.1'
  }
}

// ============================================
// REQUEST SMUGGLING PROTECTION
// ============================================
function preventRequestSmuggling(req: express.Request, res: express.Response, next: express.NextFunction) {
  const hasTE = req.headers['transfer-encoding'] !== undefined
  const hasCL = req.headers['content-length'] !== undefined
  if (hasTE && hasCL) {
    return res.status(400).send('Bad Request: ambiguous headers')
  }
  next()
}

// ============================================
// WEB CACHE POISONING PROTECTION (strip client cache headers)
// ============================================
function stripCacheHeaders(req: express.Request, _res: express.Response, next: express.NextFunction) {
  delete req.headers['cache-control']
  delete req.headers['pragma']
  delete req.headers['expires']
  next()
}

// ============================================
// SERVERS
// ============================================

const publicApp = express()
publicApp.set('trust proxy', 1);

publicApp.use(helmet())
publicApp.use(cors({
  origin: PUBLIC_CORS_ORIGIN,
  credentials: true,
  optionsSuccessStatus: 200
}))
if (process.env.NODE_ENV === 'production') {

publicApp.use(systemLoadMiddleware);
}
publicApp.use(cookieParser());

// ✅ Mount webhook endpoint with raw body parser BEFORE the global JSON parser
publicApp.post(
  '/api/public/calcom-webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    (req as any).rawBody = req.body;
    try {
      req.body = JSON.parse(req.body.toString());
    } catch {
      req.body = {};
    }
    await handleCalcomWebhook(req, res);
  }
);

console.log('✅ Webhook route mounted at /api/public/calcom-webhook');

publicApp.use(express.json({ limit: '10mb' }))
publicApp.use(express.urlencoded({ extended: true }))
// Clear body for GET/HEAD
publicApp.use((req, _res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') req.body = undefined
  if (NODE_ENV !== 'production') {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
  }
  next()
})
// Security middleware order: smuggling first, then cache stripping, then signature
publicApp.use(preventRequestSmuggling)
publicApp.use(stripCacheHeaders) // only for public routes (optional, but safe)

publicApp.get('/health', async (_req, res) => {
  const allConnected = Object.values(connections).every(c => c.connected)
  res.status(allConnected ? 200 : 503).json({
    status: allConnected ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    connections: Object.fromEntries(Object.entries(connections).map(([k, v]) => [k, v.connected]))
  })
})

publicApp.use('/api/public', publicRoutes)
publicApp.use(errorHandler)

const adminApp = express()
adminApp.set('trust proxy', 1);

adminApp.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}))

adminApp.use(cors({
  origin: ADMIN_CORS_ORIGIN,
  credentials: true,
  optionsSuccessStatus: 200
}))
if (process.env.NODE_ENV === 'production') {

adminApp.use(systemLoadMiddleware);
}
adminApp.use(express.json({ limit: '50mb' }))
adminApp.use(express.urlencoded({ extended: true }))
adminApp.use((req, _res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') req.body = undefined
  next()
})

adminApp.use(cookieParser())
// Admin also needs smuggling protection (though Tailscale reduces risk)
adminApp.use(preventRequestSmuggling)

adminApp.use(validateTailscalePeer)
  
adminApp.get('/health', (_req, res) => {
  res.json({ status: 'ok', tailscale: true, timestamp: new Date().toISOString() })
})

adminApp.use('/api/admin', adminRoutes)
adminApp.use(errorHandler)

// ============================================
// STARTUP
// ============================================

async function startServers() {
  // Connection managers will handle admin creation on first supabase connect
  startConnectionManagers()
await runSeeds() 
  console.log('✅ seed verified')

  // Register every scheduled job from the single source of truth (lib/cron-registry.ts)
  registerCrons()

  const tailscaleIP = await getTailscaleIP()

  const publicServer = publicApp.listen(PORT_PUBLIC, '0.0.0.0', () => {
    console.log(`✅ Public API: http://localhost:${PORT_PUBLIC}`)
  })
  // Set server timeouts to mitigate slowloris and request smuggling
  publicServer.requestTimeout = 120000 // 2 minutes (Node.js 18+)
  publicServer.maxHeadersCount = 2000

  const adminServer = adminApp.listen(PORT_ADMIN, tailscaleIP, () => {
    console.log(`🔒 Admin API: http://${tailscaleIP}:${PORT_ADMIN}`)
  })
  adminServer.requestTimeout = 120000
  adminServer.maxHeadersCount = 2000

  console.log('\n🚀 Servers started')
  console.log(`📋 Admin CORS allowed origins:`, ADMIN_CORS_ORIGIN)
}

// ============================================
// SHUTDOWN
// ============================================

async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`)
  try { await closeQueues() } catch {}
  try { await redis.quit() } catch {}
  process.exit(0)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
startServers()