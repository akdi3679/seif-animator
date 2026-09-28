'use client';
import { useMemo, useState, useEffect, useCallback , useRef  } from 'react';
import { useTranslations } from 'next-intl';
import { adminAPI } from '@/lib/api/client';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { RetryableError } from '@/components/shared/RetryableError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { toast } from 'sonner';
import { Download, Copy, Search, Loader2, X } from 'lucide-react';
import { ActionConfirmDialog } from '@/components/admin/ActionConfirmDialog';
import Image from 'next/image';

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

const LIMIT = 20;
const FULL_CACHE_TTL = 30 * 1000; // 30 seconds

interface DataTabProps {
  endpoint: string;
  tabKey: string;
  pageCache: Map<string, { items: any[]; total: number }>;
  setPageCache: React.Dispatch<React.SetStateAction<Map<string, { items: any[]; total: number }>>>;
  fullCache: Record<string, { data: any[]; fetchedAt: number }>;
  setFullCache: React.Dispatch<React.SetStateAction<Record<string, { data: any[]; fetchedAt: number }>>>;
  onRefresh?: () => void;   // <-- ADD
}

export function DataTab({ endpoint, tabKey, pageCache, setPageCache, fullCache, setFullCache, onRefresh }: DataTabProps) {
  const t = useTranslations('admin.data');
  const [page, setPage] = useState(0);
  const [localSearch, setLocalSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ items: any[]; total: number } | null>(null);
  const [error, setError] = useState<any>(null);
const [codeValidating, setCodeValidating] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
const [exportLoading, setExportLoading] = useState(false);
const [verifying, setVerifying] = useState(false);
const abortRef = useRef<AbortController | null>(null);
const [verifyError, setVerifyError] = useState<string | null>(null);
const [pendingAction, setPendingAction] = useState<'copyAll' | 'exportAll' | null>(null);
  // Build the query string for the current page
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', LIMIT.toString());
    params.set('offset', (page * LIMIT).toString());
    if (serverSearch) params.set('search', serverSearch);
    return params.toString();
  }, [page, serverSearch]);

  const cacheKey = `${endpoint}?${queryString}`;

  // Load data: check page cache first, otherwise fetch from server
 const loadPage = useCallback(async () => {
  if (abortRef.current) {
    abortRef.current.abort();
  }

  const controller = new AbortController();
  abortRef.current = controller;

  if (pageCache.has(cacheKey)) {
    const cached = pageCache.get(cacheKey)!;
    setData(cached);
    setError(null);
    setLoading(false);                 // ← already present
    return;
  }

  // setLoading(true) is now handled by the effect above, so we can keep or remove it.
  // We'll keep the existing one for safety, but the effect guarantees it's true already.
  setLoading(true);
  try {
    const res = await adminAPI(`${endpoint}?${queryString}`, {
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    const result = { items: res.items || [], total: res.total || 0 };
    setData(result);
    setError(null);
    setPageCache(prev => new Map(prev).set(cacheKey, result));
  } catch (err: any) {
    if (err.name === 'AbortError') return;
    setError(err);
  } finally {
    if (abortRef.current === controller) {
      abortRef.current = null;
    }
    setLoading(false);
  }
}, [cacheKey, pageCache, setPageCache, endpoint, queryString]);
useEffect(() => {
  return () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  };
}, []);
// Show spinner immediately when the page changes
useEffect(() => {
  // Only show spinner if the page is NOT already cached
  if (!pageCache.has(cacheKey)) {
    setLoading(true);
  }
}, [cacheKey, pageCache]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  // Local search filter on the loaded items
  const filtered = useMemo(() => {
    if (!data) return [];
    if (!localSearch.trim()) return data.items;
    const term = localSearch.toLowerCase();
    return data.items.filter((item: any) =>
      Object.values(item).some(val =>
        String(val).toLowerCase().includes(term)
      )
    );
  }, [data, localSearch]);

  const selectedItems = filtered.filter(i => selectedIds.has(i.id));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(i => i.id)));
    }
  };

  // ── Full data fetch with TTL ──────────────────────────────────
 const fetchFullData = async (code: string, mode: 'copy' | 'export'): Promise<any[]> => {
  const now = Date.now();
  const cached = fullCache[endpoint];
  if (cached && (now - cached.fetchedAt < FULL_CACHE_TTL)) {
    return cached.data;
  }

  if (mode === 'copy') setCopyLoading(true);
  else setExportLoading(true);

  try {
    const res = await adminAPI(`${endpoint}?limit=5000&deleteCode=${encodeURIComponent(code)}`);
    const all = res.items || [];
    setFullCache(prev => ({ ...prev, [endpoint]: { data: all, fetchedAt: now } }));

    // Pre‑fill page cache
    setPageCache(prev => {
      const next = new Map(prev);
      for (let offset = 0; offset < all.length; offset += LIMIT) {
        const chunk = all.slice(offset, offset + LIMIT);
        const params = new URLSearchParams();
        params.set('limit', LIMIT.toString());
        params.set('offset', offset.toString());
        const key = `${endpoint}?${params.toString()}`;
        next.set(key, { items: chunk, total: all.length });
      }
      return next;
    });

    return all;
  } catch (err: any) {
    throw err;
  } finally {
    if (mode === 'copy') setCopyLoading(false);
    else setExportLoading(false);
  }
};

  // ── Verification helpers ──────────────────────────────────────
  const requireVerification = (action: () => Promise<void>) => {
    setVerifyAction(() => action);
    setVerifyError(null);
    setVerifyOpen(true);
  };

  const handleVerifyConfirm = async (code: string) => {
  if (!code || code.trim() === '') {
    setVerifyError(t('codeRequired'));
    return;
  }

  // For selected‑item actions, only validate the code (no data fetch)
  if (pendingAction === 'copySelected' || pendingAction === 'exportSelected') {
    setCodeValidating(true);
    try {
      await adminAPI('/data/verify-action', {
        method: 'POST',
        body: JSON.stringify({ deleteCode: code }),
      });
      // Code is valid – execute the action
      if (pendingAction === 'copySelected') copySelected();
      else exportSelected();
      setVerifyOpen(false);
      setPendingAction(null);
      setVerifyError(null);
    } catch (err: any) {
      setVerifyError(err.message || t('invalidCode'));
    } finally {
      setCodeValidating(false);
    }
    return;
  }

  // For full‑data actions, fetch full data with the code
  setVerifying(true);
  setVerifyError(null);
  try {
    if (pendingAction === 'copyAll') {
      await copyAll(code);
    } else if (pendingAction === 'exportAll') {
      await exportAll(code);
    }
    setVerifyOpen(false);
    setPendingAction(null);
    setVerifyError(null);
  } catch (err: any) {
    setVerifyError(err.message || t('invalidCode'));
  } finally {
    setVerifying(false);
  }
};
  // ── Copy / Export actions ─────────────────────────────────────
 
 
  const exportCSV = (rows: any[]) => {
    if (rows.length === 0) return;
    const cols = Object.keys(rows[0]).filter(k => k !== 'id' && k !== 'image_url' && k !== 'url');
    const csvRows = [
      cols.join(','),
      ...rows.map(row => cols.map(col => JSON.stringify(row[col] ?? '')).join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tabKey}-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copySelected = () => {
  const text = JSON.stringify(selectedItems, null, 2);
  navigator.clipboard.writeText(text).then(() => toast.success(t('copied')));
};

const exportSelected = () => {
  exportCSV(selectedItems);
  toast.success(t('exported'));
};
  const copyAll = async (code: string) => {
  const all = await fetchFullData(code, 'copy');
  if (all.length === 0) return;
  const text = JSON.stringify(all, null, 2);
  navigator.clipboard.writeText(text).then(() => toast.success(t('copied')));
};

const exportAll = async (code: string) => {
  const all = await fetchFullData(code, 'export');
  if (all.length === 0) return;
  exportCSV(all);
  toast.success(t('exported'));
};

  // ── Verification triggers ────────────────────────────────────
   const handleCopySelected = () => {
  if (selectedItems.length > 10) {
    setPendingAction('copySelected');
    setVerifyError(null);
    setVerifyOpen(true);
  } else {
    copySelected();
  }
};
  const handleCopyAll = () => {
  setPendingAction('copyAll');
  setVerifyError(null);
  setVerifyOpen(true);
};


 const handleExportAll = () => {
  setPendingAction('exportAll');
  setVerifyError(null);
  setVerifyOpen(true);
};
 const handleExportSelected = () => {
  if (selectedItems.length > 10) {
    setPendingAction('exportSelected');
    setVerifyError(null);
    setVerifyOpen(true);
  } else {
    exportSelected();
  }
};
  

  // ── Refresh – clear page cache for this endpoint ──────────────
   const handleRefresh = () => {
    setPageCache(prev => {
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (key.startsWith(endpoint)) next.delete(key);
      }
      return next;
    });
    setLoading(true);
    loadPage();
    onRefresh?.();   // also refresh the map
  };

  const columns = filtered.length > 0
    ? Object.keys(filtered[0]).filter(k => k !== 'id' && k !== 'image_url' && k !== 'url')
    : [];

  const total = data?.total || 0;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">
          {t(tabKey as any)} ({total})
        </h2>
        <RefreshButton onRefresh={handleRefresh} loading={loading} />
      </div>

      <div className="flex flex-wrap gap-4 items-center justify-between bg-white p-4 rounded-2xl border">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
            className="w-48"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setServerSearch(localSearch.trim())}
            disabled={!localSearch.trim()}
          >
            <Search className="w-4 h-4 mr-1" />
            {t('searchServer')}
          </Button>
          {serverSearch && (
            <Button variant="ghost" size="sm" onClick={() => { setServerSearch(''); setLocalSearch(''); }}>
              <X className="w-4 h-4 mr-1" />
              {t('resetSearch')}
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopySelected} disabled={selectedItems.length === 0}>
            <Copy className="w-4 h-4 mr-1" /> {t('copySelected')}
          </Button>
         <Button variant="outline" size="sm" onClick={handleCopyAll} disabled={copyLoading}>
  {copyLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
  {t('copyAll')}
</Button>
          <Button variant="outline" size="sm" onClick={handleExportSelected} disabled={selectedItems.length === 0}>
            <Download className="w-4 h-4 mr-1" /> {t('exportSelected')}
          </Button>
         <Button variant="outline" size="sm" onClick={handleExportAll} disabled={exportLoading}>
  {exportLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
  {t('exportAll')}
</Button>
        </div>
      </div>

    
       {loading || (!data && !error) ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <RetryableError error={error} onRetry={loadPage} isRetrying={false} />
      ) : !data || filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border shadow-sm p-10 text-center text-gray-500">
          {t('empty')}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left w-10">
                  <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                </th>
                {tabKey === 'cloudinary' && (
                  <th className="px-4 py-3 text-left font-medium text-gray-600">{t('preview')}</th>
                )}
                {columns.map(key => (
                  <th key={key} className="px-4 py-3 text-left font-medium text-gray-600 capitalize">
                    {key.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr
                  key={item.id}
                  className={`border-t cursor-pointer ${selectedIds.has(item.id) ? 'bg-primary/5' : ''}`}
                  onClick={() => toggleSelect(item.id)}
                >
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} />
                  </td>
                  {tabKey === 'cloudinary' && (
                    <td className="px-4 py-3">
                      <Image src={item.url} alt="" width={40} height={40} className="rounded object-cover" unoptimized />
                    </td>
                  )}
                  {columns.map(key => (
                    <td key={key} className="px-4 py-3 max-w-xs truncate" title={String(item[key])}>
                     <Highlight
  text={
    item[key] === null || item[key] === undefined
      ? '—'
      : typeof item[key] === 'object'
        ? JSON.stringify(item[key])
        : String(item[key])
  }
  term={localSearch}
/>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex justify-between items-center p-4 border-t">
              <span className="text-sm text-gray-500">
                {t('showing', {
                  from: page * LIMIT + 1,
                  to: Math.min((page + 1) * LIMIT, total),
                  total,
                })}
              </span>
              <div className="flex gap-2">
                <Button disabled={page === 0} onClick={() => setPage(p => p - 1)} variant="outline" size="sm">{t('previous')}</Button>
                <span className="text-sm">{page + 1} / {totalPages}</span>
                <Button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} variant="outline" size="sm">{t('next')}</Button>
              </div>
            </div>
          )}
        </div>
      )}

     <ActionConfirmDialog
  open={verifyOpen}
  onOpenChange={(open) => {
    if (!open && !verifying) {
      setVerifyOpen(false);
      setPendingAction(null);
      setVerifyError(null);
    }
  }}
  onConfirm={handleVerifyConfirm}
  title={t('confirmTitle')}
  description={t('confirmDescription')}
  confirmLabel={t('confirm')}
  error={verifyError}
    loading={verifying || codeValidating}

/>
    </div>
  );
}