// ============================================================================
// auth.ts — Admin authentication routes (register, login, 2FA, refresh, logout, etc.)
// ============================================================================
import { Router, Request, Response } from 'express';
import { randomBytes, timingSafeEqual, createHash } from 'crypto';
import crypto from 'crypto';

import jwt from 'jsonwebtoken';
import {
  register,
  hashPassword,
  logoutUser,
  validateSession,
  verifyPassword,
  generate2FACode,
  createAndStoreSession,
  renewSession,            // NEW – for in‑place session renewal on refresh
  adminExists,
} from '../../services/auth-service.js';
import {
  REFRESH_COOKIE_OPTIONS,
  CSRF_COOKIE_OPTIONS,
  setRefreshAndCsrfCookies,
  clearAuthCookies,
  clearAccessCookies,
} from '../../lib/auth-cookies.js';
import {
  generateAccessToken,
  generateRefreshToken,
  validateRefreshToken,
  rotateRefreshToken,
  revokeRefreshFamily,
  revokeAllUserTokens,
  updateFamilyAccessTokenJti,  
} from '../../services/token-service.js';
import { generateCsrfToken } from '../../lib/security/csrf.js';
import { loginSchema, registerSchema, verify2FASchema, resetPasswordSchema } from '../../lib/validators/auth.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import redis from '../../lib/redis.js';
import { sendEmail, send2FACodeEmail } from '../../services/notification-service.js';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { sendTelegram } from '../../services/notification-service.js';
import { decrypt } from '../../lib/encryption.js';
const DEBUG = process.env.DEBUG_AUTH === 'true';

const ADMIN_TELEGRAM_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID;

const JWT_SECRET = process.env.JWT_SECRET!;
const SESSION_TTL_SECONDS = 30 * 60;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

const router = Router();

// Rate limiters
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5, keyPrefix: 'ratelimit:admin-login' });
const registerLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 1, keyPrefix: 'ratelimit:admin-register' });
const twoFALimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 5, keyPrefix: 'ratelimit:admin-2fa' });
const forgotLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 3, keyPrefix: 'ratelimit:admin-forgot' });
const resetLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5, keyPrefix: 'ratelimit:admin-reset' });
const resendLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 3, keyPrefix: 'ratelimit:admin-resend' });
const sessionInfoLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 10, keyPrefix: 'ratelimit:admin-session-info' });
const resetSessionInfoLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 10, keyPrefix: 'ratelimit:admin-reset-session-info' });
const statusLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 60, keyPrefix: 'ratelimit:admin-status' });
const refreshLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 10, keyPrefix: 'ratelimit:admin-refresh' });
const lockCodeLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, maxRequests: 5, keyPrefix: 'ratelimit:admin-lock-code' });
const TWO_FA_SESSION_TTL = 15 * 60;
const TWO_FA_CODE_TTL = 5 * 60;
const RESET_SESSION_TTL = 15 * 60;
const RESET_CODE_TTL = 5 * 60;

// Helper: full issuance of a fresh access+refresh+csrf triple for login/2FA.
async function issueFullSession(
  res: Response,
  user: { id: string; email: string; role: string; passwordChangedAt: string },
  req: Request,
  geo: any
) {
  if (DEBUG) console.log('[ISSUE_FULL] geo received:', geo);

  const sessionId = await createAndStoreSession(user.id, req, geo, {
    tailscaleIP: (req as any).tailscaleClientIP,
  });
  const csrfToken = generateCsrfToken();
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    sessionId,
    tailscaleIP: (req as any).tailscaleClientIP,
    csrfToken,
    passwordEpoch: new Date(user.passwordChangedAt).getTime().toString(),
  });
     const { token: refreshToken, familyId } = await generateRefreshToken(
    user.id,
    new Date(user.passwordChangedAt).getTime().toString(),
    sessionId,
    geo || null
  );

  // Audit-link: write the JTI of the access token back to the refresh family.
  // Best-effort, non-blocking. We have the familyId directly from generateRefreshToken.
  try {
    const decoded = jwt.decode(accessToken) as { jti?: string } | null;
    if (decoded?.jti) {
      await updateFamilyAccessTokenJti(familyId, decoded.jti);
    }
  } catch (err) {
    console.error('[ISSUE_FULL] JTI writeback failed (non-fatal):', err);
  }

  setRefreshAndCsrfCookies(res, refreshToken, csrfToken);
  return { sessionId, accessToken, refreshToken, csrfToken };
}

