import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { hashPassword } from '../../services/auth-service.js';
import { revokeAllUserTokens } from '../../services/token-service.js';
import { sendEmail } from '../../services/notification-service.js';
import { generateFingerprint, extractFromRequest } from '../../lib/security/device-fingerprint.js';
import redis from '../../lib/redis.js';
import crypto from 'crypto';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:profile' });
router.use(limiter);

const sendCodeLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 3, keyPrefix: 'ratelimit:admin:profile-sendcode' });
const unlockLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 5, keyPrefix: 'ratelimit:admin:profile-unlock' });
// Timing-safe string comparison (hashes to fixed length so length isn't leaked)
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const MAX_CODE_ATTEMPTS = 5;
const TOKEN_SECRET = process.env.JWT_SECRET!;
const UNLOCK_TTL = 15 * 60; // 15 minutes

// ── Token helpers ────────────────────────────────────────────
function generateUnlockToken(payload: {
  userId: string;
  ip: string;
  ua: string;
  fingerprint: string;
  expiresAt: number;
}): string {
  const data = `${payload.userId}|${payload.ip}|${payload.ua}|${payload.fingerprint}|${payload.expiresAt}`;
  const hmac = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('hex');
  return hmac + '.' + Buffer.from(data).toString('base64url');
}

function verifyUnlockToken(token: string): {
  userId: string;
  ip: string;
  ua: string;
  fingerprint: string;
  expiresAt: number;
} | null {
  const [hmac, payloadBase64] = token.split('.');
  if (!hmac || !payloadBase64) return null;

  let payloadStr: string;
  try {
    payloadStr = Buffer.from(payloadBase64, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const validHmac = crypto.createHmac('sha256', TOKEN_SECRET).update(payloadStr).digest('hex');
  if (hmac !== validHmac) return null;

  const parts = payloadStr.split('|');
  if (parts.length !== 5) return null;

  const [userId, ip, ua, fingerprint, expiresAtStr] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);
  if (Date.now() > expiresAt) return null;

  return { userId, ip, ua, fingerprint, expiresAt };
}

// ── GET profile ──────────────────────────────────────────────
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('User')
    .select('id, email, fullName, twoFactorEnabled, lastLoginAt')
    .eq('id', req.user!.id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'User not found' });
  res.json(data);
});

// ── POST /unlock (get a temporary edit token) ────────────────
router.post('/unlock', authenticate, requireAdmin, csrfProtection, unlockLimiter, verifyDeleteCode, async (req, res) => {
  const userId = req.user!.id;
  const ip = req.ip;
  const ua = req.headers['user-agent'] || '';
  const fingerprint = generateFingerprint(extractFromRequest(req));

  const expiresAt = Date.now() + UNLOCK_TTL * 1000;
  const token = generateUnlockToken({ userId, ip, ua, fingerprint, expiresAt });

  await redis.setex(`profile_unlock:${userId}`, UNLOCK_TTL, token);

  logAudit({
    userId,
    action: 'UNLOCK_PROFILE',
    resource: 'User',
    resourceId: userId,
    req,
    success: true,
  });

  res.json({
    token,
    expiresAt: new Date(expiresAt).toISOString(),
    ttlSeconds: UNLOCK_TTL,
  });
});

