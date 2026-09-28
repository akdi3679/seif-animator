import { Request, Response, NextFunction } from 'express'
import { getTailscalePeers, isTailscaleIP } from '../lib/tailscale.js'

export async function validateTailscalePeer(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Validate the immediate source IP (frontend server)
    const sourceIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim()
                     || req.socket.remoteAddress
                     || req.ip
  if (!sourceIP) {
  console.log('[Tailscale] No source IP found');
  res.status(404).json({ error: 'Not found' });
  return;
}
    const strippedSource = sourceIP.replace(/^::ffff:/, '')

    if (!strippedSource || !isTailscaleIP(strippedSource)) {
      console.log('[Tailscale] Source IP not Tailscale:', strippedSource)
      res.status(404).json({ error: 'Not found' }) ;
      return;
    }

    const peers = await getTailscalePeers()
    if (!peers.includes(strippedSource)) {
      console.log('[Tailscale] Source IP not in peer list:', strippedSource)
      res.status(404).json({ error: 'Not found' }) ;
      return;
    }

    // 2. Validate the forwarded client IP (end user)
    const clientIP = req.headers['x-forwarded-for'] as string
    if (!clientIP) {
      console.log('[Tailscale] Missing X-Forwarded-For header')
     res.status(404).json({ error: 'Not found' }) ;
      return;
    }

    const strippedClient = clientIP.split(',')[0].trim().replace(/^::ffff:/, '')
    if (!strippedClient || !isTailscaleIP(strippedClient)) {
      console.log('[Tailscale] Client IP not Tailscale:', strippedClient)
      res.status(404).json({ error: 'Not found' }) ;
      return;
    }

    if (!peers.includes(strippedClient)) {
      console.log('[Tailscale] Client IP not in peer list:', strippedClient)
      res.status(404).json({ error: 'Not found' }) ;
      return;
    }
console.log('[Tailscale] Client IP:', strippedClient);
    // Both IPs are valid Tailscale peers
    ;(req as any).tailscaleSourceIP = strippedSource
    ;(req as any).tailscaleClientIP = strippedClient
    next()
  } catch (error) {
    console.error('[Tailscale] Validation error:', error)
    res.status(404).json({ error: 'Not found' })
  }
}