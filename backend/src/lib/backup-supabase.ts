// backend/src/lib/backup-supabase.ts
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const backupUrl = process.env.BACKUP_API_URL
const backupKey = process.env.BACKUP_API_KEY

// Backup is OPTIONAL — don't crash the app if it's not configured
if (!backupUrl) {
  console.warn('⚠️  BACKUP_API_URL is not set — backup sync disabled')
}
if (!backupKey) {
  console.warn('⚠️  BACKUP_API_KEY is not set — backup sync disabled')
}

console.log('🔧 Backup URL:', backupUrl ? '✓ Loaded' : '✗ Missing')
console.log('🔧 Backup Key:', backupKey ? '✓ Loaded' : '✗ Missing')

export const isBackupConfigured = () => Boolean(backupUrl && backupKey)

export const backupSupabase = isBackupConfigured()
  ? createClient(backupUrl!, backupKey || '', {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: 'public',
      },
    })
  : null

export async function testBackupConnection(): Promise<boolean> {
  try {
    if (!backupSupabase) return false
    const { error } = await backupSupabase.from('SiteData').select('id').limit(1)
    if (error) throw error
    return true
  } catch (err) {
    console.error('❌ Backup Supabase connection error:', err)
    return false
  }
}

// ─────────────────────────────────────────────────────────────────
// Keepalive: prevents the backup (free tier) from pausing on inactivity
// ─────────────────────────────────────────────────────────────────
let keepAliveInterval: NodeJS.Timeout | null = null

function startBackupKeepAlive(intervalHours: number = 12) {
  if (keepAliveInterval || !backupSupabase) return

  const intervalMs = intervalHours * 60 * 60 * 1000

  const ping = async () => {
    try {
      const { error } = await backupSupabase!.from('SiteData').select('id').limit(1)
      if (error) throw error
      console.log('🔁 Backup Supabase keepalive ping sent')
    } catch (err) {
      console.error('❌ Backup Supabase keepalive failed:', err)
    }
  }

  ping() // run immediately
  keepAliveInterval = setInterval(ping, intervalMs)
}

setTimeout(() => {
  startBackupKeepAlive(12)
}, 5000)

export function stopBackupKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval)
    keepAliveInterval = null
    console.log('🛑 Backup Supabase keepalive stopped')
  }
}