'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR, useAdminDELETE, useAdminPUT } from '@/lib/api/hooks';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { RetryableError } from '@/components/shared/RetryableError';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { RateLimitError } from '@/lib/api/types';
import { Trash2, Loader2, Eye, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GenericFilterBar } from '@/components/admin/GenericFilterBar';
import { GenericTrashDialog } from '@/components/admin/GenericTrashDialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

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

export default function MessagesTab() {
  const t = useTranslations('admin.messages');
  return <MessagesTabContent />;
}

function MessagesTabContent() {
  const t = useTranslations('admin.messages');

  const [localStatus, setLocalStatus] = useState(ALL_VALUE);
  const [localSearch, setLocalSearch] = useState('');

  const [serverStatus, setServerStatus] = useState(ALL_VALUE);
  const [serverSearch, setServerSearch] = useState('');
  const [page, setPage] = useState(0);
const [showReplyInput, setShowReplyInput] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (serverStatus !== ALL_VALUE) params.set('status', serverStatus);
    if (serverSearch) params.set('search', serverSearch);
    params.set('limit', LIMIT.toString());
    params.set('offset', (page * LIMIT).toString());
    return params.toString();
  }, [serverStatus, serverSearch, page]);

  const {
    data,
    error,
    mutate,
    isValidating,
    retry,
    isRetrying,
  } = useAdminGETSWR<{ messages: any[]; total: number }>(`/messages?${queryString}`);

  const { trigger: deleteMsg } = useAdminDELETE(() => `/messages/${deleteTarget}`);
  const { trigger: updateMsg } = useAdminPUT(() => `/messages/${selectedMsg?.id || ''}`, { showToast: false });

  const applyAllFilters = () => {
    setServerStatus(localStatus);
    setServerSearch(localSearch);
    setPage(0);
  };

  const clearAllFilters = () => {
    setLocalStatus(ALL_VALUE); setServerStatus(ALL_VALUE);
    setLocalSearch(''); setServerSearch('');
    setPage(0);
  };

  const removeFilter = (key: string) => {
    if (key === 'status') { setLocalStatus(ALL_VALUE); setServerStatus(ALL_VALUE); }
    if (key === 'search') { setLocalSearch(''); setServerSearch(''); }
    setPage(0);
  };

  const handleDelete = async (deleteCode: string) => {
    if (!deleteTarget) return;
    const targetId = deleteTarget;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await deleteMsg({ deleteCode });
      mutate((current) => {
        if (!current) return current;
        return {
          ...current,
          messages: current.messages.filter((m: any) => m.id !== targetId),
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

  // ---- Optimistic status change (Read / Reply / Update Reply) ----
  const handleMarkRead = async () => {
    if (!selectedMsg) return;
    // 1. Update cache instantly
    mutate((current) => {
      if (!current) return current;
      return {
        ...current,
        messages: current.messages.map((m: any) =>
          m.id === selectedMsg.id ? { ...m, status: 'READ' } : m
        ),
      };
    }, false);
    setSelectedMsg((prev: any) => prev ? { ...prev, status: 'READ' } : null);
    // 2. Call API
    try {
      await updateMsg({ status: 'READ' });
      toast.success(t('markedRead'));
      setSelectedMsg(null);
    } catch {
      // 3. Rollback on error
      mutate();
      toast.error(t('error'));
    }
  };

  const handleReply = async () => {
    if (!selectedMsg || !replyText.trim()) return;
    setSaving(true);
    // 1. Optimistic cache update
    const updated = {
      ...selectedMsg,
      status: 'REPLIED',
      adminNotes: replyText,
      repliedAt: new Date().toISOString(),
    };
    mutate((current) => {
      if (!current) return current;
      return {
        ...current,
        messages: current.messages.map((m: any) => (m.id === updated.id ? updated : m)),
      };
    }, false);
    setSelectedMsg(null);
    setReplyText('');
    // 2. Call API
    try {
      await updateMsg({ status: 'REPLIED', adminNotes: replyText });
      toast.success(t('replied'));
    } catch {
      mutate(); // rollback
      toast.error(t('error'));
    }
    setSaving(false);
  };

  const handleUpdateReply = async () => {
    if (!selectedMsg || !replyText.trim()) return;
    setSaving(true);
    const updated = {
      ...selectedMsg,
      adminNotes: replyText,
    };
    mutate((current) => {
      if (!current) return current;
      return {
        ...current,
        messages: current.messages.map((m: any) => (m.id === updated.id ? updated : m)),
      };
    }, false);
    setSelectedMsg(null);
    setReplyText('');
    try {
      await updateMsg({ adminNotes: replyText });
      toast.success(t('replyUpdated'));
    } catch {
      mutate();
      toast.error(t('error'));
    }
    setSaving(false);
  };

  const filteredMessages = useMemo(() => {
    if (!data?.messages) return [];
    let result = data.messages;
    if (localSearch) {
      const term = localSearch.toLowerCase();
      result = result.filter((m: any) =>
        (m.name || '').toLowerCase().includes(term) ||
        (m.email || '').toLowerCase().includes(term) ||
        (m.phone || '').toLowerCase().includes(term) ||
        (m.message || '').toLowerCase().includes(term) ||
        (m.custom_subject || '').toLowerCase().includes(term)
      );
    }
    if (localStatus !== ALL_VALUE) result = result.filter((m: any) => m.status === localStatus);
    return result;
  }, [data, localSearch, localStatus]);

  const activeFilters: { key: string; label: string }[] = [];
  if (serverStatus !== ALL_VALUE) activeFilters.push({ key: 'status', label: `${t('status')}: ${serverStatus}` });
  if (serverSearch) activeFilters.push({ key: 'search', label: `${t('search')}: "${serverSearch}"` });

  const totalPages = data?.total ? Math.ceil(data.total / LIMIT) : 0;

  return (
    <div className="space-y-6">
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
              { key: 'NEW', label: t('new') },
              { key: 'READ', label: t('read') },
              { key: 'REPLIED', label: t('replied') },
            ],
            value: localStatus,
            onChange: setLocalStatus,
          },
        ]}
        dateFilters={[]}
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
        ) : filteredMessages.length === 0 ? (
          <p className="text-center text-gray-500 py-10">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50 text-left text-sm text-gray-500">
                <tr>
                  <th className="p-4">{t('from')}</th>
                  <th className="p-4">{t('subject')}</th>
                  <th className="p-4">{t('date')}</th>
                  <th className="p-4">{t('status')}</th>
                  <th className="p-4 text-right">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredMessages.map((msg: any) => (
                  <tr key={msg.id} className="border-t hover:bg-gray-50">
                    <td className="p-4"><Highlight text={msg.name || ''} term={localSearch} /></td>
                    <td className="p-4"><Highlight text={msg.custom_subject || msg.subject_id || ''} term={localSearch} /></td>
                    <td className="p-4">{new Date(msg.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        msg.status === 'NEW' ? 'bg-blue-100 text-blue-700' :
                        msg.status === 'READ' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>{msg.status}</span>
                    </td>
                    <td className="p-4 flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => {
                        setSelectedMsg(msg);
                        setReplyText(msg.adminNotes || '');
                       setShowReplyInput(false);

                      }}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDeleteTarget(msg.id)}>
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

      {data && data.total > 0 && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">
            {t('showing', { from: page * LIMIT + 1, to: Math.min((page + 1) * LIMIT, data.total), total: data.total })}
          </span>
          <div className="flex items-center gap-2">
            <Button disabled={page === 0} onClick={() => setPage(p => p - 1)} variant="outline" size="sm">
              {t('previous')}
            </Button>
            <span className="text-sm font-medium">{t('page')} {page + 1} / {totalPages}</span>
            <Button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} variant="outline" size="sm">
              {t('next')}
            </Button>
          </div>
        </div>
      )}

      {/* Detail / Reply Modal */}
      {selectedMsg && (
        <Dialog open={!!selectedMsg} onOpenChange={(open) => { if (!open) setSelectedMsg(null); }}>
          <DialogContent className="bg-white max-w-3xl max-h-[90vh] overflow-y-auto p-0">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10 rounded-t-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Eye className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold m-0">{t('details')}</DialogTitle>
                  <p className="text-xs text-gray-500">{new Date(selectedMsg.createdAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })}</p>
                </div>
              </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${
  selectedMsg.status === 'NEW' ? 'bg-blue-100 text-blue-700' :
  selectedMsg.status === 'READ' ? 'bg-yellow-100 text-yellow-700' :
  'bg-green-100 text-green-700'
}`}>
  {selectedMsg.status}
</span>
            </div>

            <div className="px-6 py-6 space-y-6">
  {/* Customer card – always visible */}
<section className="bg-gray-50 rounded-2xl p-5">
  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">{t('customer')}</h3>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div><label className="text-xs text-gray-400">{t('from')}</label><p className="font-medium">{selectedMsg.name}</p></div>
    <div><label className="text-xs text-gray-400">{t('email')}</label><a href={`mailto:${selectedMsg.email}`} className="text-primary hover:underline">{selectedMsg.email}</a></div>
    <div><label className="text-xs text-gray-400">{t('phone')}</label><p>{selectedMsg.phone || '—'}</p></div>
    <div><label className="text-xs text-gray-400">{t('date')}</label><p className="text-sm">{new Date(selectedMsg.createdAt).toLocaleString('fr-FR')}</p></div>
  </div>
</section>

{/* Message card – always visible */}
<section className="bg-gray-50 rounded-2xl p-5">
  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">{t('message')}</h3>
  <p className="text-sm whitespace-pre-wrap">{selectedMsg.message}</p>
</section>

{/* Admin notes card – always visible, even for deleted items */}
{selectedMsg.adminNotes && (
  <section className="bg-yellow-50 rounded-2xl p-5">
    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">{t('adminNotes')}</h3>
    <p className="text-sm whitespace-pre-wrap">{selectedMsg.adminNotes}</p>
  </section>
)}

{/* Reply/Update section – only for non‑trashed messages */}
{!selectedMsg.deleted_at && (
  <section className="bg-gray-50 rounded-2xl p-5">
    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
      {selectedMsg.status === 'REPLIED' ? t('updateReply') : t('yourReply')}
    </h3>

    {(selectedMsg.status !== 'REPLIED' || showReplyInput) ? (
      <>
        <Textarea
          rows={4}
          value={replyText}
          onChange={e => setReplyText(e.target.value)}
          placeholder={t('replyPlaceholder')}
          className="mb-4"
        />
        <div className="flex gap-2 justify-end">
          {selectedMsg.status === 'NEW' && (
            <Button variant="outline" onClick={handleMarkRead}>{t('markRead')}</Button>
          )}
          {selectedMsg.status !== 'REPLIED' ? (
            <Button onClick={handleReply} disabled={!replyText.trim() || saving}>
              {saving ? t('sending') : t('reply')}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setShowReplyInput(false)}>
                {t('cancel')}
              </Button>
              <Button onClick={handleUpdateReply} disabled={!replyText.trim() || saving}>
                {saving ? t('updating') : t('update')}
              </Button>
            </>
          )}
        </div>
      </>
    ) : (
      <Button variant="outline" onClick={() => setShowReplyInput(true)}>
        {t('update')}
      </Button>
    )}
  </section>
)}
            </div>
          </DialogContent>
        </Dialog>
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
        endpoint="/messages/trash"
        restoreEndpoint={(id) => `/messages/${id}/restore`}
        deleteEndpoint={(id) => `/messages/${id}?permanent=true`}
        title={t('trashTitle')}
        columns={[
          { key: 'name', label: t('from') },
          { key: 'createdAt', label: t('date') },
          { key: 'custom_subject', label: t('subject') },
        ]}
        searchPlaceholder={t('searchPlaceholder')}
        emptyMessage={t('trashEmpty')}
        t={t}
        renderRow={(msg, actions) => (
          <tr key={msg.id} className="border-t hover:bg-gray-50">
            <td className="p-3">{msg.name}</td>
            <td className="p-3">{new Date(msg.createdAt).toLocaleDateString('fr-FR')}</td>
            <td className="p-3">{msg.custom_subject || msg.subject_id || '—'}</td>
            <td className="p-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => actions.onView?.(msg)}><Eye className="w-4 h-4" /></Button>
              <Button variant="outline" size="sm" onClick={() => actions.onRestore(msg.id)}><RotateCcw className="w-4 h-4 text-green-600" /></Button>
              <Button variant="outline" size="sm" onClick={() => actions.onDelete(msg.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
            </td>
          </tr>
        )}
         onView={(msg) => setSelectedMsg(msg)}  
      />
    </div>
  );
}