// POST /api/admin/auth/register
router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const hasAdmin = await adminExists();
    if (hasAdmin) {
      logAudit({ action: 'REGISTER_FAILED', resource: 'User', req, success: false, metadata: { reason: 'Admin already exists', email: req.body.email } });
      return res.status(403).json({ error: 'Registration disabled. System already has an administrator.' });
    }

    const validated = registerSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ error: 'Validation failed', details: validated.error.errors.map(e => e.message).join(', ') });
    }
    const { email, password } = validated.data;

    const user = await register({ email, password, role: 'ADMIN' });
    logAudit({ userId: user.id, action: 'REGISTER', resource: 'User', resourceId: user.id, req, success: true, metadata: { email: user.email, role: 'ADMIN' } });
    res.status(201).json({ success: true, user: { id: user.id, email: user.email, role: 'ADMIN' }, message: 'Admin account created. You are the system administrator.' });
  } catch (error) {
    if ((error as Error).message === 'Email already registered') {
      logAudit({ action: 'REGISTER_FAILED', resource: 'User', req, success: false, metadata: { reason: 'Email already registered' } });
      return res.status(409).json({ error: 'Email already registered' });
    }
    next(error as Error);
  }
});

// POST /api/admin/auth/login
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const validated = loginSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ error: 'Validation failed', details: validated.error.errors.map(e => e.message).join(', ') });
    }
    const { email, password, geo } = validated.data;

    const { data: user, error: userErr } = await supabase
      .from('User')
      .select('id, email, role, passwordHash, twoFactorEnabled, passwordChangedAt')
      .eq('email', email)
      .single();

    if (userErr && userErr.code !== 'PGRST116') {
      console.error('[LOGIN] Supabase lookup failed:', userErr);
      return res.status(503).json({ error: 'Service temporarily unavailable, please try again' });
    }
    const DUMMY_HASH = '$2b$12$invalidhashinvalidhashinvalidhashinvalidha';
    const valid = await verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);

    if (!user || !valid) {
      const failKey = `login_fails:${email}`;
      const fails = await redis.incr(failKey);
      await redis.expire(failKey, 900);

      logAudit({ action: 'LOGIN_FAILED', resource: 'User', req, success: false, metadata: { email } });

      if (fails >= 3 && process.env.ADMIN_TELEGRAM_CHAT_ID) {
        await sendTelegram(process.env.ADMIN_TELEGRAM_CHAT_ID,
          `⚠️ *Multiple failed login attempts*\n` +
          `Email: ${email}\n` +
          `IP: ${req.ip}\n` +
          `UA: ${req.headers['user-agent']?.substring(0, 100)}`
        ).catch(() => {});
      }

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.twoFactorEnabled) {
      const sessionId = randomBytes(16).toString('hex');
      const code = generate2FACode();
      const sessionData = { userId: user.id, email: user.email, role: user.role, geo: geo || null, createdAt: Date.now() };

      await redis.setex(`2fa:${sessionId}`, TWO_FA_SESSION_TTL, JSON.stringify(sessionData));
      await redis.setex(`2fa_code:${sessionId}`, TWO_FA_CODE_TTL, code);
      await redis.setex(`2fa_attempts:${sessionId}`, TWO_FA_SESSION_TTL, '0');

      await send2FACodeEmail(user.email, code);
      logAudit({ userId: user.id, action: 'LOGIN_2FA_REQUIRED', resource: 'User', req, success: true });
      return res.json({ requires2FA: true, sessionId });
    }
       if (DEBUG) console.log('[LOGIN] about to issue full session, user:', user.id);

    const { accessToken } = await issueFullSession(res, user, req, geo || null);
    await supabase.from('User').update({ lastLoginAt: new Date().toISOString() }).eq('id', user.id);
    logAudit({ userId: user.id, action: 'LOGIN', resource: 'User', req, success: true });

    res.json({
      success: true,
      accessToken,   // ← required for in‑memory token storage
      user: { id: user.id, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('[LOGIN] Unexpected error:', error);
    next(error as Error);
  }
});

