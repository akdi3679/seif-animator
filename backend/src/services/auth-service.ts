import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { randomBytes, randomInt } from 'crypto';
import redis from '../lib/redis.js';
import { supabase } from '../lib/supabase.js';
import { generateFingerprint, extractFromRequest } from '../lib/security/device-fingerprint.js';
import { revokeAllUserTokens } from './token-service.js';

const DEBUG = process.env.DEBUG_AUTH === 'true';

const JWT_SECRET = process.env.JWT_SECRET!;
const BCRYPT_ROUNDS = 12;
const SESSION_TTL_SECONDS = 30 * 60; // 30 minutes
const TWO_FA_CODE_TTL_SECONDS = 5 * 60; // 5 minutes

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  role?: 'USER' | 'ADMIN';
}

export interface SessionData {
  userId: string;
  deviceFingerprint: string;
  ipAddress: string;
  geoLocation?: { city: string; country: string; lat: number; lon: number };
  userAgent: string;
  tailscaleIP?: string;
}

// ==================== Password Utilities ====================
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ==================== JWT Utilities ====================
export function verifyToken(token: string): any {
  return jwt.verify(token, JWT_SECRET);
}

// ==================== 2FA Utilities ====================
export function generate2FASecret(): string {
  return authenticator.generateSecret();
}

export function verify2FAToken(token: string, secret: string): boolean {
  return authenticator.verify({ token, secret });
}

export function generate2FACode(): string {
  return randomInt(100000, 999999).toString().padStart(6, '0');
}

export async function store2FACode(sessionId: string, code: string): Promise<void> {
  await redis.setex(`2fa:${sessionId}`, TWO_FA_CODE_TTL_SECONDS, code);
}

export async function verifyAndConsume2FACode(sessionId: string, code: string): Promise<boolean> {
  const stored = await redis.get(`2fa:${sessionId}`);
  if (!stored || stored !== code) return false;
  await redis.del(`2fa:${sessionId}`);
  return true;
}

// ==================== Session Management ====================

export async function createAndStoreSession(
  userId: string,
  req: any,
  geo?: any,
  extraData?: { tailscaleIP?: string }
): Promise<string> {
  const fingerprint = generateFingerprint(extractFromRequest(req));
  if (DEBUG) console.log('[SESSION CREATE] fingerprint:', fingerprint, 'userId:', userId);

  // Capture old session ID BEFORE upsert replaces it
  const { data: priorSession } = await supabase
    .from('Session')
    .select('id')
    .eq('userId', userId)
    .eq('deviceFingerprint', fingerprint)
    .maybeSingle();
  const oldSessionId = priorSession?.id ?? null;

  const sessionId = randomBytes(16).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);

  // Upsert on (userId, deviceFingerprint) – atomic, no delete‑insert race
  const { error } = await supabase
    .from('Session')
    .upsert({
      id: sessionId,
      userId,
      deviceFingerprint: fingerprint,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      geoLocation: geo || null,
      tailscaleIp: extraData?.tailscaleIP || null,
      expiresAt: expiresAt.toISOString(),
    }, { onConflict: 'userId, deviceFingerprint' });

  if (error) {
    console.error('❌ Failed to create session in Supabase:', error);
    throw new Error('Session creation failed');
  }

  // Delete the previous session's Redis cache if it had a different ID
  if (oldSessionId && oldSessionId !== sessionId) {
    await redis.del(`session:${oldSessionId}`).catch(() => {});
  }
  if (extraData?.tailscaleIP) {
    await supabase.from('User').update({ tailscaleIp: extraData.tailscaleIP }).eq('id', userId);
  }

  const sessionCache = {
    userId,
    role: 'ADMIN',
    deviceFingerprint: fingerprint,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    geoLocation: geo,
    tailscaleIP: extraData?.tailscaleIP,
    expiresAt: expiresAt.toISOString(),
  };

  await redis
    .setex(`session:${sessionId}`, SESSION_TTL_SECONDS, JSON.stringify(sessionCache))
    .catch(err => console.error('❌ Redis session caching failed:', err));

  if (DEBUG) console.log('[SESSION CREATE] sessionId:', sessionId);
  return sessionId;
}

/**
 * Renew an EXISTING session's TTL in place. Used by /auth/refresh.
 * Does NOT delete/recreate the row. Returns false if the session no longer exists.
 */
