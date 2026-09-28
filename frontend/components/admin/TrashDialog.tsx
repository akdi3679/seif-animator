'use client';
import { useEffect, useState, useMemo , useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR, useAdminPOST, useAdminDELETE } from '@/lib/api/hooks';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { BookingDetailsDialog } from '@/components/admin/BookingDetailsDialog';
import { toast } from 'sonner';
import { RotateCcw, Trash2, Eye, Search, X } from 'lucide-react';
import { RateLimitError } from '@/lib/api/types';

export function TrashDialog({ open, onOpenChange }: any) {
  const t = useTranslations('admin.bookings');
  const [search, setSearch] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [viewBooking, setViewBooking] = useState<any>(null);
const [deleteLoading, setDeleteLoading] = useState(false);
  const { data, mutate, isValidating, error, refresh } = useAdminGETSWR<{ bookings: any[]; total: number }>(
    `/bookings?deleted=true`,
    { manual: true }
  );

  const hasFetched = useRef(false);

useEffect(() => {
  if (open && !hasFetched.current) {
    hasFetched.current = true;
    refresh();
  }
}, [open, refresh]);

  // Dynamic endpoints – resolve fresh every time trigger is called
 

  const { trigger: restore } = useAdminPOST(
  () => `/bookings/${restoreTarget}/restore`,
  { showToast: false }
);
const { trigger: permanentDelete } = useAdminDELETE(
  () => `/bookings/${deleteTarget}?permanent=true`,
  { showToast: false }
);

  const filteredBookings = useMemo(() => {
    if (!data?.bookings) return [];
    if (!search.trim()) return data.bookings;
    const term = search.toLowerCase();
    return data.bookings.filter((b: any) =>
      (b.contact_name || '').toLowerCase().includes(term) ||
      (b.contact_email || '').toLowerCase().includes(term) ||
      (b.service_type || '').toLowerCase().includes(term)
    );
  }, [data, search]);

  // Optimistic restore – update cache only after success
  const handleRestore = async () => {
    if (!restoreTarget) return;
    const target = restoreTarget;
    try {
      await restore({});
      mutate((current) => {
        if (!current) return current;
        return {
          ...current,
          bookings: current.bookings.filter(b => b.id !== target),
          total: current.total - 1,
        };
      }, false);
      toast.success(t('restored'));
    } catch (err: any) {
      if (err.status === 404) toast.error(t('alreadyRestored'));
      else toast.error(err.message || t('error'));
    }
    setRestoreTarget(null);
  };

  // Optimistic permanent delete – update cache only after success
  const handlePermanentDelete = async (deleteCode: string) => {
  if (!deleteTarget) return;
  const target = deleteTarget;
  setDeleteLoading(true);
  try {
    await permanentDelete({ deleteCode });
    mutate((current) => {
      if (!current) return current;
      return {
        ...current,
        bookings: current.bookings.filter(b => b.id !== target),
        total: current.total - 1,
      };
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
      <DialogContent className="bg-white max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-500" /> {t('trashTitle')}
            <span className="text-xs font-normal text-gray-500 ml-2">{t('autodelete')}</span>
            <div className="ml-auto">
              <RefreshButton onRefresh={() => refresh()} loading={isValidating} />
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <Input
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-8"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-2.5 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        {/* Initial load – no cached data */}
{!data && !error && isValidating && (
  <div className="flex justify-center py-20">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
)}

{/* Manual refresh – data exists, but we're fetching fresh data */}
{data && isValidating && (
  <div className="flex justify-center py-20">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
)}

{/* Error state */}
{error && <p className="text-red-500 text-center">{t('error')}</p>}

{/* Empty state (only when not validating and we have a data object but no bookings) */}
{!isValidating && data && filteredBookings.length === 0 && (
  <p className="text-center text-gray-500 py-10">{t('trashEmpty')}</p>
)}

{/* Data table – only rendered when not validating */}
{!isValidating && filteredBookings.length > 0 && (
  <div className="overflow-x-auto border rounded-lg">
    <table className="w-full min-w-[800px]">
      <thead className="bg-gray-50 text-left text-sm text-gray-500">
        <tr>
          <th className="p-3">Client</th>
          <th className="p-3">Date</th>
          <th className="p-3">Service</th>
          <th className="p-3 text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {filteredBookings.map((booking: any) => (
          <tr key={booking.id} className="border-t hover:bg-gray-50">
            <td className="p-3">{booking.contact_name}</td>
            <td className="p-3">{new Date(booking.desired_date).toLocaleDateString('fr-FR')}</td>
            <td className="p-3">{booking.service_type || '—'}</td>
            <td className="p-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setViewBooking(booking)}>
                <Eye className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRestoreTarget(booking.id)}>
                <RotateCcw className="w-4 h-4 text-green-600" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(booking.id)}>
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
        </div>

        <ConfirmDialog
          open={!!restoreTarget}
          onOpenChange={(open: boolean) => { if (!open) setRestoreTarget(null); }}
          onConfirm={handleRestore}
          title={t('confirmRestoreTitle')}
          message={t('confirmRestoreMessage')}
          confirmText={t('restore')}
        />

        <DeleteConfirmDialog
  open={!!deleteTarget}
  onOpenChange={(open: boolean) => { if (!open) { setDeleteTarget(null); } }}
  onConfirm={handlePermanentDelete}
  loading={deleteLoading}
/>
        {viewBooking && (
          <BookingDetailsDialog
            booking={viewBooking}
            open={!!viewBooking}
            onOpenChange={(open: boolean) => { if (!open) setViewBooking(null); }}
            onDelete={() => { setDeleteTarget(viewBooking.id); setViewBooking(null); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}