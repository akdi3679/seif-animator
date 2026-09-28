// backend/src/lib/security/request-signature.ts
// HMAC-SHA256 request signing for tamper protection

import { createHmac, timingSafeEqual } from 'crypto'

// Use environment variable or fallback (never hardcode in production)
const SIGNATURE_SECRET = process.env.REQUEST_SIGNATURE_SECRET || process.env.JWT_SECRET || 'fallback-dev-secret-not-for-production'

// Sign request
export function signRequest(endpoint: string, timestamp: number, body: string = ''): string {
  const data = `${endpoint}:${timestamp}:${body}`
  return createHmac('sha256', SIGNATURE_SECRET).update(data).digest('hex')
}

// Verify request signature
export function verifyRequestSignature(
  signature: string,
  endpoint: string,
  timestamp: number,
  body: string = ''
): boolean {
  // Check timestamp (prevent replay attacks)
  const now = Date.now()
  const requestTime = timestamp * 1000
  if (Math.abs(now - requestTime) > 5 * 60 * 1000) {
    return false
  }
  
  const expected = signRequest(endpoint, timestamp, body)
  
  try {
    const sigBuf = Buffer.from(signature, 'hex')
    const expBuf = Buffer.from(expected, 'hex')
    return timingSafeEqual(sigBuf, expBuf)
  } catch {
    return false
  }
}