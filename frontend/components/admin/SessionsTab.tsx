'use client';
import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR } from '@/lib/api/hooks';
import { adminAPI } from '@/lib/api/client';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { RetryableError } from '@/components/shared/RetryableError';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { toast } from 'sonner';
import { ActionConfirmDialog } from '@/components/admin/ActionConfirmDialog';

// ── Helper: friendly device name from user agent ──────────────
function getFriendlyAgent(ua?: string): string {
  if (!ua) return '—';
  // Extract browser
  let browser = 'Browser';
  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
  // Extract OS
  let os = '';
  if (ua.includes('Windows NT')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';
  return os ? `${browser} on ${os}` : browser;
}

export function SessionsTab() {
  const t = useTranslations('admin.monitor');
  const { data, error, mutate, isValidating, retry, isRetrying } =
    useAdminGETSWR<{ items: any[]; total: number }>('/monitor/sessions');

  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Current browser's user agent (stable for the lifetime of the tab)
  const currentUserAgent = useMemo(() => navigator.userAgent, []);

  // Check if a session belongs to the current device
  const isCurrentDevice = (session: any) => session.userAgent === currentUserAgent;

  const handleRevoke = async (deleteCode: string) => {
    if (!revokeTarget) return;
    setRevokeLoading(true);
    setRevokeError(null);
    try {
      await adminAPI(`/monitor/sessions/${revokeTarget}`, {
        method: 'DELETE',
        body: JSON.stringify({ deleteCode }),
      });
      mutate(
        (current) => ({
          ...current,
          items: current.items.filter((s: any) => s.id !== revokeTarget),
          total: current.total - 1,
        }),
        false
      );
      toast.success(t('sessionRevoked'));
      setRevokeTarget(null);
    } catch (err: any) {
      setRevokeError(err.message || t('error'));
    } finally {
      setRevokeLoading(false);
    }
  };

  if (error) return <RetryableError error={error} onRetry={retry} isRetrying={isRetrying} />;
  if (!data && isValidating) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">
          {t('activeSessions')} ({data?.total || 0})
        </h2>
        <RefreshButton onRefresh={() => mutate()} loading={isValidating} />
      </div>

      <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto">
        {data?.items.length === 0 ? (
          <p className="text-center text-gray-500 py-10">{t('noSessions')}</p>
        ) : (
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('user')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('ip')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('fingerprint')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('geo')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('agent')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('device')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('created')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('expires')}</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((session: any) => (
                <tr key={session.id} className="border-t">
                  <td className="px-4 py-3">{session.user?.email || session.userId}</td>
                  <td className="px-4 py-3">{session.ipAddress}</td>
                  <td
                    className="px-4 py-3 font-mono text-xs max-w-[120px] truncate"
                    title={session.deviceFingerprint}
                  >
                    {session.deviceFingerprint?.substring(0, 16) || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {session.geoLocation
                      ? `${session.geoLocation.city || ''} ${session.geoLocation.country || ''}`.trim() || '—'
                      : '—'}
                  </td>
                  {/* ── Friendly agent name with full hover ──── */}
                  <td
                    className="px-4 py-3 max-w-[180px] truncate"
                    title={session.userAgent || ''}
                  >
                    {getFriendlyAgent(session.userAgent)}
                  </td>
                  {/* ── This device indicator ────────────────── */}
                  <td className="px-4 py-3">
                    {isCurrentDevice(session) ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        {t('thisDevice')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                        {t('otherDevice')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{new Date(session.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{new Date(session.expiresAt).toLocaleString()}</td>
                  <td className="px-4 py-3 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setRevokeTarget(session.id)}>
                      {t('revoke')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ActionConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        onConfirm={handleRevoke}
        title={t('revokeTitle')}
        description={t('revokeDescription')}
        confirmLabel={t('revoke')}
        error={revokeError}
        loading={revokeLoading}
      />
    </div>
  );
}