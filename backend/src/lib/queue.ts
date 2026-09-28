// backend/src/lib/queue.ts
// Real BullMQ queues with Redis (Phase 5)
import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import dotenv from 'dotenv'

dotenv.config()

// Redis connection for BullMQ
const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
})

// Queue definitions
export const emailQueue = new Queue('email', { connection: redisConnection })
export const telegramQueue = new Queue('telegram', { connection: redisConnection })
export const imageUploadQueue = new Queue('image-upload', { connection: redisConnection });
export const backupQueue = new Queue('backup', { connection: redisConnection });
export { redisConnection };   // so the worker can reuse it

// Job types
export interface EmailJobData {
  to: string
  subject: string
  template: 'welcome' | 'booking-confirmation' | '2fa-code'  | 'password-reset'
  data: Record<string, any>
}

export interface TelegramJobData {
  chatId: string
  message: string
  parseMode?: 'HTML' | 'Markdown'
}

/*export interface AuditJobData {
  userId?: string
  action: string
  resource: string
  resourceId?: string
  ipAddress: string
  userAgent: string
  tailscaleIp?: string
  deviceFingerprint?: string
  success: boolean
  errorMessage?: string
  metadata?: Record<string, any>
}*/

export interface ImageUploadJobData {
  bookingId: string;       // Supabase booking UUID
  imageBase64: string;     // Base64 image data
  token?: string;          // Pre‑booking token for cleanup
  email?: string;          // For pending email cleanup
}


// Graceful shutdown
export async function closeQueues(): Promise<void> {
  await emailQueue.close();
  await telegramQueue.close();
  await imageUploadQueue.close();
  await backupQueue.close();
  await redisConnection.quit();
}

// Job counters for monitoring (optional)
export const jobCounts = {
  email: { completed: 0, failed: 0 },
  telegram: { completed: 0, failed: 0 },
}