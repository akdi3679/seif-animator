// backend/src/services/notification-service.ts
import { emailQueue, telegramQueue, EmailJobData } from '../lib/queue.js'

export async function sendEmail(
  to: string,
  subject: string,
  template: EmailJobData['template'],
  data: Record<string, any>
): Promise<void> {
  await emailQueue.add('send-email', { to, subject, template, data })
}

export async function sendTelegram(
  chatId: string,
  message: string,
  parseMode?: 'HTML' | 'Markdown'
): Promise<void> {
  await telegramQueue.add('send-telegram', { chatId, message, parseMode })
}

// Convenience methods for common notifications
export async function send2FACodeEmail(email: string, code: string): Promise<void> {
  await sendEmail(email, 'Your 2FA Code', '2fa-code', { code })
}

export async function sendExportReadyEmail(email: string, downloadUrl: string): Promise<void> {
  await sendEmail(email, 'Your Export is Ready', 'export-ready', { downloadUrl })
}