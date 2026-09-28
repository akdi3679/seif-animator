'use client';
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR, useAdminPUT, useAdminDELETE } from '@/lib/api/hooks';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { RetryableError } from '@/components/shared/RetryableError';
import { GenericFilterBar } from '@/components/admin/GenericFilterBar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { GenericTrashDialog } from '@/components/admin/GenericTrashDialog';
import { RateLimitError } from '@/lib/api/types';
import { ShoppingBag, Package, Trash2, RotateCcw, Loader2, Eye, Bell, X } from 'lucide-react';
import { useNotifications } from '@/components/providers/NotificationsProvider';

const ALL_VALUE = '__all__';
const LIMIT = 20;

function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.substring(0, idx)}
      <mark className="bg-yellow-200">{text.substring(idx, idx + term.length)}</mark>
      {text.substring(idx + term.length)}
    </>
  );
}

export default function OrdersTab({ isActive }: { isActive: boolean }) {
  const t = useTranslations('admin.orders');

  const [localSearch, setLocalSearch] = useState('');
  const [localStatus, setLocalStatus] = useState(ALL_VALUE);
  const [localDateFrom, setLocalDateFrom] = useState('');
  const [localDateTo, setLocalDateTo] = useState('');

  const [serverSearch, setServerSearch] = useState('');
  const [serverStatus, setServerStatus] = useState(ALL_VALUE);
  const [serverDateFrom, setServerDateFrom] = useState('');
  const [serverDateTo, setServerDateTo] = useState('');
  const [page, setPage] = useState(0);

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const {
    trigger: deleteOrder,
    loading: deleteLoading,
    error: deleteApiError,
  } = useAdminDELETE(() => `/orders/${deleteTarget}`);

  const searchTermRef = useRef('');
  useEffect(() => { searchTermRef.current = localSearch; }, [localSearch]);
const { refresh: refreshNotifications } = useNotifications();

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (serverSearch) params.set('search', serverSearch);
    if (serverStatus !== ALL_VALUE) params.set('status', serverStatus);
    if (serverDateFrom) params.set('dateFrom', serverDateFrom);
    if (serverDateTo) params.set('dateTo', serverDateTo);
    params.set('limit', LIMIT.toString());
    params.set('offset', (page * LIMIT).toString());
    return params.toString();
  }, [serverSearch, serverStatus, serverDateFrom, serverDateTo, page]);

  const { data, error, mutate, isValidating, retry, isRetrying } = useAdminGETSWR<{ orders: any[]; total: number }>(`/orders?${queryString}`);
 

  // Local filters – now includes status and date range
  const filteredOrders = useMemo(() => {
    if (!data?.orders) return [];
    let result = data.orders;

    // Client‑side search
    if (localSearch.trim()) {
      const term = localSearch.toLowerCase();
      result = result.filter((order: any) => {
        const matchMain =
          (order.customer_name || '').toLowerCase().includes(term) ||
          (order.contact_email || '').toLowerCase().includes(term) ||
          (order.order_reference || '').toLowerCase().includes(term) ||
          (order.status || '').toLowerCase().includes(term) ||
          String(order.total_amount).includes(term) ||
          (order.created_at || '').toLowerCase().includes(term) ||
          (order.shipping_address || '').toLowerCase().includes(term) ||
          (order.notes || '').toLowerCase().includes(term);
        const matchProduct = order.OrderItem?.some((item: any) =>
          (item.product_name || '').toLowerCase().includes(term)
        );
        return matchMain || matchProduct;
      });
    }

    // Local status filter
    if (localStatus !== ALL_VALUE) {
      result = result.filter((order: any) => order.status === localStatus);
    }

    // Local date range filter
    if (localDateFrom) {
      const from = new Date(localDateFrom).getTime();
      result = result.filter((order: any) => new Date(order.created_at).getTime() >= from);
    }
    if (localDateTo) {
      const to = new Date(localDateTo).setHours(23, 59, 59, 999);
      result = result.filter((order: any) => new Date(order.created_at).getTime() <= to);
    }

    return result;
  }, [data, localSearch, localStatus, localDateFrom, localDateTo]);

  const handleDelete = async (deleteCode: string) => {
    if (!deleteTarget) return;
    const targetId = deleteTarget;
    try {
      await deleteOrder({ deleteCode });
      mutate((current) => {
        if (!current) return current;
        return {
          ...current,
          orders: current.orders.filter((o: any) => o.id !== targetId),
          total: current.total - 1,
        };
      }, false);
      toast.success(t('deleted'));
      setDeleteTarget(null);
    } catch {
      // error already in deleteApiError
    }
  };

  const applyAllFilters = () => {
    setServerSearch(localSearch);
    setServerStatus(localStatus);
    setServerDateFrom(localDateFrom);
    setServerDateTo(localDateTo);
    setPage(0);
  };

  const clearAllFilters = () => {
    setLocalSearch(''); setServerSearch('');
    setLocalStatus(ALL_VALUE); setServerStatus(ALL_VALUE);
    setLocalDateFrom(''); setServerDateFrom('');
    setLocalDateTo(''); setServerDateTo('');
    setPage(0);
  };

  const removeFilter = (key: string) => {
    if (key === 'search') { setLocalSearch(''); setServerSearch(''); }
    if (key === 'status') { setLocalStatus(ALL_VALUE); setServerStatus(ALL_VALUE); }
    if (key === 'dateFrom') { setLocalDateFrom(''); setServerDateFrom(''); }
    if (key === 'dateTo') { setLocalDateTo(''); setServerDateTo(''); }
    setPage(0);
  };
