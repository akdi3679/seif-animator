// frontend/lib/api/hooks.ts
import { useState, useEffect, useCallback } from 'react'
import { publicAPI, adminAPI } from './client'
import { withErrorHandling } from './error-handler'
import { ApiError, ServerOverloadError, RateLimitError } from './types'
import { getRateLimitCooldown, setRateLimit, clearRateLimit } from './rate-limit-cache';
import useSWR from 'swr'


const publicFetcher = (url: string) => withErrorHandling(publicAPI(url), { showToast: true });
const adminFetcher = (url: string) => withErrorHandling(adminAPI(url), { showToast: true });

// Generic fetch hook
export function useAPI<T>(
  fetcher: () => Promise<T>,
  deps: any[] = []
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    let mounted = true

    const fetchData = async () => {
      try {
        setLoading(true)
        const result = await withErrorHandling(fetcher(), { showToast: false })
        if (mounted) {
          setData(result)
          setError(null)
        }
      } catch (err) {
        if (mounted) {
          setError(err as ApiError)
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      mounted = false
    }
  }, deps)

  return { data, loading, error }
}

// Hook for public GET requests
export function usePublicGET<T>(
  endpoint: string,
  deps: any[] = []
) {
  return useAPI(() => publicAPI<T>(endpoint), [endpoint, ...deps])
}

// Hook for admin GET requests
export function useAdminGET<T>(
  endpoint: string,
  deps: any[] = []
) {
  return useAPI(() => adminAPI<T>(endpoint), [endpoint, ...deps])
}

