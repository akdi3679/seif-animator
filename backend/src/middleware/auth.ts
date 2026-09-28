// ============================================================================
// auth.ts — Unified authentication & authorization middleware
// Replaces: admin-auth.ts + authenticateToken/requireAdmin/verifyCsrf files.
// Provides: authenticate, requireAdmin, csrfProtection.
//
// THE FIX: Distinguishes "definitely compromised" (hard revoke) from
// "looks like infra/transient issue" (soft 401). Prevents random logouts
// due to network blips, dropped cookies, or Tailscale extraction failures.
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { verifyToken, validateSession, logoutUser } from '../services/auth-service.js';
import { validateRefreshToken, revokeAllUserTokens } from '../services/token-service.js';
import crypto from 'crypto';
import { clearAuthCookies, clearAccessCookies } from '../lib/auth-cookies.js';

const DEBUG = process.env.DEBUG_AUTH === 'true';

// ---------- Refresh token validation cache (per‑process only) ----------
const refreshCache = new Map<string, { kind: string; expiresAt: number }>();
const CACHE_TTL_MS = 3_000;
const MAX_CACHE_SIZE = 500;

async function validateRefreshCached(token: string) {
  const cached = refreshCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.kind;

  const result = await validateRefreshToken(token);
  const entry = { kind: result.kind, expiresAt: Date.now() + CACHE_TTL_MS };
  refreshCache.set(token, entry);

  if (refreshCache.size > MAX_CACHE_SIZE) {
    const entries = [...refreshCache.entries()];
    entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const toDelete = entries.slice(0, Math.floor(entries.length / 2));
    for (const [key] of toDelete) refreshCache.delete(key);
  }

  return result.kind;
}

// ── Soft vs Hard helpers ────────────────────────────────────────
async function softUnauthorized(res: Response, message: string, code?: string): Promise<void> {
  if (DEBUG) console.log('[AUTH] softUnauthorized:', message);
  clearAccessCookies(res);
  res.status(401).json({ error: message, ...(code ? { code } : {}) });
}

async function hardRevoke(res: Response, userId: string, message: string, code?: string): Promise<void> {
  if (DEBUG) console.log('[AUTH] hardRevoke:', message, 'userId:', userId);
  clearAuthCookies(res);
  await logoutUser(userId);
  await revokeAllUserTokens(userId);
  res.status(401).json({ error: message, ...(code ? { code } : {}) });
}

// ============================================================================
// 1. AUTHENTICATE — the single authentication middleware
// ============================================================================
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Extract JWT
const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      clearAccessCookies(res);
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // 2. Verify JWT (throws if invalid) – this is normal, soft 401
    let decoded: any;
    try {
      decoded = verifyToken(token);
    } catch {
      await softUnauthorized(res, 'Invalid or expired token', 'ACCESS_TOKEN_EXPIRED');
      return;
    }

    // 3. Admin role check
    if (decoded.role !== 'ADMIN') {
      clearAccessCookies(res);
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    // 4. Refresh token MUST be present – missing is soft, not proof of compromise
    const presentedRefresh = req.cookies?.refreshToken;
    if (!presentedRefresh) {
      await softUnauthorized(res, 'Refresh token missing', 'REFRESH_TOKEN_MISSING');
      return;
    }

    let rtKind: string;
    try {
      rtKind = await validateRefreshCached(presentedRefresh);
    } catch (err) {
      if (err instanceof Error && err.message === 'SESSION_CHECK_UNAVAILABLE') {
        res.status(503).json({ error: 'Service temporarily unavailable' });
        return;
      }
      console.error('[AUTH] Redis error during refresh validation:', err);
      res.status(503).json({ error: 'Service temporarily unavailable' });
      return;
    }

    // These ARE security signals – hard revoke
    if (rtKind === 'invalid' || rtKind === 'reused' || rtKind === 'password_changed') {
      const code =
        rtKind === 'password_changed' ? 'PASSWORD_CHANGED' :
        rtKind === 'reused' ? 'TOKEN_REUSE' : 'INVALID_REFRESH';
      await hardRevoke(res, decoded.userId, 'Session invalidated – refresh token no longer valid', code);
      return;
    }

    // 5. CSRF cookie – soft 401
    if (!req.cookies?.csrf_token) {
      await softUnauthorized(res, 'CSRF token missing', 'CSRF_TOKEN_MISSING');
      return;
    }

    // 6. Session integrity – hard revoke on fingerprint/UA mismatch
    let sessionValid: boolean;
    try {
      sessionValid = await validateSession(decoded.sessionId, req);
    } catch (err: any) {
      if (err?.message === 'SESSION_CHECK_UNAVAILABLE') {
        res.status(503).json({ error: 'Service temporarily unavailable' });
        return;
      }
      throw err;
    }
    if (!sessionValid) {
      await hardRevoke(res, decoded.userId, 'Session invalidated – security violation detected', 'INTEGRITY_MISMATCH');
      return;
    }

    // 7. Tailscale IP binding – split into soft (missing IP) and hard (mismatch)
    const clientTailscaleIP = (req as any).tailscaleClientIP;
    if (!clientTailscaleIP) {
      console.warn('[AUTH] tailscaleClientIP missing on request – treating as soft failure, not revoking session', {
        userId: decoded.userId,
        path: req.path,
      });
      await softUnauthorized(res, 'Network context unavailable, please retry', 'NETWORK_CONTEXT_MISSING');
      return;
    }
    if (!decoded.tailscaleIP || clientTailscaleIP !== decoded.tailscaleIP) {
      await hardRevoke(res, decoded.userId, 'Network violation detected', 'NETWORK_MISMATCH');
      return;
    }

    // 8. Attach user to request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
       role: decoded.role, 
      sessionId: decoded.sessionId,
      tailscaleIP: decoded.tailscaleIP,
      csrfToken: decoded.csrfToken,
    };

    if (DEBUG) console.log('[AUTH] authenticate passed for', decoded.email);
    next();
  } catch {
    clearAccessCookies(res);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ============================================================================
// 2. requireAdmin — simple role guard (rarely needed because authenticate already checks ADMIN)
// ============================================================================
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// ============================================================================
// 3. csrfProtection — constant‑time CSRF header verification for mutations
// ============================================================================
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  const csrfHeader = req.headers['x-csrf-token'] as string;
  if (!csrfHeader) {
    clearAccessCookies(res);
    res.status(403).json({ error: 'CSRF token missing' });
    return;
  }

  const tokenCsrf = req.user?.csrfToken;
  if (!tokenCsrf) {
    clearAccessCookies(res);
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const a = Buffer.from(String(tokenCsrf));
  const b = Buffer.from(String(csrfHeader));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    clearAccessCookies(res);
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  next();
}