import { supabase } from '../lib/supabase.js';
import { decrypt } from '../lib/encryption.js';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

let cachedDeleteCode: string | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

async function getDeleteCode(): Promise<string | null> {
  const now = Date.now();
  if (cachedDeleteCode !== undefined && now - cacheTime < CACHE_TTL) {
    return cachedDeleteCode;
  }
  const { data } = await supabase
    .from('SecretCode')
    .select('code')
    .eq('purpose', 'lock_delete')
    .maybeSingle();
  cachedDeleteCode = data ? data.code : null;
  cacheTime = now;
  return cachedDeleteCode;
}

export async function verifyDeleteCode(req: Request, res: Response, next: NextFunction) {
  // First try the body (POST/PUT/DELETE), then query params (GET)
  let deleteCode = req.body?.deleteCode || req.query?.deleteCode;

  if (!deleteCode || typeof deleteCode !== 'string') {
    console.warn('[verifyDeleteCode] deleteCode missing or invalid:', deleteCode);
    return res.status(400).json({ error: 'Delete verification required' });
  }

  const encryptedCode = await getDeleteCode();
  if (!encryptedCode) {
    console.error('[verifyDeleteCode] No encrypted code found in database');
    return res.status(400).json({ error: 'No delete verification code configured' });
  }

  let plainCode: string;
  try {
    plainCode = decrypt(encryptedCode);
  } catch (err) {
    console.error('[verifyDeleteCode] Decryption failed:', err);
    return res.status(500).json({ error: 'Failed to verify delete code' });
  }

  const a = Buffer.from(String(deleteCode));
  const b = Buffer.from(String(plainCode));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(400).json({ error: 'Invalid delete code' });
  }

  next();
}