// POST /api/admin/auth/verify-2fa
router.post('/verify-2fa', twoFALimiter, async (req, res, next) => {
  try {
    const validated = verify2FASchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ error: 'Invalid request', details: validated.error.errors.map(e => e.message).join(', ') });
    }
    const { sessionId, code } = validated.data;

    const sessionDataStr = await redis.get(`2fa:${sessionId}`);
    if (!sessionDataStr) {
      return res.status(410).json({ error: '2FA session expired' });
    }
    const sessionData = JSON.parse(sessionDataStr);

    const attemptsKey = `2fa_attempts:${sessionId}`;
    const attempts = parseInt((await redis.get(attemptsKey)) || '0');

    if (attempts >= 3) {
      await redis.del(`2fa:${sessionId}`);
      await redis.del(`2fa_code:${sessionId}`);
      await redis.del(attemptsKey);
      return res.status(429).json({ error: 'Too many attempts. Please login again.' });
    }

    const storedCode = await redis.get(`2fa_code:${sessionId}`);
    if (!storedCode || storedCode !== code) {
      await redis.incr(attemptsKey);
      return res.status(400).json({ error: 'Invalid code' });
    }

    await redis.del(`2fa:${sessionId}`);
    await redis.del(`2fa_code:${sessionId}`);
    await redis.del(attemptsKey);

    const { data: user } = await supabase
      .from('User')
      .select('id, email, role, passwordChangedAt')
      .eq('id', sessionData.userId)
      .single();

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
      const { accessToken } = await issueFullSession(res, user, req, sessionData.geo);
    logAudit({ userId: sessionData.userId, action: 'VERIFY_2FA_SUCCESS', resource: 'User', req, success: true });
    res.json({
      success: true,
      accessToken,   // ← required for in‑memory token storage
      user: { id: sessionData.userId, email: sessionData.email, role: sessionData.role }
    });
     } catch (error) {
    console.error('[2FA] Unexpected error:', error);
    next(error as Error);
  }
});