export async function renewSession(sessionId: string, req: any, geo?: any): Promise<boolean> {
  if (DEBUG) console.log('[SESSION RENEW] sessionId:', sessionId);
  const newExpiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  const { data: existing, error: fetchErr } = await supabase
    .from('Session')
    .select('id')
    .eq('id', sessionId)
    .maybeSingle();

  if (fetchErr) {
    console.error('❌ renewSession lookup failed:', fetchErr);
    throw new Error('SESSION_CHECK_UNAVAILABLE');
  }
  if (!existing) {
    console.warn('[SESSION RENEW] session row missing, cannot renew:', sessionId);
    return false;
  }

  const { error: updateErr } = await supabase
    .from('Session')
    .update({
      expiresAt: newExpiresAt,
      ipAddress: req.ip,
      ...(geo ? { geoLocation: geo } : {}),
      // Never drift tailscaleIp
    })
    .eq('id', sessionId);

  if (updateErr) {
    console.error('❌ renewSession update failed:', updateErr);
    throw new Error('SESSION_CHECK_UNAVAILABLE');
  }

  const raw = await redis.get(`session:${sessionId}`);
  if (raw) {
    try {
      const session = JSON.parse(raw);
      session.expiresAt = newExpiresAt;
      session.ipAddress = req.ip;
      if (geo) session.geoLocation = geo;
      await redis.setex(`session:${sessionId}`, SESSION_TTL_SECONDS, JSON.stringify(session));
    } catch {
      await redis.del(`session:${sessionId}`).catch(() => {});
    }
  } else {
    // Rebuild cache from Supabase
    const { data: full } = await supabase
      .from('Session')
      .select('userId, deviceFingerprint, userAgent, geoLocation, tailscaleIp')
      .eq('id', sessionId)
      .single();
    if (full) {
      const sessionCache = {
        userId: full.userId,
        role: 'ADMIN',
        deviceFingerprint: full.deviceFingerprint,
        ipAddress: req.ip,
        userAgent: full.userAgent,
        geoLocation: geo || full.geoLocation,
        tailscaleIP: full.tailscaleIp || null,
        expiresAt: newExpiresAt,
      };
      await redis
        .setex(`session:${sessionId}`, SESSION_TTL_SECONDS, JSON.stringify(sessionCache))
        .catch(err => console.error('❌ Redis session re‑cache failed:', err));
    }
  }

  if (DEBUG) console.log('[SESSION RENEW] done');
  return true;
}

/**
 * Validate a session.
 * Checks Redis first; falls back to Supabase if missing.
 * Performs integrity checks (strict for ADMIN).
 */
export async function validateSession(sessionId: string, req: any): Promise<boolean> {
  if (DEBUG) console.log('[VALIDATE SESSION] id:', sessionId);
  try {
    // 1. Try Redis
    const raw = await redis.get(`session:${sessionId}`);
    if (raw) {
      let session: any;
      try {
        session = JSON.parse(raw);
      } catch {
        return await fallbackToSupabase(sessionId, req);
      }

      if (new Date(session.expiresAt) < new Date()) {
        await redis.del(`session:${sessionId}`);
        return await fallbackToSupabase(sessionId, req);
      }

      // Extend TTL if less than 10 minutes remaining (fire-and-forget)
      const remainingMs = new Date(session.expiresAt).getTime() - Date.now();
      if (remainingMs < 10 * 60 * 1000) {
        const newExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        session.expiresAt = newExpiresAt;
        redis.setex(`session:${sessionId}`, 30 * 60, JSON.stringify(session)).catch(() => {});
        supabase
          .from('Session')
          .update({ expiresAt: newExpiresAt })
          .eq('id', sessionId)
          .then(({ error }) => {
            if (error) console.error('Session extension DB update failed:', error.message);
          });
      }

      return validateIntegrity(session, req);
    }

    // 2. Redis miss – fallback to Supabase
    return await fallbackToSupabase(sessionId, req);
  } catch (error) {
    console.error('Session validation error:', error);
    throw new Error('SESSION_CHECK_UNAVAILABLE');
  }
}

