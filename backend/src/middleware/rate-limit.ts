import { Request, Response, NextFunction } from 'express'
import redis from '../lib/redis.js'

interface RateLimitConfig {
  windowMs: number
  maxRequests: number
  keyPrefix: string
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 15 * 60 * 1000,
  maxRequests: 100,
  keyPrefix: 'ratelimit'
}

const ENDPOINT_LIMITS: Record<string, RateLimitConfig> = {
  '/api/public/auth/login': { windowMs: 15 * 60 * 1000, maxRequests: 5, keyPrefix: 'ratelimit:login' },
  '/api/public/auth/register': { windowMs: 60 * 60 * 1000, maxRequests: 3, keyPrefix: 'ratelimit:register' },
  '/api/public/auth/verify-2fa': { windowMs: 5 * 60 * 1000, maxRequests: 5, keyPrefix: 'ratelimit:2fa' },
  '/api/public/bookings': { windowMs: 60 * 60 * 1000, maxRequests: 10, keyPrefix: 'ratelimit:booking' },
  '/api/public/contact': { windowMs: 60 * 60 * 1000, maxRequests: 3, keyPrefix: 'ratelimit:contact' } , 
  '/api/public/booking-init': { windowMs: 60 * 60 * 1000, maxRequests: 10, keyPrefix: 'ratelimit:booking-init' },
  '/api/public/geo-lookup': { windowMs: 60 * 1000, maxRequests: 200, keyPrefix: 'ratelimit:geo' }
}

const AUTH_SENSITIVE_PREFIXES = ['login', 'register', '2fa', 'refresh', 'reset', 'forgot'];

export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const finalConfig = { ...DEFAULT_CONFIG, ...config }
    const endpointConfig = ENDPOINT_LIMITS[req.path] || finalConfig
    const isAuthSensitive = AUTH_SENSITIVE_PREFIXES.some(p => endpointConfig.keyPrefix.includes(p));

    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown'
    const fingerprint = req.headers['x-device-fingerprint'] || 'unknown'
    const key = `${endpointConfig.keyPrefix}:${ip}:${fingerprint}`

    try {
      const ttl = Math.ceil(endpointConfig.windowMs / 1000)
      const count = await redis.incr(key)
      if (count === 1) { await redis.expire(key, ttl) }
      if (count > endpointConfig.maxRequests) {
        res.status(429).json({ error: 'Too many requests', retryAfter: ttl })
        return
      }
      res.setHeader('X-RateLimit-Limit', endpointConfig.maxRequests.toString())
      res.setHeader('X-RateLimit-Remaining', Math.max(0, endpointConfig.maxRequests - count).toString())
      next()
    } catch (err) {
      console.error(`[RateLimit] Redis unavailable for ${key}:`, err);
      if (isAuthSensitive) {
        res.status(503).json({ error: 'Service temporarily unavailable, please try again shortly' });
        return;
      }
      next();
    }
  }
}