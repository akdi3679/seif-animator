// backend/src/lib/redis.ts
import 'dotenv/config'
import { Redis } from 'ioredis'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: redisUrl.startsWith('rediss://') ? {} : undefined
})

redis.on('connect', () => {
  console.log('✅ Redis connected')
  // Start keepalive once connected
  startKeepAlive()
})

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err)
})

function startKeepAlive() {
  // Send PING every 12 hours (43200000 ms)
  setInterval(async () => {
    try {
      await redis.ping()
      console.log('🔁 Redis keepalive ping sent')
    } catch (err) {
      console.error('❌ Redis keepalive ping failed:', err)
    }
  }, 12 * 60 * 60 * 1000)
}

export default redis