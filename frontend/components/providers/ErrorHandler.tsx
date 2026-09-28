'use client';
import { useEffect, useRef, useState, useCallback, createContext, useContext, ReactNode } from 'react';

import { GlobalErrorPage } from '@/components/shared/GlobalErrorPage';
import { ServerOverloadError, RateLimitError } from '@/lib/api/types';

type GlobalErrorType = 'network' | 'server' | 'render' | 'unknown' | null;

const GlobalErrorContext = createContext<{
  reportError: (error: Error, finalRetry?: boolean) => void;
  clearError: () => void;
}>({ reportError: () => {}, clearError: () => {} });

export function useGlobalError() {
  return useContext(GlobalErrorContext);
}

export function ErrorHandler({ children }: { children: ReactNode }) {
  const [globalError, setGlobalError] = useState<GlobalErrorType>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isOverload, setIsOverload] = useState(false);
const [isRateLimit, setIsRateLimit] = useState(false);

  const errorCountRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const finalErrorTypeRef = useRef<GlobalErrorType>(null);
  const finalOverloadRef = useRef(false);
  const [isDown, setIsDown] = useState(false); 


  useEffect(() => {
    const handleBackendDown = () => {
      setGlobalError('server');
      setIsDown(true);
      setIsOverload(false);
      // Clear any pending timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    window.addEventListener('backend-down', handleBackendDown);
    return () => window.removeEventListener('backend-down', handleBackendDown);
  }, []);

useEffect(() => {
  const handler = () => {
    setGlobalError('server');
    setIsRateLimit(true);
    // Clear any pending timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  window.addEventListener('backend-rate-limit', handler);
  return () => window.removeEventListener('backend-rate-limit', handler);
}, []);

useEffect(() => {
  const handleBackendOverload = () => {
    setGlobalError('server');
    setIsOverload(true);
    setIsDown(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  window.addEventListener('backend-overload', handleBackendOverload);
  return () => window.removeEventListener('backend-overload', handleBackendOverload);
}, []);
   const reportError = (error: Error, finalRetry: boolean = false) => {
    let type: GlobalErrorType = 'unknown';
    let overload = false;
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (error instanceof ServerOverloadError) { type = 'server'; overload = true; }
    else if (error instanceof RateLimitError)  { type = 'server'; }
    else if (!isOnline)                        { type = 'network'; }
    else if (error.message?.includes('500') || error.message?.includes('503')) { type = 'server'; }
    else if ((error as any).name === 'TypeError') { type = 'server'; }

    if (finalRetry) {
      errorCountRef.current++;
      // Capture the type/overload at the time this call fires, not at timer-fire time
      const capturedType = type;
      const capturedOverload = overload;
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          setGlobalError(capturedType);
          setIsOverload(capturedOverload);
          timerRef.current = null;
        }, 10000);
      }
      // If a timer is already running, update it only if severity increased
      finalErrorTypeRef.current = type;
      finalOverloadRef.current = overload;
    }
  };
  

   const clearError = () => {
    errorCountRef.current = Math.max(0, errorCountRef.current - 1);
    if (errorCountRef.current === 0 && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      finalErrorTypeRef.current = null;
      finalOverloadRef.current = false;
    }
  };

  const handleRetry = () => {
    setIsRetrying(true);
    window.location.reload();
  };


  
  if (globalError) {
    return (
      <GlobalErrorPage
        errorType={globalError}
        overload={isOverload}
             down={isDown}    
             rateLimit={isRateLimit} 
        onRetry={handleRetry}
        isRetrying={isRetrying}
      />
    );
  }

  return (
    <GlobalErrorContext.Provider value={{ reportError, clearError }}>
      {children}
    </GlobalErrorContext.Provider>
  );
}