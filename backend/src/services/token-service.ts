// ============================================================================
// token-service.ts — Grace‑period refresh token rotation (Redis‑based)
// with password‑epoch validation, session binding, and retry on mirror writes.
// ============================================================================

import { randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import redis from '../lib/redis.js';
import { supabase } from '../lib/supabase.js';   // needed for password‑epoch check

const DEBUG = process.env.DEBUG_AUTH === 'true';

// ── Alert on Supabase write failure ──────────────────────────────
async function alertSupabaseFailure(context: string, err: any) {
  console.error(`❌ Supabase write failed [${context}]:`, err);
  try {
    const ADMIN_TELEGRAM_CHAT_ID = process.env.ADMIN_TELEGRAM_CHAT_ID;
    if (ADMIN_TELEGRAM_CHAT_ID) {
      const { sendTelegram } = await import('../services/notification-service.js');
      await sendTelegram(ADMIN_TELEGRAM_CHAT_ID,
        `🚨 Supabase write failure\nContext: ${context}\nError: ${err?.message || err}`
      );
    }
  } catch (_) {}
}

const JWT_SECRET = process.env.JWT_SECRET!;
const ACCESS_TOKEN_EXPIRY = '30m';   // matches session TTL
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const REFRESH_TOKEN_TTL_SECONDS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
const ROTATION_GRACE_SECONDS = 300;

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
  tailscaleIP?: string;
  csrfToken: string;
  passwordEpoch?: string;
}

interface RefreshFamilyRecord {
  familyId: string;
  userId: string;
  sessionId: string;               // NEW – links refresh family to the session
  currentToken: string;
  previousToken: string | null;
  previousExpiresAt: number | null;
  passwordUpdatedAt: string;
  issuedAccessTokenJti: string | null;
  createdAt: number;
  geoLocation?: any;
}

function familyKey(familyId: string) {
  return `refresh_family:${familyId}`;
}

function tokenIndexKey(token: string) {
  return `refresh_token_idx:${token}`;
}

// Simple retry helper for transient Supabase writes
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 200): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }
  throw lastErr;
}

async function saveFamily(record: RefreshFamilyRecord) {
  const key = familyKey(record.familyId);
  await redis.set(key, JSON.stringify(record), 'EX', REFRESH_TOKEN_TTL_SECONDS);

  await redis.set(tokenIndexKey(record.currentToken), record.familyId, 'EX', REFRESH_TOKEN_TTL_SECONDS);
  if (record.previousToken) {
    await redis.set(tokenIndexKey(record.previousToken), record.familyId, 'EX', ROTATION_GRACE_SECONDS);
  }

  // ── Supabase mirror with retry ────────────────────────────────
  try {
    await withRetry(async () => {
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();
      const base = { familyId: record.familyId, userId: record.userId, expiresAt, familyData: record };

      await supabase.from('RefreshToken').upsert({
        ...base,
        token: record.currentToken,
        kind: 'current',
      }, { onConflict: 'familyId, token' });

      if (record.previousToken) {
        const prevExpiresAt = new Date(Date.now() + ROTATION_GRACE_SECONDS * 1000).toISOString();
        await supabase.from('RefreshToken').upsert({
          ...base,
          token: record.previousToken,
          kind: 'previous',
          expiresAt: prevExpiresAt,
        }, { onConflict: 'familyId, token' });
      }
    });
  } catch (err) {
    await alertSupabaseFailure('saveFamily', err);
  }
}

/**
 * Generate a short‑lived access token.
 */
export function generateAccessToken(payload: TokenPayload): string {

  if (DEBUG) console.log('[TOKEN] generateAccessToken for', payload.email);

  const jti = randomBytes(16).toString('hex');

  return jwt.sign({ ...payload, jti }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });

}
/**
 * Start a brand‑new refresh‑token family. Call this on login / verify‑2fa.
 * `passwordUpdatedAt` must be the user’s current `updatedAt` value.
 * `sessionId` is now required to bind the family to the session.
 */
export async function generateRefreshToken(
  userId: string,
  passwordUpdatedAt: string,
  sessionId: string,
  geo?: any
): Promise<{ token: string; familyId: string }> {
  const familyId = randomBytes(16).toString('hex');
  const token = randomBytes(32).toString('hex');

  const record: RefreshFamilyRecord = {
    familyId,
    userId,
    sessionId,
    currentToken: token,
    previousToken: null,
    previousExpiresAt: null,
    passwordUpdatedAt,
    issuedAccessTokenJti: null,
    createdAt: Date.now(),
    geoLocation: geo || null,
  };

  await saveFamily(record);
  if (DEBUG) console.log('[TOKEN] generateRefreshToken family created', familyId, 'for session', sessionId);
  return { token, familyId };
}


