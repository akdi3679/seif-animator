// backend/src/workers/email-worker.ts
// Email sending worker with SMTP

import { Worker, Job } from 'bullmq'
import nodemailer from 'nodemailer'
import dotenv from 'dotenv'
import { Redis } from 'ioredis'

import { EmailJobData, jobCounts } from '../lib/queue.js'
import { emailTemplates } from '../lib/notifications/email-templates.js'

dotenv.config()

const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: process.env.REDIS_URL?.startsWith('rediss://') ? {} : undefined,
});

// Configure SMTP transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

// Verify SMTP connection on startup
transporter.verify((error) => {
  if (error) {
    console.error('❌ SMTP connection failed:', error)
  } else {
    console.log('✅ SMTP worker ready')
  }
})

// Process email jobs
const worker = new Worker('email', async (job: Job<EmailJobData>) => {
  console.log(`📧 Processing email job ${job.id}: ${job.data.template} to ${job.data.to}`)
  
  try {
    const { to, subject, template, data } = job.data
    
    // Get template content
    const { html, text } = emailTemplates[template](data)
    
    // Send email
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Myshow.tn" <noreply@myshow.tn>',
      to,
      subject,
      html,
      text
    })
    
    console.log(`✅ Email sent: ${info.messageId}`)
    jobCounts.email.completed++
    
    return { success: true, messageId: info.messageId }
    
  } catch (error) {
    console.error(`❌ Email job ${job.id} failed:`, error)
    jobCounts.email.failed++
    throw error // BullMQ will retry based on configuration
  }
}, { 
  connection: redisConnection,
  concurrency: 5, // Send 5 emails concurrently
  limiter: {
    max: 10, // Max 10 emails per minute (rate limiting)
    duration: 60000
  }
})

worker.on('completed', (job) => {
  console.log(`📧 Job ${job.id} completed`)
})

worker.on('failed', (job, err) => {
  console.error(`📧 Job ${job?.id} failed:`, err)
})

export default worker