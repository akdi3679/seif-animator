import { randomBytes } from 'crypto';

/**
 * Generate a secure random CSRF token (32 bytes = 64 hex chars)
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}