export type RefreshValidationResult =
  | { kind: 'fresh'; userId: string; familyId: string; sessionId: string; passwordUpdatedAt: string; geoLocation?: any }
  | { kind: 'retry'; userId: string; familyId: string; sessionId: string; reissueToken: string; passwordUpdatedAt: string; geoLocation?: any }
  | { kind: 'password_changed'; userId: string; familyId: string }
  | { kind: 'invalid' }
  | { kind: 'reused'; userId: string; familyId: string }
  | { kind: 'store_unreachable'; storeErrors: string[] };
  
/**
 * Validate a presented refresh token.
 * Also checks the password epoch: if the password has changed since the
 * token was issued, the token is immediately rejected with `password_changed`.
 */
export async function validateRefreshToken(
  presentedToken: string
): Promise<RefreshValidationResult> {
  if (DEBUG) console.log('[TOKEN] validateRefreshToken called');

  let familyId: string | null = null;
  let raw: string | null = null;
  // Track which stores errored so we can distinguish
  // "token not in any store" (→ invalid → 401) from
  // "stores are down, can't verify" (→ store_unreachable → 503).
  // Without this, a 10-second Redis blip during deploy would
  // log out every user on a 500.
  const storeErrors: string[] = [];

  // ── Tier 1 – Redis index ───────────────────────────────────────
  try {
    familyId = await redis.get(tokenIndexKey(presentedToken));
    if (familyId) {
      raw = await redis.get(familyKey(familyId));
    }
  } catch (err) {
    storeErrors.push('redis-index');
    console.error('[TOKEN] Redis index lookup failed:', err);
  }

  // ── Tier 2 – Supabase direct lookup ────────────────────────────
  if (!raw) {
    try {
      const { data: row, error } = await supabase
        .from('RefreshToken')
        .select('familyData')
        .eq('token', presentedToken)
        .is('revokedAt', null)
        .gt('expiresAt', new Date().toISOString())
        .maybeSingle();
      if (error) throw error;
      if (row?.familyData) {
        const rec = row.familyData as RefreshFamilyRecord;
        familyId = rec.familyId;
        raw = JSON.stringify(rec);
        redis.set(familyKey(familyId), raw, 'EX', REFRESH_TOKEN_TTL_SECONDS).catch(() => {});
        redis.set(tokenIndexKey(presentedToken), familyId, 'EX', REFRESH_TOKEN_TTL_SECONDS).catch(() => {});
        if (DEBUG) console.log('[TOKEN] Supabase fallback restored family', familyId);
      }
    } catch (err) {
      storeErrors.push('supabase-direct');
      console.error('[TOKEN] Supabase direct lookup failed, falling back to SCAN:', err);
    }
  }

  // ── Tier 3 – Redis SCAN (last resort) ──────────────────────────
  if (!raw) {
    if (DEBUG) console.log('[TOKEN] Redis index and Supabase missed – scanning');
    try {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', 'refresh_family:*', 'COUNT', 100);
        cursor = next;
        for (const key of keys) {
          const entry = await redis.get(key);
          if (!entry) continue;
          const rec: RefreshFamilyRecord = JSON.parse(entry);
          if (rec.currentToken === presentedToken || rec.previousToken === presentedToken) {
            familyId = rec.familyId;
            raw = entry;
            break;
          }
        }
        if (raw) break;
      } while (cursor !== '0');
    } catch (err) {
      storeErrors.push('redis-scan');
      console.error('[TOKEN] Redis SCAN failed:', err);
    }
  }

  // ── Not found: invalid or unreachable? ─────────────────────────
  if (!raw) {
    if (DEBUG) console.log('[TOKEN] Token not found in any tier');
    if (storeErrors.length > 0) {
      return { kind: 'store_unreachable', storeErrors };
    }
    return { kind: 'invalid' };
  }

  const record: RefreshFamilyRecord = JSON.parse(raw);

  // ── Opportunistic cleanup of dead rows (best-effort) ───────────
  try {
  const nowISO = new Date().toISOString();
  await supabase
    .from('RefreshToken')
    .delete()
    .eq('userId', record.userId)
    .or(`expiresAt.lt.${nowISO},revokedAt.not.is.null`);
} catch (err) {
  await alertSupabaseFailure('validateRefreshToken-cleanup', err);
}

  // ── Password-epoch check ───────────────────────────────────────
  let user: { passwordChangedAt: string } | null = null;
  let lastUserLookupError: any = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await supabase
        .from('User')
        .select('passwordChangedAt')
        .eq('id', record.userId)
        .maybeSingle();
      if (result.error) throw result.error;
      user = result.data;
      lastUserLookupError = null;
      break;
    } catch (err) {
      lastUserLookupError = err;
      if (attempt === 0) await new Promise(r => setTimeout(r, 200));
    }
  }

  if (!user) {
    if (lastUserLookupError) {
      // Supabase is down – we can't verify the password epoch.
      // Treat as store_unreachable, NOT password_changed.
      console.error('[TOKEN] User lookup failed, treating as store_unreachable:', lastUserLookupError);
      return { kind: 'store_unreachable', storeErrors: ['supabase-user-lookup'] };
    }
    // User lookup returned null with no error = user was deleted.
    // Force re-auth – revoke the family.
    if (DEBUG) console.log('[TOKEN] user not found, treating as password_changed');
    return {
      kind: 'password_changed',
      userId: record.userId,
      familyId: record.familyId,
    };
  }

  const dbEpoch = user.passwordChangedAt
    ? new Date(user.passwordChangedAt).getTime().toString()
    : '0';
  const storedEpoch = record.passwordUpdatedAt;
  if (dbEpoch !== storedEpoch) {
    if (DEBUG) console.log('[TOKEN] password epoch mismatch');
    return {
      kind: 'password_changed',
      userId: record.userId,
      familyId: record.familyId,
    };
  }

  // ── Normal validation: fresh or retry ──────────────────────────
  if (presentedToken === record.currentToken) {
    if (DEBUG) console.log('[TOKEN] fresh token');
    return {
      kind: 'fresh',
      userId: record.userId,
      familyId: record.familyId,
      sessionId: record.sessionId,
      passwordUpdatedAt: record.passwordUpdatedAt,
      geoLocation: record.geoLocation,
    };
  }

  if (
    record.previousToken &&
    presentedToken === record.previousToken &&
    record.previousExpiresAt &&
    Date.now() < record.previousExpiresAt
  ) {
    if (DEBUG) console.log('[TOKEN] retry token');
    return {
      kind: 'retry',
      userId: record.userId,
      familyId: record.familyId,
      sessionId: record.sessionId,
      reissueToken: record.currentToken,
      passwordUpdatedAt: record.passwordUpdatedAt,
      geoLocation: record.geoLocation,
    };
  }

  return { kind: 'reused', userId: record.userId, familyId: record.familyId };
}

