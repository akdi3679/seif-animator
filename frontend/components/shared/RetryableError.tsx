'use client';

import { useTranslations } from 'next-intl';
import {  Loader2 } from 'lucide-react';

interface RetryableErrorProps {
  error: Error;
  onRetry: () => void;
  isRetrying?: boolean;
}

export function RetryableError({ error, onRetry, isRetrying = false }: RetryableErrorProps) {
  const t = useTranslations('common');

  return (
    <div className="flex items-center justify-center gap-2 p-4 text-center text-gray-500">
      <span className="text-sm">{t('error.generic')}</span>
      <button
        onClick={onRetry}
        disabled={isRetrying}
        className="text-primary underline text-sm disabled:opacity-50"
      >
        {isRetrying ? <Loader2 className="w-4 h-4 animate-spin" /> : t('retry')}
      </button>
    </div>
  );
}