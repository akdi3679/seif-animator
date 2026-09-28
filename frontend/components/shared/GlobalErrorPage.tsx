'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { WifiOff, PlugZap, ServerCrash, AlertTriangle, Loader2, Gauge, AlertOctagon } from 'lucide-react';

interface GlobalErrorPageProps {
  errorType: 'network' | 'server' | 'render' | 'unknown';
  overload?: boolean;
  errorMessage?: string;
  down?: boolean;
  rateLimit?: boolean;
  onRetry: () => void;
  isRetrying?: boolean;
}

export function GlobalErrorPage({ errorType, overload = false, rateLimit = false, errorMessage, onRetry, down = false, isRetrying = false }: GlobalErrorPageProps) {


  const t = useTranslations('common');

  const config = {
    network: {
      icon: <WifiOff className="w-20 h-20 text-gray-400" />,
      defaultMessage: t('error.network'),
    },
    server: {
  icon: rateLimit ? <AlertOctagon className="w-20 h-20 text-gray-400" />
       : overload ? <Gauge className="w-20 h-20 text-gray-400" />
       : down ? <PlugZap className="w-20 h-20 text-gray-400" />
       : <ServerCrash className="w-20 h-20 text-gray-400" />,
  defaultMessage: rateLimit ? t('error.rateLimit')
                : overload ? t('error.overload')
                : down ? t('error.down')
                : t('error.server'),
},
    render: {
      icon: <AlertTriangle className="w-20 h-20 text-gray-400" />,
      defaultMessage: t('error.default'),
    },
    unknown: {
      icon: <AlertTriangle className="w-20 h-20 text-gray-400" />,
      defaultMessage: t('error.default'),
    },
  };

  const { icon, defaultMessage } = config[errorType];

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-white z-50 p-8 text-center">
      {icon}
      <h1 className="mt-6 text-2xl font-bold text-gray-800">{t('error.title')}</h1>
      <p className="mt-2 text-gray-500 max-w-md">
        {errorMessage || defaultMessage}
      </p>
      <Button
        onClick={onRetry}
        disabled={isRetrying}
        className="mt-8 px-6 py-2 bg-primary text-white rounded-xl hover:bg-primary/80 disabled:opacity-50"
      >
        {isRetrying ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('retrying')}
          </>
        ) : (
          t('retry')
        )}
      </Button>
    </div>
  );
}