// Date range validation
const dateRangeError = useMemo(() => {
  if (localDateFrom && localDateTo && localDateFrom > localDateTo) {
    return t('dateRangeError'); // translation key – add it
  }
  return null;
}, [localDateFrom, localDateTo]);
  const activeFilters: { key: string; label: string }[] = [];
  if (serverSearch) activeFilters.push({ key: 'search', label: `${t('search')}: "${serverSearch}"` });
  if (serverStatus !== ALL_VALUE) activeFilters.push({ key: 'status', label: `${t('status')}: ${serverStatus}` });
  if (serverDateFrom) activeFilters.push({ key: 'dateFrom', label: `${t('dateFrom')}: ${serverDateFrom}` });
  if (serverDateTo) activeFilters.push({ key: 'dateTo', label: `${t('dateTo')}: ${serverDateTo}` });

  const totalPages = Math.ceil((data?.total || 0) / LIMIT);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('title')}</h2>
        <div className="flex items-center gap-2 relative">
         
          
          <RefreshButton onRefresh={() => mutate()} loading={isValidating} />
          <Button variant="outline" onClick={() => setTrashOpen(true)}>
            <Trash2 className="w-4 h-4 mr-2" /> {t('trash')}
          </Button>
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
              { key: 'shipped', label: t('statusShipped') },
              { key: 'cancelled', label: t('statusCancelled') },
            ],
            value: localStatus,
            onChange: setLocalStatus,
          },
        ]}
        dateFilters={[
          {
            key: 'dateFrom',
            label: t('dateFrom'),
            value: localDateFrom,
            onChange: (val: string) => {
              setLocalDateFrom(val);
              if (localDateTo && val > localDateTo) setLocalDateTo('');
            },
            max: localDateTo || undefined,
          },
          {
            key: 'dateTo',
            label: t('dateTo'),
            value: localDateTo,
            onChange: setLocalDateTo,
            minDate: localDateFrom || undefined,
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
          dateRangeError={dateRangeError}

      />

      <div className="bg-white rounded-2xl border shadow-sm">
        {error ? (
          <RetryableError error={error} onRetry={retry} isRetrying={isRetrying} />
        ) : !data && isValidating ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filteredOrders.length === 0 ? (
          <p className="text-center text-gray-500 py-10">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('reference')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('customer')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('email')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('date')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('total')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('status')}</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order: any) => (
                  <tr key={order.id} className="border-t">
                    <td className="px-4 py-3 font-mono text-sm">
                      <Highlight text={order.order_reference} term={localSearch} />
                    </td>
                    <td className="px-4 py-3">
                      <Highlight text={order.customer_name} term={localSearch} />
                    </td>
                    <td className="px-4 py-3">
                      <Highlight text={order.contact_email} term={localSearch} />
                    </td>
                    <td className="px-4 py-3">
                      <Highlight text={new Date(order.created_at).toLocaleDateString('fr-FR')} term={localSearch} />
                    </td>
                    <td className="px-4 py-3">
                      <Highlight text={`${order.total_amount} TND`} term={localSearch} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={order.status} t={t} />
                    </td>
                    <td className="px-4 py-3 flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedOrder(order)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteTarget(order.id)}
                        title={t('delete')}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                      <StatusSelect order={order} mutate={mutate}  t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && data.total > 0 && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">
            {t('showing', { from: page * LIMIT + 1, to: Math.min((page + 1) * LIMIT, data.total), total: data.total })}
          </span>
          <div className="flex items-center gap-2">
            <Button disabled={page === 0} onClick={() => setPage(p => p - 1)} variant="outline" size="sm">{t('previous')}</Button>
            <span className="text-sm font-medium">{t('page')} {page + 1} / {totalPages}</span>
            <Button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} variant="outline" size="sm">{t('next')}</Button>
          </div>
        </div>
      )}

      {selectedOrder && (
        <OrderDetailDialog
          order={selectedOrder}
          open={!!selectedOrder}
          onOpenChange={(open) => { if (!open) setSelectedOrder(null); }}
          t={t}
          searchTerm={searchTermRef.current}
        />
      )}

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={handleDelete}
        error={deleteApiError?.message ?? null}
        loading={deleteLoading}
      />

      <GenericTrashDialog
        open={trashOpen}
         onOpenChange={setTrashOpen}
         endpoint="/orders?deleted=true"
         restoreEndpoint={(id) => `/orders/${id}/restore`}
         deleteEndpoint={(id) => `/orders/${id}/permanent`}
         title={t('trashTitle')}
        columns={[
          { key: 'order_reference', label: t('reference') },
          { key: 'customer_name', label: t('customer') },
          { key: 'created_at', label: t('date') },
        ]}
       searchPlaceholder={t('searchPlaceholder')}
         emptyMessage={t('trashEmpty')}
         t={t}
       onView={(order) => setSelectedOrder(order)}
        renderRow={(order, actions) => (
          <tr key={order.id} className="border-t hover:bg-gray-50">
            <td className="p-3">{order.order_reference}</td>
            <td className="p-3">{order.customer_name}</td>
            <td className="p-3">{new Date(order.created_at).toLocaleDateString('fr-FR')}</td>
            <td className="p-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => actions.onView?.(order)}>
                <Eye className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => actions.onRestore(order.id)}>
                <RotateCcw className="w-4 h-4 text-green-600" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => actions.onDelete(order.id)}>
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </td>
          </tr>
        )}
      />
    </div>
  );
}

