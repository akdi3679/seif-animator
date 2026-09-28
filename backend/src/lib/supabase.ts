// backend/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load env variables explicitly
dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL is not set in environment variables')
  console.error('Current process.env:', Object.keys(process.env))
  throw new Error('SUPABASE_URL is required. Please check your .env file')
}

if (!supabaseKey) {
  console.warn('⚠️  SUPABASE_SERVICE_KEY not set. Database operations will fail.')
}

console.log('🔧 Supabase URL:', supabaseUrl ? '✓ Loaded' : '✗ Missing')
console.log('🔧 Supabase Key:', supabaseKey ? '✓ Loaded' : '✗ Missing')

export const supabase = createClient(supabaseUrl, supabaseKey || '', {
  auth: { 
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    schema: 'public',
  },
})

export async function testSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from('User').select('id').limit(1)
    if (error) throw error
    return true
  } catch (err) {
    console.error('❌ Supabase connection error:', err)
    return false
  }
}

// ─────────────────────────────────────────────────────────────────
// Keepalive: prevents free tier from pausing after inactivity
// ─────────────────────────────────────────────────────────────────
let keepAliveInterval: NodeJS.Timeout | null = null

function startKeepAlive(intervalHours: number = 12) {
  if (keepAliveInterval) return

  const intervalMs = intervalHours * 60 * 60 * 1000

  const ping = async () => {
    try {
      // Lightweight query – uses the existing connection
      const { error } = await supabase.from('User').select('id').limit(1)
      if (error) throw error
      console.log('🔁 Supabase keepalive ping sent')
    } catch (err) {
      console.error('❌ Supabase keepalive failed:', err)
    }
  }

  ping() // run immediately
  keepAliveInterval = setInterval(ping, intervalMs)
}

// Auto-start when this module is loaded (after supabase client is ready)
// Wait a few seconds to ensure the app is fully running, or start immediately.
// Using a small delay to avoid interfering with startup logs.
setTimeout(() => {
  startKeepAlive(12)
}, 5000)

// Optional: export stop function if needed (for graceful shutdown)
export function stopSupabaseKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval)
    keepAliveInterval = null
    console.log('🛑 Supabase keepalive stopped')
  }
}