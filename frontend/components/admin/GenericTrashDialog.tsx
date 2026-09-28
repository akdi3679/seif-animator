'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
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
import { RetryableError } from '@/components/shared/RetryableError';
interface Column {
  key: string;
  label: string;
}

interface GenericTrashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint: string;                              // e.g. 'bookings?deleted=true'
  restoreEndpoint: (id: string) => string;      // e.g. (id) => `/bookings/${id}/restore`
  deleteEndpoint: (id: string) => string;        // e.g. (id) => `/bookings/${id}?permanent=true`
  title: string;
  columns: Column[];
  searchPlaceholder: string;
  emptyMessage: string;
  renderRow: (item: any, actions: { onRestore: (id: string) => void; onDelete: (id: string) => void; onView?: (item: any) => void }) => React.ReactNode;
  t: (key: string) => string;
  onView?: (item: any) => void;
}

export function GenericTrashDialog({
  open,
  onOpenChange,
  endpoint,
  restoreEndpoint,
  deleteEndpoint,
  title,
  columns,
  searchPlaceholder,
  emptyMessage,
  renderRow,
  t,
  onView,
}: GenericTrashDialogProps) {
  const [search, setSearch] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const { data, mutate, isValidating, error, refresh } = useAdminGETSWR<any>(endpoint, { manual: true });

  const hasFetched = useRef(false);

  useEffect(() => {
    if (open && !hasFetched.current) {
      hasFetched.current = true;
      refresh();
    }
  }, [open, refresh]);

  // Dynamic mutation hooks – resolve endpoint fresh when target changes
  const { trigger: restore } = useAdminPOST(
    () => restoreEndpoint(restoreTarget || ''),
    { showToast: false }
  );
  const { trigger: permanentDelete } = useAdminDELETE(
    () => deleteEndpoint(deleteTarget || ''),
    { showToast: false }
  );

  // Normalize data: the endpoint may return { bookings: [...] } or a plain array
  const items = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    const keys = Object.keys(data).filter(k => Array.isArray(data[k]));
    if (keys.length > 0) return data[keys[0]];
    return [];
  }, [data]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const term = search.toLowerCase();
    return items.filter((item: any) =>
      columns.some(col => {
        const val = item[col.key];
        return val && String(val).toLowerCase().includes(term);
      })
    );
  }, [items, search, columns]);

  const handleRestore = async () => {
    if (!restoreTarget) return;
    const target = restoreTarget;
    try {
      await restore({});
      mutate((current: any) => {
        if (!current) return current;
        if (Array.isArray(current)) return current.filter((b: any) => b.id !== target);
        const listKey = Object.keys(current).find(k => Array.isArray(current[k])) || 'data';
        const list = current[listKey];
        return { ...current, [listKey]: list.filter((b: any) => b.id !== target), total: (current.total || 0) - 1 };
      }, false);
      toast.success(t('restored'));
    } catch (err: any) {
      toast.error(err.message || t('error'));
    }
    setRestoreTarget(null);
  };

  const handlePermanentDelete = async (deleteCode: string) => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteLoading(true);
    try {
      await permanentDelete({ deleteCode });
      mutate((current: any) => {
        if (!current) return current;
        if (Array.isArray(current)) return current.filter((b: any) => b.id !== target);
        const listKey = Object.keys(current).find(k => Array.isArray(current[k])) || 'data';
        const list = current[listKey];
        return { ...current, [listKey]: list.filter((b: any) => b.id !== target), total: (current.total || 0) - 1 };
      }, false);
      toast.success(t('permanentlyDeleted'));
      setDeleteTarget(null);
    } catch (err: any) {
      if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
      else if (err.status === 404) toast.error(t('alreadyDeleted'));
      else if (err.status === 400) toast.error(t('invalidCode'));
      else toast.error(err.message || t('error'));
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
<DialogContent className="bg-white max-w-5xl max-h-[85vh] overflow-y-auto [&>button.absolute]:hidden">
        <DialogHeader>
  <DialogTitle className="flex items-center gap-2">
    <Trash2 className="w-5 h-5 text-red-500" /> {title}
    <span className="text-xs font-normal text-gray-500 ml-2">{t('autodeleteinfo')}</span>
    <div className="ml-auto flex items-center gap-2">
      <RefreshButton onRefresh={() => refresh()} loading={isValidating} />
      <button
        onClick={() => onOpenChange(false)}
        className="p-1 rounded-full hover:bg-gray-200 transition-colors"
        title="Fermer"
      >
        <X className="w-5 h-5 text-gray-500" />
      </button>
    </div>
  </DialogTitle>
</DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <Input placeholder={searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-8" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-2.5 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {!data && !error && isValidating && (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {data && isValidating && (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

{error && (
  <div className="py-10">
    <RetryableError
      error={error}
      onRetry={() => refresh()}
      isRetrying={isValidating}
    />
  </div>
)}
          {!isValidating && items.length === 0 && !error && (
            <p className="text-center text-gray-500 py-10">{emptyMessage}</p>
          )}

          {!isValidating && filteredItems.length > 0 && (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full min-w-[800px]">
                <thead className="bg-gray-50 text-left text-sm text-gray-500">
                  <tr>
                    {columns.map((col) => (
                      <th key={col.key} className="p-3">{col.label}</th>
                    ))}
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item: any) =>
                    renderRow(item, {
                      onRestore: (id) => setRestoreTarget(id),
                      onDelete: (id) => setDeleteTarget(id),
                      onView: onView ? (it) => onView(it) : undefined,
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <ConfirmDialog
          open={!!restoreTarget}
          onOpenChange={(open) => { if (!open) setRestoreTarget(null); }}
          onConfirm={handleRestore}
          title={t('confirmRestoreTitle')}
          message={t('confirmRestoreMessage')}
          confirmText={t('restore')}
        />

        <DeleteConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
          onConfirm={handlePermanentDelete}
          loading={deleteLoading}
        />
      </DialogContent>
    </Dialog>
  );
}