/**
 * Rotate a refresh token after a *fresh* use.
 */
const ROTATE_SCRIPT = `
  local raw = redis.call('GET', KEYS[1])
  if not raw then return nil end
  local record = cjson.decode(raw)
  if record.currentToken ~= ARGV[1] then return false end
  record.previousToken = record.currentToken
  record.previousExpiresAt = tonumber(ARGV[2])
  record.currentToken = ARGV[3]
  redis.call('SET', KEYS[1], cjson.encode(record), 'EX', ARGV[4])
  redis.call('SET', KEYS[2], record.familyId, 'EX', ARGV[4])
  redis.call('SET', KEYS[3], record.familyId, 'EX', ARGV[5])
  return cjson.encode(record)
`;

export async function rotateRefreshToken(familyId: string, expectedCurrentToken: string): Promise<string | null> {
  const newToken = randomBytes(32).toString('hex');

  let oldPreviousToken: string | null = null;
  try {
    const oldRaw = await redis.get(familyKey(familyId));
    if (oldRaw) {
      const oldRecord: RefreshFamilyRecord = JSON.parse(oldRaw);
      oldPreviousToken = oldRecord.previousToken;
    }
  } catch (_) { /* best effort */ }

  const result = await redis.eval(
    ROTATE_SCRIPT,
    3,
    familyKey(familyId),
    tokenIndexKey(newToken),
    tokenIndexKey(expectedCurrentToken),
    expectedCurrentToken,
    Date.now() + ROTATION_GRACE_SECONDS * 1000,
    newToken,
    REFRESH_TOKEN_TTL_SECONDS,
    ROTATION_GRACE_SECONDS
  );
  if (result === false || result === null) {
    if (DEBUG) console.log('[TOKEN] rotateRefreshToken failed – token already rotated or family gone');
    return null;
  }

  // Sync to Supabase
  try {
    const raw = await redis.get(familyKey(familyId));
    if (raw) {
      const updatedRecord: RefreshFamilyRecord = JSON.parse(raw);
      const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString();
      const prevExpiresAt = new Date(Date.now() + ROTATION_GRACE_SECONDS * 1000).toISOString();

      await supabase.from('RefreshToken').upsert({
        familyId,
        token: newToken,
        kind: 'current',
        userId: updatedRecord.userId,
        expiresAt,
        familyData: updatedRecord,
      }, { onConflict: 'familyId, token' });

      if (oldPreviousToken && oldPreviousToken !== expectedCurrentToken) {
        await supabase
          .from('RefreshToken')
          .delete()
          .eq('familyId', familyId)
          .eq('token', oldPreviousToken)
          .eq('kind', 'previous');
      }

      await supabase.from('RefreshToken').upsert({
        familyId,
        token: expectedCurrentToken,
        kind: 'previous',
        userId: updatedRecord.userId,
        expiresAt: prevExpiresAt,
        familyData: updatedRecord,
      }, { onConflict: 'familyId, token' });
    }
  } catch (err) {
    await alertSupabaseFailure('rotateRefreshToken', err);
  }

  if (DEBUG) console.log('[TOKEN] rotateRefreshToken succeeded, new token generated');
  return newToken;
}

