// backend/src/lib/audit.ts
import { supabase } from './supabase.js';
import { sendTelegram } from '../services/notification-service.js';

export interface AuditData {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  req: any;
  success: boolean;
  errorMessage?: string;
  metadata?: any;
}

const ADMIN_TELEGRAM_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID;

/**
 * Log an audit event asynchronously (fire‑and‑forget).
 * Critical failures are also sent to Telegram.
 */
export function logAudit(data: AuditData): void {
  // Execute asynchronously to avoid blocking the request
  (async () => {
    try {
      const { error } = await supabase.from('AuditLog').insert({
  userId: data.userId,
  action: data.action,
  resource: data.resource,
  resourceId: data.resourceId,
  ipAddress: data.req.headers['x-forwarded-for'] || data.req.socket?.remoteAddress?.replace(/^::ffff:/, '') || data.req.ip || 'unknown',
  userAgent: (data.req.headers['user-agent'] || 'unknown').substring(0, 256),
  tailscaleIp: (data.req as any).tailscaleClientIP,
  deviceFingerprint: (data.req.headers['x-device-fingerprint'] || '').substring(0, 64),
  success: data.success,
  errorMessage: data.errorMessage,
  metadata: data.metadata ? JSON.stringify(data.metadata) : null,
  createdAt: new Date().toISOString(),
});

      if (error) {
        console.error('❌ Audit log insert failed:', error.message);
      }

      // Send Telegram alert for critical events
      if (!data.success && ADMIN_TELEGRAM_CHAT_ID) {
        const criticalActions = ['LOGIN_FAILED', 'UNAUTHORIZED_ACCESS', 'SESSION_INVALIDATED', 'RESET_PASSWORD'];
        if (criticalActions.includes(data.action) || data.action.includes('FAILED')) {
          await sendTelegram(ADMIN_TELEGRAM_CHAT_ID,
            `🚨 *${data.action}*\n` +
            `User: ${data.userId || 'unknown'}\n` +
            `IP: ${data.req.ip}\n` +
            `Resource: ${data.resource}\n` +
            `Success: ${data.success}\n` +
            `${data.errorMessage ? `Error: ${data.errorMessage}` : ''}`
          ).catch(() => {});
        }
      }
    } catch (err) {
      console.error('❌ Audit log exception:', err);
    }
  })();
}