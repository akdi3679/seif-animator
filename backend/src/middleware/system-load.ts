import { Request, Response, NextFunction } from 'express';
import { isSystemHealthy, getSystemHealth } from '../services/system-metrics.js';

// Routes that should always be allowed even under load (optional)
const CRITICAL_ROUTES = ['/health', '/api/public/health'];

export function systemLoadMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip health check endpoints
  if (CRITICAL_ROUTES.some(route => req.path.startsWith(route))) {
    return next();
  }

  if (!isSystemHealthy()) {
    const health = getSystemHealth();
    // Log for monitoring
    console.warn(`[SystemLoad] Rejecting request due to high load: CPU ${health.cpu.toFixed(1)}%, MEM ${health.memory.toFixed(1)}%, ELD ${health.eventLoopDelay.toFixed(2)}ms`);
    
    res.set('Retry-After', '30'); // seconds
    return res.status(503).json({
      error: 'Service temporarily unavailable due to high load',
      retryAfter: 30,
      reason: {
        cpu: health.cpu,
        memory: health.memory,
        eventLoopDelay: health.eventLoopDelay,
      },
    });
  }

  next();
}