'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR, useAdminPUT } from '@/lib/api/hooks';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';

export default function SecretCodesTab() {
  const t = useTranslations('admin.settings');
  const hasFetched = useRef(false);
  const { data, refresh, isValidating, error, retry, isRetrying } = useAdminGETSWR<any[]>('/secret-codes', { manual: true });
  const [editing, setEditing] = useState<string | null>(null);
  const [newCode, setNewCode] = useState('');
  const [saving, setSaving] = useState(false);
  const { trigger: updateCode } = useAdminPUT();

  useEffect(() => {
    if (!hasFetched.current) { hasFetched.current = true; refresh(); }
  }, [refresh]);

  if (!data && !error) return <LoadingSpinner />;
  if (error) return <RetryableError error={error} onRetry={retry} isRetrying={isRetrying} />;

  const handleSave = async (purpose: string) => {
    setSaving(true);
    try {
      await updateCode(`/secret-codes/${purpose}`, { code: newCode });
      toast.success(t('codeUpdated'));
      setEditing(null);
      refresh();
    } catch {
      toast.error(t('error'));
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('secretsTitle')}</h2>
        <RefreshButton onRefresh={refresh} loading={isValidating} />
      </div>
      <div className="grid grid-cols-1 gap-4">
        {data?.map((code: any) => (
          <div key={code.purpose} className="bg-white p-4 rounded-2xl border flex items-center justify-between">
            <div>
              <p className="font-semibold">{code.purpose}</p>
              <p className="text-sm text-gray-500">{code.code || '—'}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setEditing(code.purpose); setNewCode(code.code); }}>
              {t('edit')}
            </Button>
          </div>
        ))}
      </div>
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-80">
            <h3 className="font-bold mb-2">{t('editCode')}: {editing}</h3>
            <Input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder={t('newCode')}
              className="mb-4"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditing(null)}>{t('cancel')}</Button>
              <Button onClick={() => handleSave(editing)} disabled={saving}>{t('save')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}