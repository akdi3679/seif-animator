'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR, useAdminDELETE } from '@/lib/api/hooks';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { RetryableError } from '@/components/shared/RetryableError';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { GenericTrashDialog } from '@/components/admin/GenericTrashDialog';
import { GenericFilterBar } from '@/components/admin/GenericFilterBar';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { RateLimitError } from '@/lib/api/types';
import { Copy, Trash2, Loader2, RotateCcw } from 'lucide-react';

// ── Highlight helper (same as bookings) ──
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

const ALL_VALUE = '__all__';
const LIMIT = 20;

export default function NewsletterTab() {
  const t = useTranslations('admin.newsletter');

  // Local filter states (before apply)
  const [localSearch, setLocalSearch] = useState('');
  const [localDateFrom, setLocalDateFrom] = useState('');
  const [localDateTo, setLocalDateTo] = useState('');

  // Server-side filter states (after apply)
  const [serverSearch, setServerSearch] = useState('');
  const [serverDateFrom, setServerDateFrom] = useState('');
  const [serverDateTo, setServerDateTo] = useState('');
  const [page, setPage] = useState(0);

  const [trashOpen, setTrashOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (serverSearch) params.set('search', serverSearch);
    if (serverDateFrom) params.set('dateFrom', serverDateFrom);
    if (serverDateTo) params.set('dateTo', serverDateTo);
    params.set('limit', LIMIT.toString());
    params.set('offset', (page * LIMIT).toString());
    return params.toString();
  }, [serverSearch, serverDateFrom, serverDateTo, page]);

  const {
    data,
    error,
    mutate,
    isValidating,
    retry,
    isRetrying,
  } = useAdminGETSWR<{ subscribers: any[]; total: number }>(`/newsletter?${queryString}`);

  const { trigger: deleteSub } = useAdminDELETE(() => `/newsletter/${deleteTarget}`);

  const applyAllFilters = () => {
    setServerSearch(localSearch);
    setServerDateFrom(localDateFrom);
    setServerDateTo(localDateTo);
    setPage(0);
  };

  const clearAllFilters = () => {
    setLocalSearch(''); setServerSearch('');
    setLocalDateFrom(''); setServerDateFrom('');
    setLocalDateTo(''); setServerDateTo('');
    setPage(0);
  };

  const removeFilter = (key: string) => {
    if (key === 'search') { setLocalSearch(''); setServerSearch(''); }
    if (key === 'dateFrom') { setLocalDateFrom(''); setServerDateFrom(''); }
    if (key === 'dateTo') { setLocalDateTo(''); setServerDateTo(''); }
    setPage(0);
  };

  const handleDelete = async (deleteCode: string) => {
    if (!deleteTarget) return;
    const targetId = deleteTarget;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await deleteSub({ deleteCode });
      mutate((current) => {
        if (!current) return current;
        return {
          ...current,
          subscribers: current.subscribers.filter((s: any) => s.id !== targetId),
          total: current.total - 1,
        };
      }, false);
      toast.success(t('deleted'));
      setDeleteTarget(null);
    } catch (err: any) {
      if (err instanceof RateLimitError) setDeleteError(t('rateLimit', { seconds: err.retryAfter }));
      else if (err.status === 400) setDeleteError(t('invalidCode'));
      else if (err.status === 404) setDeleteError(t('notFound'));
      else setDeleteError(t('error'));
    } finally {
      setDeleteLoading(false);
    }
  };

  // Client‑side supplementary filter (instant)
  const subscribers = data?.subscribers || [];
  const total = data?.total || 0;

  const filteredSubscribers = useMemo(() => {
    if (!localSearch) return subscribers;
    const term = localSearch.toLowerCase();
    return subscribers.filter(
      (s: any) =>
        (s.email || '').toLowerCase().includes(term) ||
        (s.phone || '').toLowerCase().includes(term)
    );
  }, [subscribers, localSearch]);

  const activeFilters: { key: string; label: string }[] = [];
  if (serverSearch) activeFilters.push({ key: 'search', label: `${t('search')}: "${serverSearch}"` });
  if (serverDateFrom) activeFilters.push({ key: 'dateFrom', label: `${t('dateFrom')}: ${serverDateFrom}` });
  if (serverDateTo) activeFilters.push({ key: 'dateTo', label: `${t('dateTo')}: ${serverDateTo}` });

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('title')}</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTrashOpen(true)}>
            <Trash2 className="w-4 h-4 mr-2" /> {t('trash')}
          </Button>
          <RefreshButton onRefresh={() => mutate()} loading={isValidating} />
        </div>
      </div>

      <GenericFilterBar
        selectFilters={[]}
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
            minDate: localDateFrom,   // end date can't be before start date
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
        ) : filteredSubscribers.length === 0 ? (
          <p className="text-center text-gray-500 py-10">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('email')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('phone')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('subscribedAt')}</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubscribers.map((sub: any) => (
                  <tr key={sub.id} className="border-t">
                    <td className="px-4 py-3">
                      {sub.email ? (
                        <div className="flex items-center gap-2">
                          <a href={`mailto:${sub.email}`} className="text-primary hover:underline">
                            <Highlight text={sub.email} term={localSearch} />
                          </a>
                          <button
                            onClick={() => { navigator.clipboard.writeText(sub.email); toast.success('Email copié'); }}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {sub.phone ? (
                        <div className="flex items-center gap-2">
                          <span><Highlight text={sub.phone} term={localSearch} /></span>
                          <button
                            onClick={() => { navigator.clipboard.writeText(sub.phone); toast.success('Téléphone copié'); }}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">{new Date(sub.subscribed_at).toLocaleDateString('fr-FR')}</td>
                    <td className="px-4 py-3 flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDeleteTarget(sub.id)}>
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

      {total > 0 && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">
            {t('showing', { from: page * LIMIT + 1, to: Math.min((page + 1) * LIMIT, total), total })}
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
        endpoint="/newsletter/trash"
        restoreEndpoint={(id) => `/newsletter/${id}/restore`}
        deleteEndpoint={(id) => `/newsletter/${id}?permanent=true`}
        title={t('trashTitle')}
        columns={[
          { key: 'email', label: t('email') },
          { key: 'phone', label: t('phone') },
          { key: 'subscribed_at', label: t('subscribedAt') },
        ]}
        searchPlaceholder={t('searchPlaceholder')}
        emptyMessage={t('trashEmpty')}
        t={t}
        renderRow={(sub, actions) => (
          <tr key={sub.id} className="border-t hover:bg-gray-50">
            <td className="p-3">{sub.email || '—'}</td>
            <td className="p-3">{sub.phone || '—'}</td>
            <td className="p-3">{new Date(sub.subscribed_at).toLocaleDateString('fr-FR')}</td>
            <td className="p-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => actions.onRestore(sub.id)}>
                <RotateCcw className="w-4 h-4 text-green-600" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => actions.onDelete(sub.id)}>
                <Trash2 className="w-4 h-4 text-red-500" />
              </Button>
            </td>
          </tr>
        )}
      />
    </div>
  );
}