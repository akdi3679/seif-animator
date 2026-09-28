// backend/src/lib/security/device-fingerprint.ts
// Generates unique device fingerprint from browser characteristics
// Per documentation: backend/src/lib/security/device-fingerprint.ts

import { createHash } from 'crypto'

export interface DeviceCharacteristics {
  userAgent: string
  acceptLanguage: string
  timezone?: string
  secChUaPlatform?: string
  secChUaMobile?: string
}

export function generateFingerprint(characteristics: DeviceCharacteristics): string {
  const components = [
    characteristics.userAgent,
    characteristics.acceptLanguage,
    characteristics.timezone || '',
    characteristics.secChUaPlatform || '',
    characteristics.secChUaMobile || '',
  ]
  
  const data = components.join('|')
  
  return createHash('sha256').update(data).digest('hex')
}

// Extract characteristics from HTTP request
export function extractFromRequest(req: any): DeviceCharacteristics {
  return {
    userAgent: req.headers['user-agent'] || '',
    acceptLanguage: req.headers['accept-language'] || '',
    timezone: req.headers['x-timezone'],
    secChUaPlatform: req.headers['sec-ch-ua-platform'] || '',
    secChUaMobile: req.headers['sec-ch-ua-mobile'] || '',
  }
}