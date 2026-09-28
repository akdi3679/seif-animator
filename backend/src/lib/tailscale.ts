// backend/src/lib/tailscale.ts
// Shared logic: get Tailscale peers (cached) and validate IP range

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface TailscaleStatus {
  Self: { TailscaleIPs: string[] }
  Peer: Record<string, { TailscaleIPs: string[] }>
}

let cachedPeers: string[] | null = null
let cacheTime = 0
const CACHE_TTL = 300000 // 60 seconds

/**
 * Returns a list of all Tailscale IPs in the current tailnet (including self).
 * Results are cached for 60 seconds.
 */
export async function getTailscalePeers(): Promise<string[]> {
  const now = Date.now()
  if (cachedPeers && now - cacheTime < CACHE_TTL) {
    return cachedPeers
  }

  try {
    const { stdout } = await execAsync('tailscale status --json')
    const status: TailscaleStatus = JSON.parse(stdout)

    const peers: string[] = []

    // Add self IPs
    if (status.Self?.TailscaleIPs) {
      peers.push(...status.Self.TailscaleIPs)
    }

    // Add all peer IPs
    if (status.Peer) {
      for (const peer of Object.values(status.Peer)) {
        if (peer.TailscaleIPs) {
          peers.push(...peer.TailscaleIPs)
        }
      }
    }

    cachedPeers = peers
    cacheTime = now
    return peers
  } catch (error) {
    console.error('[Tailscale] Failed to get peers:', error)
    return [] // Fail secure: empty list means no one passes
  }
}

/**
 * Checks if an IP address belongs to the Tailscale CGNAT range (100.64.0.0/10).
 */
export function isTailscaleIP(ip: string): boolean {
  const cleanIP = ip.replace(/^::ffff:/, '') // strip IPv6 prefix if present
  const parts = cleanIP.split('.')
  if (parts.length !== 4) return false

  const first = parseInt(parts[0], 10)
  const second = parseInt(parts[1], 10)

  // 100.64.0.0/10 -> first octet 100, second between 64 and 127
  return first === 100 && second >= 64 && second <= 127
}