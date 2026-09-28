'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR } from '@/lib/api/hooks';
import { adminAPI } from '@/lib/api/client';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';
import { Badge } from '@/components/ui/badge';
import { Toggle } from '@/components/ui/toggle';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function SystemSettingsTab() {
  const t = useTranslations('admin.settings');
  const hasFetched = useRef(false);

  const { data: flags, refresh: refreshFlags, isValidating: flagsLoading, error: flagsError, retry: flagsRetry, isRetrying: flagsRetrying } = useAdminGETSWR<any[]>('/feature-flags', { manual: true });
  const { data: crons, refresh: refreshCrons, isValidating: cronsLoading, error: cronsError, retry: cronsRetry, isRetrying: cronsRetrying } = useAdminGETSWR<any[]>('/cron', { manual: true });

  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    if (!hasFetched.current) { hasFetched.current = true; refreshFlags(); refreshCrons(); }
  }, [refreshFlags, refreshCrons]);

  const refreshAll = () => { refreshFlags(); refreshCrons(); };
  const initialLoading = !((flags || flagsError) && (crons || cronsError));

  const handleToggleFlag = async (name: string, enabled: boolean) => {
    setToggling(`flag-${name}`);
    const minVisible = new Promise(r => setTimeout(r, 500));
    try {
      await Promise.all([adminAPI(`/feature-flags/${name}`, { method: 'PUT', body: JSON.stringify({ enabled }) }), minVisible]);
      await refreshFlags();
      toast.success(t('flagUpdated'));
    } catch { toast.error(t('error')); }
    finally { setToggling(null); }
  };

  const handleToggleCron = async (name: string, enabled: boolean) => {
    setToggling(`cron-${name}`);
    const minVisible = new Promise(r => setTimeout(r, 500));
    try {
      await Promise.all([adminAPI(`/cron/${name}`, { method: 'PUT', body: JSON.stringify({ enabled }) }), minVisible]);
      await refreshCrons();
      toast.success(t('cronUpdated'));
    } catch { toast.error(t('error')); }
    finally { setToggling(null); }
  };

  if (initialLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('systemTitle')}</h2>
        <RefreshButton onRefresh={refreshAll} loading={flagsLoading || cronsLoading} />
      </div>

      {/* Feature flags — own error boundary */}
      <section className="space-y-4">
        <h3 className="font-semibold">{t('flagsTitle')}</h3>
        {flagsError ? (
          <RetryableError error={flagsError} onRetry={flagsRetry} isRetrying={flagsRetrying} />
        ) : flags?.length === 0 ? (
          <p className="text-center text-gray-500 py-6">{t('noFlags')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {flags?.map((flag: any) => {
              const isToggling = toggling === `flag-${flag.feature_name}`;
              return (
                <div key={flag.feature_name} className="bg-white p-4 rounded-2xl border flex items-center justify-between">
                  <p className="font-semibold">{flag.feature_name}</p>
                  <div className={`relative inline-flex items-center transition-opacity ${isToggling ? 'opacity-40 pointer-events-none' : ''}`}>
                    <Toggle pressed={flag.is_enabled} onPressedChange={(pressed) => handleToggleFlag(flag.feature_name, pressed)}>
                      {flag.is_enabled ? t('enabled') : t('disabled')}
                    </Toggle>
                    {isToggling && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Cron jobs — own error boundary */}
      <section className="space-y-4">
        <h3 className="font-semibold">{t('cronTitle')}</h3>
        {cronsError ? (
          <RetryableError error={cronsError} onRetry={cronsRetry} isRetrying={cronsRetrying} />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {crons?.map((job: any) => {
              const isToggling = toggling === `cron-${job.name}`;
              return (
                <div key={job.name} className="bg-white p-4 rounded-2xl border flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{job.label}</p>
                      <span className="text-xs text-gray-400">{job.schedule}</span>
                    </div>
                    <p className="text-sm text-gray-500">{job.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={job.enabled ? 'success' : 'destructive'}>{job.enabled ? t('enabled') : t('disabled')}</Badge>
                    {!job.alwaysOn && (
                      <div className={`relative inline-flex items-center transition-opacity ${isToggling ? 'opacity-40 pointer-events-none' : ''}`}>
                        <Toggle pressed={job.enabled} onPressedChange={(pressed) => handleToggleCron(job.name, pressed)}>
                          {job.enabled ? t('disable') : t('enable')}
                        </Toggle>
                        {isToggling && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}