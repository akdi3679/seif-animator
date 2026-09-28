'use client';
import { useEffect, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR, useAdminPOST, useAdminDELETE } from '@/lib/api/hooks';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { toast } from 'sonner';
import { RotateCcw, Trash2, Search, X } from 'lucide-react';
import { RateLimitError } from '@/lib/api/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TrashNewsletterDialog({ open, onOpenChange }: Props) {
  const t = useTranslations('admin.newsletter');
  const [search, setSearch] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const { data, mutate, isValidating, error, refresh } = useAdminGETSWR<any[]>('/newsletter/trash', { manual: true });
  useEffect(() => { if (open) refresh(); }, [open]);

  const { trigger: restore } = useAdminPOST(`/newsletter/${restoreTarget}/restore`, { showToast: false });
  const { trigger: permanentDelete } = useAdminDELETE(`/newsletter/${deleteTarget}?permanent=true`, { showToast: false });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data;
    const term = search.toLowerCase();
    return data.filter((s: any) => (s.email || '').toLowerCase().includes(term) || (s.phone || '').toLowerCase().includes(term));
  }, [data, search]);

  const handleRestore = async () => {
    if (!restoreTarget) return;
    const target = restoreTarget;
    try {
      await restore({});
      mutate((current) => current?.filter(s => s.id !== target) || [], false);
      toast.success(t('restored'));
    } catch (err: any) { toast.error(err.message || t('error')); }
    setRestoreTarget(null);
  };

  const handlePermanentDelete = async (code: string) => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteLoading(true);
    try {
      await permanentDelete({ deleteCode: code });
      mutate((current) => current?.filter(s => s.id !== target) || [], false);
      toast.success(t('permanentlyDeleted'));
      setDeleteTarget(null);
    } catch (err: any) { toast.error(err.message || t('error')); }
    setDeleteLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-500" /> {t('trashTitle')}
            <RefreshButton onRefresh={() => refresh()} loading={isValidating} />
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <Input placeholder={t('searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 pr-8" />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-2.5 text-gray-400"><X className="w-4 h-4" /></button>}
          </div>
          {error && <p className="text-red-500 text-center">{t('error')}</p>}
          {!isValidating && !data?.length && <p className="text-center text-gray-500 py-10">{t('trashEmpty')}</p>}
          {data && data.length > 0 && (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full min-w-[800px]">
                <thead className="bg-gray-50 text-left text-sm text-gray-500">
                  <tr>
                    <th className="p-3">{t('email')}</th>
                    <th className="p-3">{t('phone')}</th>
                    <th className="p-3">{t('subscribedAt')}</th>
                    <th className="p-3 text-right">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s: any) => (
                    <tr key={s.id} className="border-t hover:bg-gray-50">
                      <td className="p-3">{s.email || '—'}</td>
                      <td className="p-3">{s.phone || '—'}</td>
                      <td className="p-3">{new Date(s.subscribed_at).toLocaleDateString('fr-FR')}</td>
                      <td className="p-3 flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setRestoreTarget(s.id)}><RotateCcw className="w-4 h-4 text-green-600" /></Button>
                        <Button variant="outline" size="sm" onClick={() => setDeleteTarget(s.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <ConfirmDialog
          open={!!restoreTarget} onOpenChange={(open) => { if (!open) setRestoreTarget(null); }} onConfirm={handleRestore}
          title={t('confirmRestoreTitle')} message={t('confirmRestoreMessage')} confirmText={t('restore')}
        />
        <DeleteConfirmDialog
          open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} onConfirm={handlePermanentDelete} loading={deleteLoading}
        />
      </DialogContent>
    </Dialog>
  );
}