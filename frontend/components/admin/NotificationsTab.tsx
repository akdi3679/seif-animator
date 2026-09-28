'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR } from '@/lib/api/hooks';
import { adminAPI } from '@/lib/api/client';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { toast } from 'sonner';
import { ActionConfirmDialog } from '@/components/admin/ActionConfirmDialog';
export function NotificationsTab() {
  const t = useTranslations('admin.monitor');
  const { data, error, mutate, isValidating } = useAdminGETSWR<any>('/monitor/notifications/status');
  const [testLoading, setTestLoading] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const handleTest = async (deleteCode: string) => {
    setTestLoading(true);
    setTestError(null);
    try {
      await adminAPI('/monitor/notifications/test', {
        method: 'POST',
        body: JSON.stringify({ deleteCode }),
      });
      toast.success(t('testSent'));
      setTestDialogOpen(false);
    } catch (err: any) {
      setTestError(err.message || t('error'));
    } finally {
      setTestLoading(false);
    }
  };

  if (error) return <p className="text-red-500">{t('errorLoading')}</p>;
  if (!data && isValidating) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('notificationsStatus')}</h2>
        <RefreshButton onRefresh={() => mutate()} loading={isValidating} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border p-6">
          <h3 className="font-bold text-lg mb-2">{t('email')}</h3>
          <p className={data.emailConfigured ? 'text-green-600' : 'text-red-500'}>
            {data.emailConfigured ? t('configured') : t('notConfigured')}
          </p>
          {data.emailQueue && (
            <div className="mt-2 text-sm text-gray-500">
              {t('queue')}: {data.emailQueue.waiting} waiting, {data.emailQueue.active} active, {data.emailQueue.completed} completed, {data.emailQueue.failed} failed
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border p-6">
          <h3 className="font-bold text-lg mb-2">{t('telegram')}</h3>
          <p className={data.telegramConfigured ? 'text-green-600' : 'text-red-500'}>
            {data.telegramConfigured ? t('configured') : t('notConfigured')}
          </p>
          {data.telegramQueue && (
            <div className="mt-2 text-sm text-gray-500">
              {t('queue')}: {data.telegramQueue.waiting} waiting, {data.telegramQueue.active} active, {data.telegramQueue.completed} completed, {data.telegramQueue.failed} failed
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setTestDialogOpen(true)}>{t('sendTest')}</Button>
      </div>

   <ActionConfirmDialog
  open={testDialogOpen}
  onOpenChange={(open) => { if (!open) setTestDialogOpen(false); }}
  onConfirm={handleTest}
  title={t('testTitle')}
  description={t('testDescription')}
  confirmLabel={t('sendTest')}
  error={testError}
  loading={testLoading}
/>
    </div>
  );
}