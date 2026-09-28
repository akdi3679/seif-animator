// backend/src/middleware/validate-request.ts
// HMAC-SHA256 request signature verification (bank‑level security)
// Per documentation: backend/src/middleware/validate-request.ts
/*
import { Request, Response, NextFunction } from 'express'
import { createHmac, timingSafeEqual } from 'crypto'

const SIGNATURE_SECRET = process.env.REQUEST_SIGNATURE_SECRET || process.env.JWT_SECRET
if (!SIGNATURE_SECRET) {
  throw new Error('REQUEST_SIGNATURE_SECRET or JWT_SECRET must be set')
}

export async function validateRequestSignature(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  
  console.log('🔍 Path:', req.path)
  if (req.path === '/health' ||
      req.path.startsWith('/api/public/auth/') || 
      req.path === '/api/admin/health'  || 
      req.path === '/api/admin/auth/status' ||
      req.path === '/api/admin/auth/2fa-session-info' ||      // ✅ added
      req.path === '/api/admin/auth/reset-session-info' ||
          req.path === '/api/public/calcom-webhook' ||
 req.path === '/api/public/booking-status'   || req.path === '/api/public/sign-upload' || req.path === '/api/public/booking-events'   ) {    // ✅ added
    console.log('✅ Excluding from signature check');
    return next();
  }
  try {
    // 1. Extract required headers
    const signature = req.headers['x-request-signature'] as string
    const timestamp = req.headers['x-request-timestamp'] as string
    const fingerprint = req.headers['x-device-fingerprint'] as string

    if (!signature || !timestamp) {
      res.status(401).json({ error: 'Missing signature headers' })
      return
    }

    // 2. Prevent replay attacks (5 min window)
    const now = Date.now()
    const requestTime = parseInt(timestamp, 10)

    const maxAge = process.env.NODE_ENV === 'production' ? 5 * 60 * 1000 : 10 * 60 * 1000; // 10 min in dev

    if (isNaN(requestTime) || Math.abs(now - requestTime) > maxAge) {
      res.status(401).json({ error: 'Request expired or invalid timestamp' })
      return
    }

    // 3. Build the string that was signed (must match frontend)
    const method = req.method
    const path = req.originalUrl || req.url
    const body = JSON.stringify(req.body) || ''
    const dataToSign = `${method}:${path}:${timestamp}:${fingerprint || ''}:${body}`

    // 4. Compute expected signature
    const expectedSignature = createHmac('sha256', SIGNATURE_SECRET)
      .update(dataToSign)
      .digest('hex')
    console.log('--- Signature Debug ---');
    console.log('Method:', method);
    console.log('Path:', path);
    console.log('Timestamp:', timestamp);
    console.log('Fingerprint:', fingerprint);
    console.log('🔑 Backend secret (first 4):', SIGNATURE_SECRET.substring(0, 4));
    console.log('Body:', body);
    console.log('Data to sign:', dataToSign);
    console.log('Expected signature:', expectedSignature);
    console.log('Received signature:', signature);
    // 5. Timing‑safe comparison
    const sigBuffer = Buffer.from(signature, 'hex')
    const expBuffer = Buffer.from(expectedSignature, 'hex')

    if (sigBuffer.length !== expBuffer.length ||
        !timingSafeEqual(sigBuffer, expBuffer)) {
      res.status(401).json({ error: 'Invalid signature' })
      return
    }

    // 6. Attach validated fingerprint for later use (optional)
    ;(req as any).validatedFingerprint = fingerprint

    next()
  } catch (error) {
    // Log error but don't expose details to client
    console.error('Signature validation error:', error)
    res.status(500).json({ error: 'Signature validation failed' })
  }
}*/