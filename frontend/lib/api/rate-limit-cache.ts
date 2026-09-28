interface RateLimitEntry {
  expiresAt: number;   // timestamp when cooldown ends
}

const cache = new Map<string, RateLimitEntry>();

/**
 * Call this after receiving a RateLimitError.
 * Saves the endpoint + retryAfter so we can block subsequent calls.
 */
export function setRateLimit(endpoint: string, retryAfterSeconds: number) {
  cache.set(endpoint, {
    expiresAt: Date.now() + retryAfterSeconds * 1000,
  });
}

/**
 * Check if an endpoint is currently blocked.
 * Returns the remaining seconds if blocked, otherwise null.
 */
export function getRateLimitCooldown(endpoint: string): number | null {
  const entry = cache.get(endpoint);
  if (!entry) return null;
  const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000);
  return remaining > 0 ? remaining : null;
}

/**
 * Clear a cached rate limit (e.g., after a successful request).
 */
export function clearRateLimit(endpoint: string) {
  cache.delete(endpoint);
}