// ----------------------------------------------------------------------
// POST /api/admin/auth/refresh
//
// THE FIX: refresh now RENEWS the existing session in place instead of
// deleting and creating a new one. The refresh family contains the
// sessionId, so we know which session to extend.
// ----------------------------------------------------------------------
router.post('/refresh', refreshLimiter, async (req, res, next) => {
  if (DEBUG) {
    console.log('[REFRESH] called');
    console.log('[REFRESH] refreshToken cookie present:', !!req.cookies?.refreshToken);
  }
  try {
    const presentedToken = req.cookies?.refreshToken;
    if (DEBUG) console.log('refresh  :', presentedToken);
    if (!presentedToken) {
      clearAuthCookies(res);
      if (DEBUG) console.log('refresh  : no presented token');
      return res.status(401).json({ error: 'Refresh token missing' });
    }

    // ── Validate (returns a typed result, never throws for store errors) ──
    const validation = await validateRefreshToken(presentedToken);

    // ── Store unreachable – 503, do NOT clear cookies or revoke family ──
    if (validation.kind === 'store_unreachable') {
      console.warn('[REFRESH] auth stores unavailable, returning 503:', validation.storeErrors);
      return res.status(503).json({
        error: 'auth_stores_unavailable',
        message: 'Authentication services temporarily unavailable, please retry',
        storeErrors: validation.storeErrors,
        retryAfter: 5,
      });
    }

    // ── Invalid token – hard logout ──────────────────────────────
    if (validation.kind === 'invalid') {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // ── Reused or password changed – revoke family, hard logout ──
    if (validation.kind === 'reused' || validation.kind === 'password_changed') {
      await revokeRefreshFamily(validation.familyId);
      clearAuthCookies(res);
      logAudit({
        userId: validation.userId,
        action: validation.kind === 'password_changed'
          ? 'REFRESH_TOKEN_PASSWORD_CHANGED'
          : 'REFRESH_TOKEN_REUSE_DETECTED',
        resource: 'User',
        req,
        success: false,
      });
      const code = validation.kind === 'password_changed' ? 'PASSWORD_CHANGED' : 'TOKEN_REUSE';
      return res.status(401).json({ error: 'Session invalidated. Please log in again.', code });
    }

    // ── User lookup (additional check) ────────────────────────────
    const { data: user, error: userErr } = await supabase
      .from('User')
      .select('id, email, role')
      .eq('id', validation.userId)
      .single();
    if (userErr && userErr.code !== 'PGRST116') {
      // Supabase is down – don't logout, return 503
      console.warn('[REFRESH] user lookup failed, returning 503:', userErr);
      return res.status(503).json({
        error: 'auth_stores_unavailable',
        message: 'Authentication services temporarily unavailable, please retry',
        retryAfter: 5,
      });
    }
    if (!user) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'User no longer exists' });
    }

    const familyGeo = (validation as any).geoLocation || null;
    const ownedSessionId = (validation as any).sessionId as string | undefined;

    if (!ownedSessionId) {
      await revokeRefreshFamily(validation.familyId);
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Session invalidated. Please log in again.', code: 'LEGACY_TOKEN' });
    }

    // ── Rotate BEFORE renewing session (avoids orphan session) ──
    let newRefreshToken: string | null = null;
    if (validation.kind === 'fresh') {
      newRefreshToken = await rotateRefreshToken(validation.familyId, presentedToken);
      if (!newRefreshToken) {
        // Race: another request rotated first. Re-validate with fallback.
        let revalidation: any = await validateRefreshToken(presentedToken);
        if (revalidation.kind === 'invalid') {
          try {
            let famRaw = await redis.get(`refresh_family:${validation.familyId}`);
            if (!famRaw) {
              const { data: row } = await supabase
                .from('RefreshToken')
                .select('familyData')
                .eq('familyId', validation.familyId)
                .is('revokedAt', null)
                .maybeSingle();
              if (row?.familyData) {
                famRaw = JSON.stringify(row.familyData);
              }
            }
            if (famRaw) {
              const fam = JSON.parse(famRaw);
              if (
                fam.previousToken === presentedToken &&
                fam.previousExpiresAt &&
                Date.now() < fam.previousExpiresAt
              ) {
                revalidation = {
                  kind: 'retry',
                  userId: fam.userId,
                  familyId: fam.familyId,
                  sessionId: fam.sessionId,
                  reissueToken: fam.currentToken,
                  passwordUpdatedAt: fam.passwordUpdatedAt,
                };
              }
            }
          } catch {
            // ignore fallback failure – fall through to default handling
          }
        }
        if (revalidation.kind === 'retry') {
          newRefreshToken = (revalidation as any).reissueToken;
        } else if (revalidation.kind === 'fresh') {
          newRefreshToken = await rotateRefreshToken(validation.familyId, presentedToken);
          if (!newRefreshToken) {
            clearAuthCookies(res);
            return res.status(401).json({ error: 'Session invalidated. Please log in again.' });
          }
        } else if (revalidation.kind === 'store_unreachable') {
          return res.status(503).json({
            error: 'auth_stores_unavailable',
            message: 'Authentication services temporarily unavailable, please retry',
            retryAfter: 5,
          });
        } else {
          clearAuthCookies(res);
          return res.status(401).json({ error: 'Session invalidated. Please log in again.' });
        }
      }
    }

    // ── RENEW the existing session in place (never delete/recreate) ──
    try {
      const renewed = await renewSession(ownedSessionId, req, familyGeo);
      if (!renewed) {
        await revokeRefreshFamily(validation.familyId);
        clearAuthCookies(res);
        return res.status(401).json({ error: 'Session no longer exists. Please log in again.', code: 'SESSION_GONE' });
      }

            const csrfToken = generateCsrfToken();
      const accessToken = generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        sessionId: ownedSessionId,
        tailscaleIP: (req as any).tailscaleClientIP,
        csrfToken,
        passwordEpoch: validation.passwordUpdatedAt,
      });

      // Audit-link: write the JTI of the access token we just issued back
      // to the refresh family record. Best-effort, non-blocking.
      try {
        const decoded = jwt.decode(accessToken) as { jti?: string } | null;
        if (decoded?.jti) {
          await updateFamilyAccessTokenJti(validation.familyId, decoded.jti);
        }
      } catch (err) {
        console.error('[REFRESH] JTI writeback failed (non-fatal):', err);
      }

      if (validation.kind === 'retry' || (validation.kind === 'fresh' && newRefreshToken)) {
        const finalRefreshToken = validation.kind === 'retry'
          ? (validation as any).reissueToken
          : newRefreshToken!;
        setRefreshAndCsrfCookies(res, finalRefreshToken, csrfToken);

        logAudit({
          userId: user.id,
          action: validation.kind === 'retry' ? 'TOKEN_REFRESH_RETRY' : 'TOKEN_REFRESH',
          resource: 'User', req, success: true,
        });
        if (DEBUG) console.log('[REFRESH] session renewed successfully, sessionId:', ownedSessionId);
        return res.json({
          success: true,
          accessToken,
          csrfToken,
          user: { id: user.id, email: user.email, role: user.role }
        });
      }
    } catch (err) {
      // Backward-compat safety net
      if (err instanceof Error && err.message === 'SESSION_CHECK_UNAVAILABLE') {
        return res.status(503).json({
          error: 'auth_stores_unavailable',
          message: 'Authentication services temporarily unavailable, please retry',
          retryAfter: 5,
        });
      }
      console.error('[REFRESH] Transient error during session renewal:', err);
      return res.status(503).json({
        error: 'auth_stores_unavailable',
        message: 'Authentication services temporarily unavailable, please retry',
        retryAfter: 5,
      });
    }
  } catch (error) {
    // Backward-compat safety net
    if (error instanceof Error && error.message === 'SESSION_CHECK_UNAVAILABLE') {
      return res.status(503).json({
        error: 'auth_stores_unavailable',
        message: 'Authentication services temporarily unavailable, please retry',
        retryAfter: 5,
      });
    }
    // Genuinely unexpected error – log it, return 503 with retry, don't logout.
    console.error('[REFRESH] Unexpected error:', error);
    return res.status(503).json({
      error: 'auth_stores_unavailable',
      message: 'Service temporarily unavailable, please retry',
      retryAfter: 5,
    });
  }
});