// ── Internal fallback – Supabase lookup + cache back to Redis ──
async function fallbackToSupabase(sessionId: string, req: any): Promise<boolean> {
  if (DEBUG) console.log('[SESSION] Redis miss, falling back to Supabase for', sessionId);
  try {
    const { data: session, error } = await supabase
      .from('Session')
      .select(`
        id,
        userId,
        deviceFingerprint,
        ipAddress,
        geoLocation,
        userAgent,
        tailscaleIp,
        expiresAt,
        user:User ( email, role )
      `)
      .eq('id', sessionId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Supabase session lookup failed:', error);
      return false;
    }
    if (!session || new Date(session.expiresAt) < new Date()) {
      return false;
    }

    const dataToCache = {
      userId: session.userId,
      email: (session.user as any).email,
      role: (session.user as any).role,
      deviceFingerprint: session.deviceFingerprint,
      ipAddress: session.ipAddress,
      geoLocation: session.geoLocation,
      userAgent: session.userAgent,
      tailscaleIP: session.tailscaleIp || null,   // stored IP, not current
      expiresAt: session.expiresAt,
    };

    const remainingSecs = Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000);
    await redis
      .setex(`session:${sessionId}`, Math.max(remainingSecs, 1), JSON.stringify(dataToCache))
      .catch(() => {});

    return validateIntegrity(dataToCache, req);
  } catch (err) {
    console.error('Supabase fallback error:', err);
    throw new Error('SESSION_CHECK_UNAVAILABLE');
  }
}

// ── Integrity check ────────────────────────────────────────────
function validateIntegrity(session: any, req: any): boolean {
  if (session.role !== 'ADMIN') return true;

  // 1. Device fingerprint
  const currentFingerprint = generateFingerprint(extractFromRequest(req));
  if (DEBUG) {
    console.log('[INTEGRITY CHECK] session fingerprint:', session.deviceFingerprint);
    console.log('[INTEGRITY CHECK] request fingerprint:', currentFingerprint);
  }
  if (session.deviceFingerprint !== currentFingerprint) {
    console.warn('Session integrity: device fingerprint mismatch');
    return false;
  }

  // 2. User agent
  const currentUA = req.headers['user-agent'];
  if (session.userAgent !== currentUA) {
    console.warn('Session integrity: user agent mismatch');
    return false;
  }

  // 3. Tailscale IP (if stored)
  if (session.tailscaleIP) {
    const clientIP = (req as any).tailscaleClientIP;
    if (clientIP && session.tailscaleIP !== clientIP) {
      console.warn('Session integrity: Tailscale IP mismatch');
      return false;
    }
  }

  return true;
}

// ==================== User Management ====================
export async function login(credentials: LoginCredentials, req: any): Promise<{
  user: any;
  sessionId: string;
} | null> {
  const { data: user, error } = await supabase
    .from('User')
    .select('*')
    .eq('email', credentials.email)
    .single();

  if (error || !user) return null;

  const validPassword = await verifyPassword(credentials.password, user.passwordHash);
  if (!validPassword) return null;

  const sessionId = await createAndStoreSession(user.id, req, req.body?.geo, {
    tailscaleIP: (req as any).tailscaleClientIP,
  });
  await supabase
    .from('User')
    .update({ lastLoginAt: new Date().toISOString() })
    .eq('id', user.id);

  return { user, sessionId };
}

export async function register(data: RegisterData): Promise<any> {
  const { data: existing } = await supabase
    .from('User')
    .select('id')
    .eq('email', data.email)
    .single();

  if (existing) throw new Error('Email already registered');

  const passwordHash = await hashPassword(data.password);
  const now = new Date().toISOString();
  const { data: user, error } = await supabase
    .from('User')
    .insert({
      email: data.email,
      passwordHash,
      role: data.role || 'USER',
      createdAt: now,
      updatedAt: now,
      passwordChangedAt: now,
    })
    .select('id, email, role')
    .single();

  if (error) {
    console.error('Error creating user:', error);
    throw new Error('Failed to create user');
  }
  return user;
}

export async function logoutUser(userId: string, sessionId?: string): Promise<void> {
  if (sessionId) {
    await redis.del(`session:${sessionId}`);
  }
  await supabase.from('Session').delete().eq('userId', userId);
  await revokeAllUserTokens(userId);
}

export async function isTwoFactorEnabled(userId: string): Promise<boolean> {
  const { data: user } = await supabase
    .from('User')
    .select('twoFactorEnabled')
    .eq('id', userId)
    .single();
  return user?.twoFactorEnabled || false;
}

export async function adminExists(): Promise<boolean> {
  const { data } = await supabase
    .from('User')
    .select('id')
    .eq('role', 'ADMIN')
    .limit(1);
  return !!(data && data.length > 0);
}

export async function deleteUserByEmail(email: string): Promise<void> {
  await supabase.from('User').delete().eq('email', email);
}
