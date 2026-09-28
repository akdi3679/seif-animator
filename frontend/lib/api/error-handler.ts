import { ApiError, UnauthorizedError, RateLimitError } from './types';
import { toast } from 'sonner';

export interface ErrorHandlerOptions {
  showToast?: boolean;
  redirectOnUnauthorized?: boolean;
  onError?: (error: ApiError) => void;
}

// Track last toast time per error type
const lastToastTime: Record<string, number> = {};
const TOAST_COOLDOWN_MS = 45 * 1000; // 45 sec



function getErrorType(error: unknown): string {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    // Check if browser is online
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    return isOnline ? 'server' : 'network';
  }
  if (error instanceof ApiError) {
    if (error instanceof RateLimitError) return 'rate_limit';
    if (error.status && error.status >= 500) return 'server';
    if (error.status === 401) return 'unauthorized';
    return 'api_error';
  }
  if (error instanceof Error && (error.message.includes('500') || error.message.includes('503'))) {
    return 'server';
  }
  return 'unknown';
}

function getReadableMessage(error: unknown, t?: (key: string) => string): string {
  const type = getErrorType(error);
  if (t) {
    switch (type) {
      case 'network': return t('error.network');
      case 'server': return t('error.server');
      case 'rate_limit': return t('error.rateLimit');
      case 'unauthorized': return t('error.unauthorized');
      default: return t('error.default');
    }
  }
  // Fallback English when t isn’t available
  switch (type) {
    case 'network': return 'No internet connection. Please check your network.';
    case 'server': return 'Server error. Our team is working on it.';
    case 'rate_limit': return 'Too many requests. Please try again later.';
    case 'unauthorized': return 'Session expired. Please log in again.';
    default: return error instanceof Error ? error.message : 'An unexpected error occurred.';
  }
}

export async function handleAPIError(
  error: unknown, 
  options: ErrorHandlerOptions = {},
  t?: (key: string) => string // Pass translation function
): Promise<never> {
  const { showToast = true, redirectOnUnauthorized = true, onError } = options;

  let message = 'An unexpected error occurred.';
  let code = 'UNKNOWN_ERROR';
  let status = 500;

  if (error instanceof ApiError) {
    message = error.message;
    code = error.code || 'API_ERROR';
    status = error.status || 500;

    if (error instanceof UnauthorizedError && redirectOnUnauthorized) {
      if (typeof window !== 'undefined') {
        window.location.href = '/login?reason=session_expired';
      }
    }
    if (error instanceof RateLimitError) {
      message = 'Too many requests. Please try again later.';
    }
  } else if (error instanceof TypeError && error.message === 'Failed to fetch') {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    message = isOnline ? 'Server error. Please try again later.' : 'No internet connection.';
    code = isOnline ? 'SERVER_ERROR' : 'NETWORK_ERROR';
    status = isOnline ? 503 : 0;
  } else if (error instanceof Error) {
    message = error.message;
  }

  console.error(`[API Error] ${code} (${status}):`, message, error);

  // Show toast with deduplication per error type
   if (showToast && typeof window !== 'undefined' && !(error instanceof RateLimitError)) {
    const errorType = getErrorType(error);
    const now = Date.now();
    const lastTime = lastToastTime[errorType] || 0;
    if (now - lastTime >= TOAST_COOLDOWN_MS) {
      lastToastTime[errorType] = now;
      toast.error(getReadableMessage(error, t));
    }
  }

  if (onError && error instanceof ApiError) {
    onError(error);
  }

  throw error;
}

export async function withErrorHandling<T>(
  promise: Promise<T>,
  options?: ErrorHandlerOptions
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    await handleAPIError(error, options);
    throw error;
  }
}