// POST /api/admin/auth/logout
router.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        await logoutUser(decoded.userId, decoded.sessionId);
        await revokeAllUserTokens(decoded.userId);
        logAudit({ userId: decoded.userId, action: 'LOGOUT', resource: 'User', req, success: true });
      } catch (err) {
        // Server-side cleanup failed. Clear cookies anyway (user expects it),
        // but warn the client. The session may still be valid server-side.
        console.error('[LOGOUT] Cleanup failed (cookies cleared, but session may persist):', err);
        clearAuthCookies(res);
        return res.status(503).json({
          success: false,
          warning: 'Logout may be incomplete. Please clear your browser data.',
        });
      }
    }
    clearAuthCookies(res);
    res.json({ success: true });
  } catch (error) {
    next(error as Error);
  }
});

// GET /api/admin/auth/me
router.get('/me', authenticate, requireAdmin, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('User')
      .select('id, email, role, fullName')
      .eq('id', req.user!.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: { ...user, tailscaleIp: req.user!.tailscaleIP } });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/auth/verify-lock-code
router.post('/verify-lock-code', lockCodeLimiter, authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });

  const { data: codeData } = await supabase
    .from('SecretCode').select('code').eq('purpose', 'lock_delete').maybeSingle();
  if (!codeData?.code) return res.status(400).json({ error: 'No lock code configured' });

  let plain: string;
  try { plain = decrypt(codeData.code); }
  catch { return res.status(500).json({ error: 'Failed to verify code' }); }

 const a = crypto.createHash('sha256').update(String(code)).digest();

const b = crypto.createHash('sha256').update(String(plain)).digest();
  if (!crypto.timingSafeEqual(a, b))

  return res.status(400).json({ error: 'Invalid code' });
  res.json({ success: true });
});

