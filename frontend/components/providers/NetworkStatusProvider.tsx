'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

export function NetworkStatusProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common');

  useEffect(() => {
    const handleOnline = () => toast.success(t('connectionRestored'));

    const handleOffline = () => toast.error(t('error.network'));


    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return <>{children}</>;
}