// ── POST /send-code (unchanged) ─────────────────────────────
router.post('/send-code', authenticate, requireAdmin, sendCodeLimiter, async (req, res) => {
  const { data: user } = await supabase
    .from('User')
    .select('email')
    .eq('id', req.user!.id)
    .single();

  if (!user) return res.status(404).json({ error: 'User not found' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  await redis.setex(`email_code:${req.user!.id}`, 5 * 60, code);
  await sendEmail(user.email, 'Verification Code', 'password-reset', { code });

  res.json({ success: true, message: 'Code sent' });
});
// POST /send-code-new — send a verification code to the NEW email (email-change only)
router.post('/send-code-new', authenticate, requireAdmin, csrfProtection, sendCodeLimiter, async (req, res) => {
  const parsed = z.object({ newEmail: z.string().email('Valid new email required') }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const { newEmail } = parsed.data;

  const { data: user } = await supabase.from('User').select('email').eq('id', req.user!.id).single();
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (newEmail.toLowerCase() === user.email.toLowerCase()) {
    return res.status(400).json({ error: 'New email must differ from the current email' });
  }

  const code = crypto.randomInt(100000, 1000000).toString();
  // Bind the code to the specific new email so it can't be reused for a different address
  await redis.setex(`email_code_new:${req.user!.id}`, 5 * 60, JSON.stringify({ code, newEmail: newEmail.toLowerCase() }));
  await sendEmail(newEmail, 'Confirm your new email address', 'email-change', {
    code,
    message: 'Confirm this NEW email address for your account.',
  });

  logAudit({ userId: req.user!.id, action: 'SEND_NEW_EMAIL_CODE', resource: 'User', resourceId: req.user!.id, req, success: true });
  res.json({ success: true });
});
// ── PUT / (profile update – requires unlock token + email code) ─
router.put('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const schema = z.object({
    email: z.string().email().optional(),
    fullName: z.string().min(1).optional(),
    password: z.string().min(8).optional(),
    twoFactorEnabled: z.boolean().optional(),
    emailCode: z.string().length(6, 'Email code must be 6 digits'),       // always required
    newEmailCode: z.string().length(6).optional(),                         // required only on email change
    token: z.string().min(1, 'Unlock token required'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { email, fullName, password, twoFactorEnabled, emailCode, newEmailCode, token } = parsed.data;

  // 1. Verify unlock token (HMAC)
  const unlockData = verifyUnlockToken(token);
  if (!unlockData) return res.status(401).json({ error: 'Invalid or expired unlock token' });

  // 2. Redis single-use check
  const storedToken = await redis.get(`profile_unlock:${req.user!.id}`);
  if (!storedToken || storedToken !== token) return res.status(401).json({ error: 'Unlock token already used or invalid' });

  // 3. Device binding
  const currentIp = req.ip;
  const currentUa = req.headers['user-agent'] || '';
  const currentFingerprint = generateFingerprint(extractFromRequest(req));
  if (unlockData.ip !== currentIp || unlockData.ua !== currentUa || unlockData.fingerprint !== currentFingerprint) {
    return res.status(401).json({ error: 'Unlock token is bound to a different device or network' });
  }

  // Current email from DB (to detect a change)
  const { data: currentUser } = await supabase.from('User').select('email').eq('id', req.user!.id).single();
  if (!currentUser) return res.status(404).json({ error: 'User not found' });

    const emailChanging = !!email && email.toLowerCase() !== currentUser.email.toLowerCase();

  // ── Verify code sent to the CURRENT/old email (always required) ──
  const codeKey = `email_code:${req.user!.id}`;
  const codeAttemptsKey = `email_code_attempts:${req.user!.id}`;

  let attempts = parseInt((await redis.get(codeAttemptsKey)) || '0', 10);
  if (attempts >= MAX_CODE_ATTEMPTS) {
    await redis.del(codeKey);
    await redis.del(codeAttemptsKey);
    return res.status(429).json({ error: 'Too many code attempts. Request a new code.' });
  }

  const storedCode = await redis.get(codeKey);
  if (!storedCode || !safeEqual(storedCode, emailCode)) {
    await redis.incr(codeAttemptsKey);
    await redis.expire(codeAttemptsKey, 5 * 60);
    return res.status(400).json({ error: 'Invalid or expired email code' });
  }

  // ── If changing email, ALSO verify the code sent to the NEW address ──
  if (emailChanging) {
    if (!newEmailCode) return res.status(400).json({ error: 'New email code required to change email' });

    const newCodeKey = `email_code_new:${req.user!.id}`;
    const newAttemptsKey = `email_code_new_attempts:${req.user!.id}`;

    let newAttempts = parseInt((await redis.get(newAttemptsKey)) || '0', 10);
    if (newAttempts >= MAX_CODE_ATTEMPTS) {
      await redis.del(newCodeKey);
      await redis.del(newAttemptsKey);
      return res.status(429).json({ error: 'Too many code attempts. Request a new code.' });
    }

    const rawNew = await redis.get(newCodeKey);
    let storedNew: { code: string; newEmail: string } | null = null;
    try { storedNew = rawNew ? JSON.parse(rawNew) : null; } catch { storedNew = null; }

    if (!storedNew || !safeEqual(storedNew.code, newEmailCode) || storedNew.newEmail !== email!.toLowerCase()) {
      await redis.incr(newAttemptsKey);
      await redis.expire(newAttemptsKey, 5 * 60);
      return res.status(400).json({ error: 'Invalid or expired new email code' });
    }

    await redis.del(newAttemptsKey);
    await redis.del(newCodeKey);
  }

  // Consume the standard code only after everything passed
  await redis.del(codeAttemptsKey);
  await redis.del(codeKey);

  // 5. Build updates
  const updates: Record<string, any> = {};
  if (emailChanging) updates.email = email;
  if (fullName !== undefined) updates.fullName = fullName;
  if (twoFactorEnabled !== undefined) updates.twoFactorEnabled = twoFactorEnabled;
  if (password) {
    updates.passwordHash = await hashPassword(password);
    updates.passwordChangedAt = new Date().toISOString();
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });

  // 6. Apply
  const { error } = await supabase.from('User').update(updates).eq('id', req.user!.id);
  if (error) return res.status(500).json({ error: 'Operation failed' });

  // 7. Revoke sessions if password changed
  if (password) await revokeAllUserTokens(req.user!.id);

  // 8. Consume unlock token (single-use)

  logAudit({ userId: req.user!.id, action: 'UPDATE', resource: 'User', resourceId: req.user!.id, req, success: true, metadata: { emailChanged: emailChanging } });
  res.json({ success: true });
});

export default router;