// ----------------------------------------------------------------------
// GET /api/admin/auth/status
// Read‑only – no mutation, no cookie clearing, no forced logout.
// ----------------------------------------------------------------------
router.get('/status', statusLimiter, async (req, res) => {
  try {
        const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    const csrfCookie = req.cookies?.csrf_token;
    const refreshTokenCookie = req.cookies?.refreshToken;
    if (DEBUG) {
      console.log('[STATUS] token present:', !!token);
      console.log('[STATUS] csrfCookie present:', !!csrfCookie);
      console.log('[STATUS] refreshTokenCookie present:', !!refreshTokenCookie);
    }
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        const valid = await validateSession(decoded.sessionId, req);

        const csrfOk =
          !!csrfCookie &&
          Buffer.byteLength(String(csrfCookie)) === Buffer.byteLength(String(decoded.csrfToken)) &&
          timingSafeEqual(Buffer.from(String(csrfCookie)), Buffer.from(String(decoded.csrfToken)));
        const refreshPresent = !!refreshTokenCookie;

        if (valid && csrfOk && refreshPresent) {
          return res.json({
            user: { id: decoded.userId, email: decoded.email, role: decoded.role },
          });
        }

               if (refreshTokenCookie) {
          res.clearCookie('token', REFRESH_COOKIE_OPTIONS);
          res.clearCookie('csrf_token', CSRF_COOKIE_OPTIONS);
        } else {
          clearAuthCookies(res);
        }
        return res.json({ user: null });
      } catch (err) {
        console.warn('[STATUS] Token verification failed:', (err as Error).message);
        if (refreshTokenCookie) {
          res.clearCookie('token', REFRESH_COOKIE_OPTIONS);
          res.clearCookie('csrf_token', CSRF_COOKIE_OPTIONS);
        } else {
          clearAuthCookies(res);
        }
        return res.json({ user: null });
      }
    }

    return res.json({ user: null });
  } catch (err) {
    console.error('[STATUS] Unexpected error:', err);
    return res.json({ user: null });
  }
});

// GET /2fa-session-info
router.get('/2fa-session-info', sessionInfoLimiter, async (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId || typeof sessionId !== 'string') return res.status(400).json({ error: 'sessionId required' });

  const sessionTTL = await redis.ttl(`2fa:${sessionId}`);
  if (sessionTTL <= 0) return res.status(410).json({ error: 'Session expired' });

  const codeTTL = await redis.ttl(`2fa_code:${sessionId}`);
  res.json({ sessionRemaining: sessionTTL, codeRemaining: codeTTL > 0 ? codeTTL : 0 });
});

// POST /api/admin/auth/forgot-password
router.post('/forgot-password', forgotLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { data: user } = await supabase.from('User').select('id, email').eq('email', email).eq('role', 'ADMIN').single();
    if (!user) return res.json({ success: true, message: 'If an account exists, a reset code will be sent.' });

    const code = generate2FACode();
    const sessionData = { userId: user.id, email: user.email };
    await redis.setex(`reset:${email}`, RESET_SESSION_TTL, JSON.stringify(sessionData));
    await redis.setex(`reset_code:${email}`, 5 * 60, code);
    await redis.setex(`reset_attempts:${email}`, RESET_SESSION_TTL, '0');
    await sendEmail(user.email, 'Password Reset Code', 'password-reset', { code });
    if (ADMIN_TELEGRAM_CHAT_ID) {
      await sendTelegram(ADMIN_TELEGRAM_CHAT_ID,
        `🔐 *Password reset requested*\nAdmin: ${user.email}\nIP: ${req.ip}`
      ).catch(() => {});
    }
    logAudit({ userId: user.id, action: 'FORGOT_PASSWORD', resource: 'User', req, success: true });
    res.json({ success: true, message: 'If an account exists, a reset code will be sent.' });
  } catch (error) {
    next(error as Error);
  }
});

