// backend/src/workers/telegram-worker.ts
// Telegram bot notifications

import { Worker, Job } from 'bullmq'
import axios from 'axios'
import { Redis } from 'ioredis'

import dotenv from 'dotenv'
import { TelegramJobData, jobCounts } from '../lib/queue.js'

dotenv.config()

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`

const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
});

// Process telegram jobs
const worker = new Worker('telegram', async (job: Job<TelegramJobData>) => {
  console.log(`📱 Processing telegram job ${job.id}`)
  
  try {
    const { chatId, message, parseMode = 'HTML' } = job.data
    
    const response = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: parseMode,
      disable_web_page_preview: true
    })
    
    if (response.data.ok) {
      console.log(`✅ Telegram message sent to ${chatId}`)
      jobCounts.telegram.completed++
      return { success: true, messageId: response.data.result.message_id }
    } else {
      throw new Error('Telegram API error')
    }
    
  } catch (error) {
    console.error(`❌ Telegram job ${job.id} failed:`, error)
    jobCounts.telegram.failed++
    throw error
  }
}, { 
  connection: redisConnection,
  concurrency: 2
})

worker.on('completed', (job) => {
  console.log(`📱 Job ${job.id} completed`)
})

worker.on('failed', (job, err) => {
  console.error(`📱 Job ${job?.id} failed:`, err)
})

export default worker