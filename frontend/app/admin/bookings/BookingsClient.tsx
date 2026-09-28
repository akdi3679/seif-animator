'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR, useAdminDELETE } from '@/lib/api/hooks';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { RetryableError } from '@/components/shared/RetryableError';
import { BookingsTable } from '@/components/admin/BookingsTable';
import { BookingDetailsDialog } from '@/components/admin/BookingDetailsDialog';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { RateLimitError } from '@/lib/api/types';
import ServiceTypesTab from '@/components/admin/ServiceTypesTab';
import { Search, X, Trash2, Loader2, Eye, RotateCcw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GenericFilterBar } from '@/components/admin/GenericFilterBar';
import { GenericTrashDialog } from '@/components/admin/GenericTrashDialog';
import { useNotifications } from '@/components/providers/NotificationsProvider';

const ALL_VALUE = '__all__';
const LIMIT = 20;

export default function BookingsClient() {
  const t = useTranslations('admin.bookings');
  const { counts } = useNotifications();          // ← add

  return (
    <div className="space-y-6">
      <Tabs defaultValue="bookings" className="w-full">
        <TabsList>
          <TabsTrigger value="bookings">
            {t('title')}
            {counts.booking > 0 && (
              <span className="ml-2 w-2 h-2 rounded-full bg-primary inline-block" />
            )}
          </TabsTrigger>
          <TabsTrigger value="serviceTypes">{t('serviceTypes')}</TabsTrigger>
        </TabsList>
        <TabsContent value="bookings" className="space-y-6">
          <BookingsTabContent />
        </TabsContent>
        <TabsContent value="serviceTypes">
          <ServiceTypesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BookingsTabContent() {
  const t = useTranslations('admin.bookings');

  const [localStatus, setLocalStatus] = useState(ALL_VALUE);
  const [localService, setLocalService] = useState(ALL_VALUE);
  const [localDateFrom, setLocalDateFrom] = useState('');
  const [localDateTo, setLocalDateTo] = useState('');
  const [localSearch, setLocalSearch] = useState('');

  const [serverStatus, setServerStatus] = useState(ALL_VALUE);
  const [serverService, setServerService] = useState(ALL_VALUE);
  const [serverDateFrom, setServerDateFrom] = useState('');
  const [serverDateTo, setServerDateTo] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  const [page, setPage] = useState(0);

  const [trashOpen, setTrashOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const { data: serviceTypes } = useAdminGETSWR<any[]>('/service-types');
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (serverStatus !== ALL_VALUE) params.set('status', serverStatus);
    if (serverService !== ALL_VALUE) params.set('service', serverService);
    if (serverDateFrom) params.set('dateFrom', serverDateFrom);
    if (serverDateTo) params.set('dateTo', serverDateTo);
    if (serverSearch) params.set('search', serverSearch);
    params.set('limit', LIMIT.toString());
    params.set('offset', (page * LIMIT).toString());
    return params.toString();
  }, [serverStatus, serverService, serverDateFrom, serverDateTo, serverSearch, page]);

  const {
    data,
    error,
    mutate,
    isValidating,
    retry,
    isRetrying,
  } = useAdminGETSWR<{ bookings: any[]; total: number }>(`/bookings?${queryString}`);

  const { trigger: deleteBooking } = useAdminDELETE(
    () => `/bookings/${deleteTarget}`
  );

  const applyAllFilters = () => {
    setServerStatus(localStatus);
    setServerService(localService);
    setServerDateFrom(localDateFrom);
    setServerDateTo(localDateTo);
    setServerSearch(localSearch);
    setPage(0);
  };

  const clearAllFilters = () => {
    setLocalStatus(ALL_VALUE); setServerStatus(ALL_VALUE);
    setLocalService(ALL_VALUE); setServerService(ALL_VALUE);
    setLocalDateFrom(''); setServerDateFrom('');
    setLocalDateTo(''); setServerDateTo('');
    setLocalSearch(''); setServerSearch('');
    setPage(0);
  };

  const removeFilter = (key: string) => {
    if (key === 'status') { setLocalStatus(ALL_VALUE); setServerStatus(ALL_VALUE); }
    if (key === 'service') { setLocalService(ALL_VALUE); setServerService(ALL_VALUE); }
    if (key === 'dateFrom') { setLocalDateFrom(''); setServerDateFrom(''); }
    if (key === 'dateTo') { setLocalDateTo(''); setServerDateTo(''); }
    if (key === 'search') { setLocalSearch(''); setServerSearch(''); }
    setPage(0);
  };

  const handleDelete = async (deleteCode: string) => {
    if (!deleteTarget) return;
    const targetId = deleteTarget;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await deleteBooking({ deleteCode });
      mutate((current) => {
        if (!current) return current;
        return {
          ...current,
          bookings: current.bookings.filter((b) => b.id !== targetId),
          total: current.total - 1,
        };
      }, false);
      toast.success(t('deleted'));
      setDeleteTarget(null);
    } catch (err: any) {
      if (err instanceof RateLimitError) {
        setDeleteError(t('rateLimit', { seconds: err.retryAfter }));
      } else if (err.status === 400) {
        setDeleteError(t('invalidCode'));
      } else if (err.status === 404) {
        setDeleteError(t('notFound'));
      } else {
        setDeleteError(t('error'));
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredBookings = useMemo(() => {
    if (!data?.bookings) return [];
    let result = data.bookings;
    if (localSearch) {
    const term = localSearch.toLowerCase();
    result = result.filter((b: any) =>
      (b.contact_name || '').toLowerCase().includes(term) ||
      (b.contact_email || '').toLowerCase().includes(term) ||
      (b.contact_phone || '').toLowerCase().includes(term) ||
      (b.service_type || '').toLowerCase().includes(term) ||
      (b.location || '').toLowerCase().includes(term) ||
      (b.custom_service || '').toLowerCase().includes(term) ||
      (b.event_name || '').toLowerCase().includes(term)
    );
  }
    if (localStatus !== ALL_VALUE) result = result.filter((b: any) => b.status === localStatus);
    if (localService !== ALL_VALUE) result = result.filter((b: any) => b.service_type === localService);
    if (localDateFrom) {
      const from = new Date(localDateFrom);
      result = result.filter((b: any) => new Date(b.desired_date) >= from);
    }
    if (localDateTo) {
      const to = new Date(localDateTo);
      result = result.filter((b: any) => new Date(b.desired_date) <= to);
    }
    return result;
  }, [data, localSearch, localStatus, localService, localDateFrom, localDateTo]);

  const activeFilters: { key: string; label: string }[] = [];
  if (serverStatus !== ALL_VALUE) activeFilters.push({ key: 'status', label: `${t('status')}: ${serverStatus}` });
  if (serverService !== ALL_VALUE) {
    const svc = serviceTypes?.find((st: any) => st.calcom_slug === serverService);
    activeFilters.push({ key: 'service', label: `${t('service')}: ${svc?.name_fr || serverService}` });
  }
  if (serverDateFrom) activeFilters.push({ key: 'dateFrom', label: `${t('dateFrom')}: ${serverDateFrom}` });
  if (serverDateTo) activeFilters.push({ key: 'dateTo', label: `${t('dateTo')}: ${serverDateTo}` });
  if (serverSearch) activeFilters.push({ key: 'search', label: `${t('search')}: "${serverSearch}"` });

  const totalPages = data?.total ? Math.ceil(data.total / LIMIT) : 0;

  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2 className="text-2xl font-bold">{t('title')}</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTrashOpen(true)}>
            <Trash2 className="w-4 h-4 mr-2" /> {t('trash')}
          </Button>
          <RefreshButton onRefresh={() => mutate()} loading={isValidating} />
        </div>
      </div>

      <GenericFilterBar
        selectFilters={[
          {
            key: 'status',
            label: t('status'),
            options: [
              { key: 'pending', label: t('statusPending') },
              { key: 'confirmed', label: t('statusConfirmed') },
              { key: 'cancelled', label: t('statusCancelled') },
              { key: 'rescheduled', label: t('statusRescheduled') },
              { key: 'rejected', label: t('statusRejected') },
            ],
            value: localStatus,
            onChange: setLocalStatus,
          },
          {
            key: 'service',
            label: t('service'),
            options: serviceTypes?.map((st: any) => ({
              key: st.calcom_slug,
              label: st.name_fr,
            })) || [],
            value: localService,
            onChange: setLocalService,
          },
        ]}
        dateFilters={[
          {
            key: 'dateFrom',
            label: t('dateFrom'),
            value: localDateFrom,
            onChange: setLocalDateFrom,
          },
          {
            key: 'dateTo',
            label: t('dateTo'),
            value: localDateTo,
            onChange: setLocalDateTo,
            minDate: localDateFrom,
          },
        ]}
        searchFilter={{
          key: 'search',
          label: t('search'),
          placeholder: t('searchPlaceholder'),
          value: localSearch,
          onChange: setLocalSearch,
        }}
        activeFilters={activeFilters}
        onApply={applyAllFilters}
        onClear={clearAllFilters}
        onRemoveFilter={removeFilter}
        t={t}
      />

      <div className="bg-white rounded-2xl border shadow-sm">
        {error ? (
          <div className="p-10"><RetryableError error={error} onRetry={retry} isRetrying={isRetrying} /></div>
        ) : isValidating && !data ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredBookings.length === 0 ? (
          <p className="text-center text-gray-500 py-10">{t('noBookings')}</p>
        ) : (
          <div className="overflow-x-auto">
            <BookingsTable
              bookings={filteredBookings}
              onView={setSelectedBooking}
              onDelete={(b) => setDeleteTarget(b.id)}
              searchTerm={localSearch}
              startIndex={page * LIMIT}
            />
          </div>
        )}
      </div>

      {data && data.total > 0 && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">
            {t('showing', { from: page * LIMIT + 1, to: Math.min((page + 1) * LIMIT, data.total), total: data.total })}
          </span>
          <div className="flex items-center gap-2">
            <Button disabled={page === 0} onClick={() => setPage(p => p - 1)} variant="outline" size="sm">
              {t('previous')}
            </Button>
            <span className="text-sm font-medium">
              {t('page')} {page + 1} / {totalPages}
            </span>
            <Button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} variant="outline" size="sm">
              {t('next')}
            </Button>
          </div>
        </div>
      )}

      {selectedBooking && (
        <BookingDetailsDialog
          booking={selectedBooking}
          open={!!selectedBooking}
          onOpenChange={(open) => { if (!open) setSelectedBooking(null); }}
          onDelete={() => { setDeleteTarget(selectedBooking.id); setSelectedBooking(null); }}
        />
      )}

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteError(null); } }}
        onConfirm={handleDelete}
        error={deleteError}
        loading={deleteLoading}
      />

      <GenericTrashDialog
        open={trashOpen}
        onOpenChange={setTrashOpen}
        endpoint="/bookings?deleted=true"
        restoreEndpoint={(id) => `/bookings/${id}/restore`}
        deleteEndpoint={(id) => `/bookings/${id}?permanent=true`}
        title={t('trashTitle')}
        columns={[
          { key: 'contact_name', label: t('customer') },
          { key: 'desired_date', label: t('date') },
          { key: 'service_type', label: t('serviceType') },
        ]}
        searchPlaceholder={t('searchPlaceholder')}
        emptyMessage={t('trashEmpty')}
        t={t}
        renderRow={(booking, actions) => (
          <tr key={booking.id} className="border-t hover:bg-gray-50">
            <td className="p-3">{booking.contact_name}</td>
            <td className="p-3">{new Date(booking.desired_date).toLocaleDateString('fr-FR')}</td>
            <td className="p-3">{booking.service_type || '—'}</td>
            <td className="p-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => actions.onView?.(booking)}>
                <Eye className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => actions.onRestore(booking.id)}>
                <RotateCcw className="w-4 h-4 text-green-600" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => actions.onDelete(booking.id)}>
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </td>
          </tr>
        )}
        onView={(booking) => setSelectedBooking(booking)}
      />
    </>
  );
}