/* ── Sub‑components ─── */
function StatusBadge({ status, t }: { status: string; t: any }) {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-green-100 text-green-700',
    shipped: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs ${colors[status] || 'bg-gray-100 text-gray-700'}`}>
      {t(`status${status.charAt(0).toUpperCase() + status.slice(1)}`)}
    </span>
  );
}

function StatusSelect({ order, mutate,  t }: {
  order: any;
  mutate: any;
  t: any;
}) {
  const [loading, setLoading] = useState(false);
  const { trigger: updateStatus } = useAdminPUT(`/orders/${order.id}/status`, { showToast: false });

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    setLoading(true);
    try {
      const data = await updateStatus({ status: newStatus });
      mutate((current: any) => {
        if (!current) return current;
        return {
          ...current,
          orders: current.orders.map((o: any) =>
            o.id === order.id ? { ...o, status: data.status } : o
          ),
        };
      }, false);
       refreshNotifications(); 
           toast.success(t('statusUpdated'));
    } catch (err: any) {
      if (err instanceof RateLimitError) {
        toast.error(t('rateLimit', { seconds: err.retryAfter }));
      } else if (err.message?.includes('Stock insuffisant')) {
        toast.error(t('stockInsufficient'));
      } else {
        toast.error(err.message || t('error'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <select
      value={order.status}
      onChange={handleChange}
      disabled={loading}
      className="border rounded px-2 py-1 text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      <option value="pending">{t('statusPending')}</option>
      <option value="confirmed">{t('statusConfirmed')}</option>
      <option value="shipped">{t('statusShipped')}</option>
      <option value="cancelled">{t('statusCancelled')}</option>
    </select>
  );
}

function OrderDetailDialog({ order, open, onOpenChange, t, searchTerm }: {
  order: any; open: boolean; onOpenChange: (open: boolean) => void; t: any; searchTerm: string;
}) {
  const { data: detail } = useAdminGETSWR<any>(open ? `/orders/${order.id}` : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-2xl p-0">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold m-0">
                {t('detailTitle')} #{order.order_reference}
              </DialogTitle>
              <p className="text-xs text-gray-500">
                {new Date(order.created_at).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
              </p>
            </div>
          </div>
          <StatusBadge status={order.status} t={t} />
        </div>
        <div className="px-6 py-6 space-y-6">
          {!detail ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (
            <>
              <section className="bg-gray-50 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">{t('customerInfo')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">{t('customer')}</label>
                    <p className="text-sm font-medium"><Highlight text={detail.customer_name} term={searchTerm} /></p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">{t('email')}</label>
                    <a href={`mailto:${detail.contact_email}`} className="text-sm text-primary hover:underline">
                      <Highlight text={detail.contact_email} term={searchTerm} />
                    </a>
                  </div>
                  {detail.contact_phone && (
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">{t('phone')}</label>
                      <p className="text-sm">{detail.contact_phone}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">{t('address')}</label>
                    <p className="text-sm text-gray-600">{detail.shipping_address}</p>
                  </div>
                  {detail.notes && (
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-400 mb-1 block">{t('notes')}</label>
                      <p className="text-sm text-gray-500 italic">{detail.notes}</p>
                    </div>
                  )}
                </div>
              </section>
              <section className="bg-gray-50 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Package className="w-4 h-4" /> {t('items')}
                </h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 font-medium text-gray-500">{t('product')}</th>
                      <th className="text-right py-2 font-medium text-gray-500">{t('quantity')}</th>
                      <th className="text-right py-2 font-medium text-gray-500">{t('unitPrice')}</th>
                      <th className="text-right py-2 font-medium text-gray-500">{t('totalPrice')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.OrderItem?.map((item: any) => (
                      <tr key={item.id} className="border-b border-gray-100 last:border-0">
                        <td className="py-2">
                          <Highlight text={item.product_name} term={searchTerm} />
                          {item.stock_quantity !== undefined && item.stock_quantity < item.quantity && (
                            <span className="text-red-500 text-xs ml-1">({t('insufficientStock')})</span>
                          )}
                        </td>
                        <td className="text-right">{item.quantity}</td>
                        <td className="text-right">{item.unit_price} TND</td>
                        <td className="text-right font-medium">{item.total_price} TND</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-200">
                  <span className="text-sm font-semibold text-gray-600">{t('total')}</span>
                  <span className="text-lg font-black text-primary">{detail.total_amount} TND</span>
                </div>
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}