// POST /api/admin/auth/reset-password
router.post('/reset-password', resetLimiter, async (req, res, next) => {
  try {
    const validated = resetPasswordSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validated.error.errors.map(e => e.message).join(', ')
      });
    }
    const { email, code, newPassword } = validated.data;

    const sessionStr = await redis.get(`reset:${email}`);
    if (!sessionStr) {
      return res.status(410).json({ error: 'Reset session expired. Please request a new code.' });
    }

    const attemptsKey = `reset_attempts:${email}`;
    const attempts = parseInt((await redis.get(attemptsKey)) || '0');
    if (attempts >= 3) {
      await redis.del(`reset:${email}`);
      await redis.del(`reset_code:${email}`);
      await redis.del(attemptsKey);
      return res.status(429).json({ error: 'Too many attempts. Please request a new code.' });
    }

    const storedCode = await redis.get(`reset_code:${email}`);
    if (!storedCode || storedCode !== code) {
      await redis.incr(attemptsKey);
      return res.status(400).json({ error: 'Invalid code' });
    }

    const { userId } = JSON.parse(sessionStr);
    const passwordHash = await hashPassword(newPassword);
    const now = new Date().toISOString();
    await supabase.from('User').update({ passwordHash, updatedAt: now, passwordChangedAt: now }).eq('id', userId);
    await redis.del(`reset:${email}`);
    await redis.del(`reset_code:${email}`);
    await redis.del(attemptsKey);
    await revokeAllUserTokens(userId);

    logAudit({ userId, action: 'RESET_PASSWORD', resource: 'User', req, success: true });
    if (ADMIN_TELEGRAM_CHAT_ID) {
      await sendTelegram(ADMIN_TELEGRAM_CHAT_ID,
        `✅ *Password reset*\nUser: ${email}\nIP: ${req.ip}`
      ).catch(() => {});
    }
    res.json({ success: true, message: 'Password updated. Please log in again.' });
  } catch (error) {
    next(error as Error);
  }
});

// POST /api/admin/auth/resend-2fa
router.post('/resend-2fa', resendLimiter, async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const sessionDataStr = await redis.get(`2fa:${sessionId}`);
    if (!sessionDataStr) return res.status(410).json({ error: '2FA session expired' });

    const sessionData = JSON.parse(sessionDataStr);
    const newCode = generate2FACode();
    await redis.setex(`2fa_code:${sessionId}`, 5 * 60, newCode);
    await redis.setex(`2fa_attempts:${sessionId}`, 5 * 60, '0');
    await send2FACodeEmail(sessionData.email, newCode);
    if (ADMIN_TELEGRAM_CHAT_ID) {
      await sendTelegram(ADMIN_TELEGRAM_CHAT_ID,
        `🔄 *2FA code resent*\nEmail: ${sessionData.email}\nIP: ${req.ip}`
      ).catch(() => {});
    }
    res.json({ success: true, message: 'New code sent' });
  } catch (error) {
    next(error as Error);
  }
});

// POST /api/admin/auth/resend-reset-code
router.post('/resend-reset-code', resendLimiter, async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const sessionStr = await redis.get(`reset:${email}`);
    if (!sessionStr) return res.status(410).json({ error: 'Reset session expired. Please request a new code.' });

    const newCode = generate2FACode();
    await redis.setex(`reset_code:${email}`, RESET_CODE_TTL, newCode);
    await redis.setex(`reset_attempts:${email}`, RESET_SESSION_TTL, '0');
    await sendEmail(email, 'New Password Reset Code', 'password-reset', { code: newCode });
    if (ADMIN_TELEGRAM_CHAT_ID) {
      await sendTelegram(ADMIN_TELEGRAM_CHAT_ID,
        `🔄 *Reset code resent*\nEmail: ${email}\nIP: ${req.ip}`
      ).catch(() => {});
    }
    res.json({ success: true, message: 'New reset code sent' });
  } catch (error) {
    next(error as Error);
  }
});

// GET /reset-session-info
router.get('/reset-session-info', resetSessionInfoLimiter, async (req, res) => {
  const { email } = req.query;
  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'email required' });

  const sessionTTL = await redis.ttl(`reset:${email}`);
  if (sessionTTL <= 0) return res.status(410).json({ error: 'Session expired' });

  const codeTTL = await redis.ttl(`reset_code:${email}`);
  res.json({ sessionRemaining: sessionTTL, codeRemaining: codeTTL > 0 ? codeTTL : 0 });
});

export default router;