// Mutation hooks (POST, PUT, DELETE)
export function useMutation<T, D = any>(
  apiFunction: (data: D) => Promise<T>,
  options?: { showToast?: boolean; endpoint?: string }
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const mutate = useCallback(
    async (data: D): Promise<T> => {
      // Check client‑side rate limit
      if (options?.endpoint) {
        const cooldown = getRateLimitCooldown(options.endpoint);
        if (cooldown !== null) {
          const err = new RateLimitError('Too many requests', cooldown);
          setError(err);
          throw err;   // no backend call, immediate rejection
        }
      }

      setLoading(true);
      setError(null);
      try {
        const result = await withErrorHandling(apiFunction(data), {
          showToast: options?.showToast ?? true,
        });
        // Successful call → clear any cached limit for this endpoint
        if (options?.endpoint) clearRateLimit(options.endpoint);
        return result;
      } catch (err) {
        if (err instanceof RateLimitError && options?.endpoint) {
          // Cache the cooldown so future calls are blocked
          setRateLimit(options.endpoint, err.retryAfter);
        }
        setError(err as ApiError);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [apiFunction, options?.showToast]
  );

  return { trigger: mutate, mutate, loading, error };
}

// Specific mutation creators
export function usePublicPOST<T, D = any>(endpoint: string, options?: { showToast?: boolean }) {
  return useMutation<T, D>(
    (data) =>
      publicAPI<T>(endpoint, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    { showToast: options?.showToast ?? true, endpoint }
  );
}

export function usePublicPUT<T, D = any>(endpoint: string) {
  return useMutation<T, D>(
    (data) =>
      publicAPI<T>(endpoint, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    { endpoint }
  );
}

export function usePublicDELETE<T>(endpoint: string) {
  return useMutation<T, void>(
    () =>
      publicAPI<T>(endpoint, {
        method: 'DELETE',
      }),
    { endpoint }
  );
}

export function useAdminPOST<T, D = any>(
  endpoint: string | (() => string),
  options?: { showToast?: boolean }
) {
  const resolveEndpoint = typeof endpoint === 'function' ? endpoint : () => endpoint;
  return useMutation<T, D>(
    (data) =>
      adminAPI<T>(resolveEndpoint(), {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    { showToast: options?.showToast ?? true, endpoint: typeof endpoint === 'string' ? endpoint : undefined }
  );
}

export function useAdminPUT<T, D = any>(
  endpoint: string | (() => string),
  options?: { showToast?: boolean }
) {
  const resolveEndpoint = typeof endpoint === 'function' ? endpoint : () => endpoint;
  return useMutation<T, D>(
    (data) =>
      adminAPI<T>(resolveEndpoint(), {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    { showToast: options?.showToast ?? true, endpoint: typeof endpoint === 'string' ? endpoint : undefined }
  );
}
export function useAdminDELETE<T, D = any>(
  endpoint: string | (() => string)
) {
  const resolveEndpoint = typeof endpoint === 'function' ? endpoint : () => endpoint;

  return useMutation<T, D>(
    (data) =>
      adminAPI<T>(resolveEndpoint(), {
        method: 'DELETE',
        body: JSON.stringify(data),
      }),
    { endpoint: typeof endpoint === 'string' ? endpoint : undefined }
  );
}

export function usePublicGETSWR<T>(endpoint: string, options?: any) {
  const [retriesExhausted, setRetriesExhausted] = useState(false);
  const { data, error, mutate, isValidating } = useSWR<T>(endpoint, publicFetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false, // MAGIC BULLET: Prevents auto-refetch on page revisits
    dedupingInterval: 600000, // 10 minutes dedupe
    errorRetryCount: 3,
    keepPreviousData: false,
    revalidateOnMount: true,
    errorRetryInterval: 2000,
    onErrorRetry: (err, key, config, revalidate, { retryCount }) => {
      // Do NOT retry if backend is down, overloaded, or unauthorized
      if (
        (err as any)?.code === 'BACKEND_DOWN' ||
        (err as any)?.status === 0 ||
        err instanceof ServerOverloadError ||
        (err as any)?.status === 404 ||
        (err as any)?.status === 401 // STOPS 401 LOOP
      ) {
        setRetriesExhausted(true);
        return;
      }
      if (err instanceof RateLimitError) {
        setRetriesExhausted(true);
        return;
      }
      if (retryCount >= 3) {
        setRetriesExhausted(true);
        return;
      }
      if ((err as any)?.status >= 500) {
        if (retryCount < 1) {
          setTimeout(() => revalidate({ retryCount }), config.errorRetryInterval);
        } else {
          setRetriesExhausted(true);
        }
        return;
      }
      setTimeout(() => revalidate({ retryCount }), config.errorRetryInterval);
    },
    ...options,
  });

  const retry = useCallback(async () => {
    setRetriesExhausted(false);
    await mutate();
  }, [mutate]);

  return {
    data,
    loading: !data && !error,
    error,
    retry,
     mutate, 
    isRetrying: isValidating && !data,
    retriesExhausted,
    isValidating,  
  };
}

export function useAdminGETSWR<T>(
  endpoint: string,
  options?: { manual?: boolean; [key: string]: any }
) {
  const [retriesExhausted, setRetriesExhausted] = useState(false);
  const { manual, ...rest } = options || {};

  const swrOptions: any = {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    revalidateOnMount: manual ? false : true,
    dedupingInterval: 600000,
    errorRetryCount: 3,
    errorRetryInterval: 2000,
    onErrorRetry: (err, key, config, revalidate, { retryCount }) => {
      if (
        err instanceof RateLimitError ||
        (err as any)?.status === 0 ||
        err instanceof ServerOverloadError ||
        (err as any)?.code === 'BACKEND_DOWN' ||
        (err as any)?.status === 404 ||
        (err as any)?.status === 401
      ) {
        setRetriesExhausted(true);
        return;
      }
      if (retryCount >= 3) {
        setRetriesExhausted(true);
        return;
      }
      if ((err as any)?.status >= 500) {
        if (retryCount < 1) {
          setTimeout(() => revalidate({ retryCount }), config.errorRetryInterval);
        } else {
          setRetriesExhausted(true);
        }
        return;
      }
      setTimeout(() => revalidate({ retryCount }), config.errorRetryInterval);
    },
    ...rest,   // ← THIS is the fix – passes refreshInterval, dedupingInterval etc.
  };

  const { data, error, mutate, isValidating } = useSWR<T>(endpoint, adminFetcher, swrOptions);

  const refresh = useCallback(() => {
    mutate();
  }, [mutate]);

  const retry = useCallback(async () => {
    setRetriesExhausted(false);
    await mutate();
  }, [mutate]);

  return {
    data,
    loading: !data && !error,
    error,
    refresh,
    retry,
    mutate,
    isRetrying: isValidating && !data,
    retriesExhausted,
    isValidating,
  };
}