/**
 * Update the issuedAccessTokenJti on the family record (and Supabase mirror).
 * Called after generating an access token so the refresh can be audit-linked
 * to the access token it produced. Best-effort: alerts on failure but does
 * not throw — the access token is still valid even if this write fails.
 */
export async function updateFamilyAccessTokenJti(
  familyId: string,
  jti: string,
): Promise<void> {
  // Update Redis (source of truth)
  try {
    const raw = await redis.get(familyKey(familyId));
    if (raw) {
      const record: RefreshFamilyRecord = JSON.parse(raw);
      record.issuedAccessTokenJti = jti;
      await redis.set(
        familyKey(familyId),
        JSON.stringify(record),
        'EX',
        REFRESH_TOKEN_TTL_SECONDS,
      );
    }
  } catch (err) {
    await alertSupabaseFailure('updateFamilyAccessTokenJti-redis', err);
    return; // Redis is source of truth; if we can't write there, stop
  }

  // Mirror to Supabase
  try {
    await withRetry(async () => {
      const raw = await redis.get(familyKey(familyId));
      if (!raw) return;
      const record: RefreshFamilyRecord = JSON.parse(raw);
      await supabase
        .from('RefreshToken')
        .update({ familyData: record })
        .eq('familyId', familyId);
    });
  } catch (err) {
    await alertSupabaseFailure('updateFamilyAccessTokenJti-supabase', err);
  }
}

/**
 * Revoke an entire refresh family immediately, including the associated session.
 */
export async function revokeRefreshFamily(familyId: string): Promise<void> {
  const raw = await redis.get(familyKey(familyId));
  let ownedSessionId: string | null = null;
  if (raw) {
    const record: RefreshFamilyRecord = JSON.parse(raw);
    ownedSessionId = record.sessionId || null;
    await redis.del(tokenIndexKey(record.currentToken));
    if (record.previousToken) await redis.del(tokenIndexKey(record.previousToken));
  }
  await redis.del(familyKey(familyId));

  if (ownedSessionId) {
    await redis.del(`session:${ownedSessionId}`).catch(() => {});
    try {
      await supabase.from('Session').delete().eq('id', ownedSessionId);
    } catch (err) {
      await alertSupabaseFailure('revokeRefreshFamily-session', err);
    }
  }

  try {
    await supabase.from('RefreshToken').delete().eq('familyId', familyId);
  } catch (err) {
    await alertSupabaseFailure('revokeRefreshFamily', err);
  }
  if (DEBUG) console.log('[TOKEN] revokeRefreshFamily completed for', familyId);
}

/**
 * Revoke all refresh families for a user (logout‑all, password reset).
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'refresh_family:*', 'COUNT', 100);
    cursor = next;
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      const record: RefreshFamilyRecord = JSON.parse(raw);
      if (record.userId === userId) {
        await revokeRefreshFamily(record.familyId);
      }
    }
  } while (cursor !== '0');

  try {
    await supabase.from('RefreshToken').delete().eq('userId', userId);
  } catch (err) {
    await alertSupabaseFailure('revokeAllUserTokens', err);
  }
  if (DEBUG) console.log('[TOKEN] revokeAllUserTokens completed for user', userId);
}