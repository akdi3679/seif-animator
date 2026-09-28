'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { adminAPI } from '@/lib/api/client';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { RetryableError } from '@/components/shared/RetryableError';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { toast } from 'sonner';
import { Plus, Wallet, TrendingUp, TrendingDown, GitBranch, GitMerge, ZoomIn, ZoomOut } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { formatTND } from '@/lib/utils/currency';
import { ActionConfirmDialog } from '@/components/admin/ActionConfirmDialog';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useLineGrowth } from '@/lib/hooks/useLineGrowth';
import { useWalletData, WalletEvent } from '@/lib/hooks/useWalletData';

// ─── Constants ──────────────────────────────────────────────────

const POINT_BASE_WIDTH = 40;
const MAX_ZOOM = 3;
const LIST_LIMIT = 20;

// ─── Date helpers ───────────────────────────────────────────────

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDateRange(period: string, periodKey: string | null): { start: Date; end: Date } {
  if (period === 'all' || !periodKey) {
    return { start: new Date(0), end: new Date() };
  }
  if (period === 'week') {
    const [y, m, d] = periodKey.split('-').map(Number);
    const start = new Date(y, m - 1, d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { start, end };
  }
  if (period === 'month') {
    const [y, m] = periodKey.split('-').map(Number);
    return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
  }
  if (period === 'year') {
    const y = Number(periodKey);
    return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
  }
  return { start: new Date(0), end: new Date() };
}

// Enumerate periods from `min` (first DB event) to `max` (today).
// Week labels are clipped to `max` so no future date is ever shown.
function enumeratePeriods(
  period: 'week' | 'month' | 'year',
  min: Date,
  max: Date,
): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];

  if (period === 'week') {
    const cur = new Date(min);
    cur.setDate(cur.getDate() - cur.getDay());
    cur.setHours(0, 0, 0, 0);
    while (cur <= max) {
      const weekEnd = new Date(cur);
      weekEnd.setDate(cur.getDate() + 7);
      const key = localDateKey(cur);
      const labelEnd = new Date(weekEnd.getTime() - 86400000);
      const clippedEnd = labelEnd > max ? max : labelEnd; // never show a future date
      out.push({
        value: key,
        label: `${cur.toLocaleDateString('fr-FR')} – ${clippedEnd.toLocaleDateString('fr-FR')}`,
      });
      cur.setDate(cur.getDate() + 7);
    }
  } else if (period === 'month') {
    const cur = new Date(min.getFullYear(), min.getMonth(), 1);
    while (cur <= max) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
      out.push({
        value: key,
        label: cur.toLocaleString('fr-FR', { month: 'long', year: 'numeric' }),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
  } else if (period === 'year') {
    for (let y = min.getFullYear(); y <= max.getFullYear(); y++) {
      out.push({ value: String(y), label: String(y) });
    }
  }

  return out.sort((a, b) => b.value.localeCompare(a.value));
}

// ─── Component ──────────────────────────────────────────────────

export function WalletTab() {
  const t = useTranslations('admin.wallet');

  const [period, setPeriod] = useState<'week' | 'month' | 'year' | 'all'>('month');
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [chartMode, setChartMode] = useState<'balance' | 'separate'>('balance');
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [listPage, setListPage] = useState(0);
  const [showEntry, setShowEntry] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [entryFormData, setEntryFormData] = useState<any>(null);
  const [summaryMode, setSummaryMode] = useState<'overall' | 'period'>('overall');
  const chartScrollRef = useRef<HTMLDivElement>(null);
const [localRefreshing, setLocalRefreshing] = useState(false);
  // STEP 1: effectivePeriodKey — depends ONLY on period + selectedPeriodKey (no circular dep)
  const effectivePeriodKey = useMemo(() => {
    if (period === 'all') return null;
    if (selectedPeriodKey) return selectedPeriodKey;
    const now = new Date();
    if (period === 'week') {
      const ws = new Date(now);
      ws.setDate(now.getDate() - ws.getDay());
      ws.setHours(0, 0, 0, 0);
      return localDateKey(ws);
    }
    if (period === 'month') {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    return String(now.getFullYear());
  }, [period, selectedPeriodKey]);

  // STEP 2: full period range (used for chart logic + today marker)
  const { start, end } = useMemo(
    () => getDateRange(period, effectivePeriodKey),
    [period, effectivePeriodKey],
  );

  // STEP 2b: fetch range — clip to END OF TODAY (stable all day), not exact now (moving)
const fetchEnd = useMemo(() => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return end > today ? today : end;
}, [end]);

  // STEP 3: data hook (fetches [start, fetchEnd])
  const {
    cachedEvents,
    overallSummary,
    dataBounds,
    balanceBefore,
    isLoading,
    error,
    fetching,
    refreshing,
    refresh,
    retryFetch,
    addOptimisticEvent,
  } = useWalletData(period, start, fetchEnd);

  // STEP 4: period options — from first DB event to TODAY
  const periodOptions = useMemo(() => {
    if (!dataBounds) return [];
    if (period === 'all') return [];
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return enumeratePeriods(period, dataBounds.min, today);
  }, [dataBounds, period]);

  // Filtered events for the selected period
  const filteredEvents = useMemo(() => {
    if (period === 'all') return cachedEvents;
    return cachedEvents.filter(e => {
      const d = new Date(e.createdAt);
      return d >= start && d < end;
    });
  }, [cachedEvents, start, end, period]);

  const sortedAscending = useMemo(
    () => [...filteredEvents].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [filteredEvents],
  );

  const displayEvents = useMemo(
    () => [...filteredEvents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [filteredEvents],
  );

  // Summary (overall vs period)
  const summary = useMemo(() => {
  if (summaryMode === 'overall') {
    return { balance: overallSummary.balance, totalIncome: overallSummary.totalIncome, expense: overallSummary.totalExpense };
  }
  const balance = filteredEvents.reduce((s, e) => s + Number(e.change), 0);
  const totalIncome = filteredEvents.filter(e => Number(e.change) > 0).reduce((s, e) => s + Number(e.change), 0);
  const expense = Math.abs(filteredEvents.filter(e => Number(e.change) < 0).reduce((s, e) => s + Number(e.change), 0));
  return { balance, totalIncome, expense };
}, [summaryMode, overallSummary, filteredEvents]);

  // Chart data — starts from balanceBefore (continuity), clips to today, exposes today marker
  const { fullChartData, fullSeparateData, todayIso, showTodayLine } = useMemo(() => {
    const now = new Date();
    const displayEnd = end > now ? now : end;
    const todayIso = displayEnd.toISOString();
    const showTodayLine = period !== 'all' && end > now && now >= start;

    // Continuity: start from the previous period's ending balance.
    // Use cached prior events if present; otherwise the server's balanceBefore.
    const hasEventsBefore = cachedEvents.some(e => new Date(e.createdAt) < start);
    const priorBalance = hasEventsBefore
  ? cachedEvents.filter(e => new Date(e.createdAt) < start).reduce((s, e) => s + Number(e.change), 0)
  : Number(balanceBefore);

    // Empty period → flat line at the carried-forward balance (clipped to today)
    if (sortedAscending.length === 0) {
      return {
        fullChartData: [
          { date: start.toISOString(), balance: priorBalance, eventId: null, description: null, change: null },
          { date: todayIso, balance: priorBalance, eventId: null, description: null, change: null },
        ],
        fullSeparateData: [
          { date: start.toISOString(), income: 0, expense: 0, eventId: null, description: null, change: null },
          { date: todayIso, income: 0, expense: 0, eventId: null, description: null, change: null },
        ],
        todayIso,
        showTodayLine,
      };
    }

    let runningBalance = priorBalance;
    const chart: any[] = [{ date: start.toISOString(), balance: priorBalance, eventId: null, description: null, change: null }];
    let cumIncome = 0, cumExpense = 0;
    const sep: any[] = [{ date: start.toISOString(), income: 0, expense: 0, eventId: null, description: null, change: null }];

    sortedAscending.forEach((e) => {
      runningBalance += Number(e.change);
      chart.push({ date: new Date(e.createdAt).toISOString(), balance: runningBalance, eventId: e.id, description: e.description, change: Number(e.change) });
      if (Number(e.change) > 0) cumIncome += Number(e.change);
      else cumExpense += Math.abs(Number(e.change));
      sep.push({ date: new Date(e.createdAt).toISOString(), income: cumIncome, expense: cumExpense, eventId: e.id, description: e.description, change: Number(e.change) });
    });

    // Extend flat from the last event to today so the line reaches "now"
    const lastChartDate = new Date(chart[chart.length - 1].date);
    if (lastChartDate < displayEnd) {
      chart.push({ date: todayIso, balance: runningBalance, eventId: null, description: null, change: null });
      sep.push({ date: todayIso, income: cumIncome, expense: cumExpense, eventId: null, description: null, change: null });
    }

    return { fullChartData: chart, fullSeparateData: sep, todayIso, showTodayLine };
  }, [sortedAscending, start, end, cachedEvents, balanceBefore, period]);

  // Animate (grows from the lowest value up)
  const animatedChart = useLineGrowth(fullChartData, ['balance'], 1500);
  const animatedSeparate = useLineGrowth(fullSeparateData, ['income', 'expense'], 1500);

  // Tooltip
  const CustomTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const point = payload[0].payload;
    const safeDate = label ? new Date(label) : null;
    const dateStr = safeDate && !isNaN(safeDate.getTime())
      ? safeDate.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
      : '—';
    return (
      <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
        <p className="font-medium mb-1">{dateStr}</p>
        {point.change != null && point.change !== 0 && (
          <div className={`text-lg font-bold mb-2 ${point.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {point.change >= 0 ? '+' : ''}{formatTND(point.change)}
          </div>
        )}
        {payload.map((entry: any, idx: number) => (
          <p key={idx} style={{ color: entry.color }} className="text-sm">
            {entry.name}: {formatTND(entry.value)}
          </p>
        ))}
        {point.description && <p className="text-gray-500 mt-1 text-xs">{point.description}</p>}
      </div>
    );
  }, []);
const handleRefresh = useCallback(async () => {
  if (localRefreshing) return;
  setLocalRefreshing(true);                       // spins immediately on click
  const minVisible = new Promise(r => setTimeout(r, 600)); // keep it visible ≥600ms
  try {
    await Promise.all([refresh(), minVisible]);   // wait for the real request
  } finally {
    setLocalRefreshing(false);                    // stops when data lands
  }
}, [refresh, localRefreshing]);
  // Chart dimensions + zoom
  const dataLength = (chartMode === 'balance' ? animatedChart : animatedSeparate).length;
  const requiredWidth = dataLength * POINT_BASE_WIDTH * zoom;

  const handleWheel = useCallback((e: WheelEvent) => {
    const el = chartScrollRef.current;
    if (!el) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const f = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => Math.max(0.3, Math.min(MAX_ZOOM, z * f)));
    } else if (el.scrollWidth > el.clientWidth) {
      e.preventDefault();
      el.scrollLeft += e.deltaY + e.deltaX;
    }
  }, []);

  useEffect(() => {
    const el = chartScrollRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  useEffect(() => { setZoom(1); }, [period, effectivePeriodKey, chartMode]);

  const scrollToEvent = useCallback((eventId: string) => {
    const el = chartScrollRef.current;
    if (!el) return;
    const idx = sortedAscending.findIndex(e => e.id === eventId);
    if (idx < 0) return;
    const x = (idx + 1) * POINT_BASE_WIDTH * zoom;
    el.scrollTo({ left: Math.max(0, x - el.clientWidth / 2), behavior: 'smooth' });
  }, [sortedAscending, zoom]);

  // Pagination
  const totalListPages = Math.ceil(displayEvents.length / LIST_LIMIT);
  const paginatedEvents = displayEvents.slice(listPage * LIST_LIMIT, (listPage + 1) * LIST_LIMIT);
  useEffect(() => { setListPage(0); }, [displayEvents.length, period, effectivePeriodKey]);

  // Toast on fetch error (even when cache has data)
  useEffect(() => {
    if (error) toast.error(t('error'));
  }, [error]);

  // Manual entry form
  const schema = z.object({
    amount: z.coerce.number().refine(v => v !== 0, t('validation.amountNotZero')),
    description: z.string().min(1, t('validation.descriptionRequired')),
  });
  const { register, handleSubmit, formState: { errors, isValid }, reset } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { amount: 0, description: '' },
    mode: 'onChange',
  });

  const handleAddEntry = (formData: any) => {
    setEntryFormData(formData);
    setVerifyError(null);
    setVerifyOpen(true);
  };

  const handleVerifyConfirm = async (code: string) => {
    if (!code?.trim()) { setVerifyError(t('codeRequired')); return; }
    setSubmitting(true);
    try {
      await adminAPI('/wallet/entry', {
        method: 'POST',
        body: JSON.stringify({ ...entryFormData, deleteCode: code }),
      });
      const newEvent: WalletEvent = {
        id: 'optimistic-' + Date.now(),
        source: 'manual',
        sourceId: null,
        field: 'manual',
        oldValue: 0,
        newValue: entryFormData.amount,
        change: entryFormData.amount,
        description: `Entrée manuelle – ${entryFormData.description} (${entryFormData.amount} TND)`,
        createdAt: new Date().toISOString(),
      };
      addOptimisticEvent(newEvent);
      toast.success(t('entryAdded'));
      setVerifyOpen(false);
      setShowEntry(false);
      reset();
    } catch (err: any) {
      setVerifyError(err.message || t('error'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Early returns (ALL hooks above this line) ────────────────
  if (isLoading) return <LoadingSpinner />;
  if (error && cachedEvents.length === 0) {
    return <RetryableError error={error} onRetry={retryFetch} isRetrying={fetching} />;
  }

  // Dot renderer
  const makeDot = (color: string) => (props: any) => {
    const { cx, cy, payload } = props;
    if (!payload?.eventId) return null;
    if (payload.eventId === hoveredEventId) {
      return <circle cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={2} />;
    }
    return <circle cx={cx} cy={cy} r={2} fill={color} />;
  };

  const formatXAxis = (dateStr: string): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t('title')}</h2>
        <div className="flex items-center gap-2">
         <RefreshButton onRefresh={handleRefresh} loading={localRefreshing} />
          <Button onClick={() => setShowEntry(true)}>
            <Plus className="w-4 h-4 mr-1" /> {t('addEntry')}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{t('period')}</span>
          <select
            value={period}
            onChange={e => {
              setPeriod(e.target.value as any);
              setSelectedPeriodKey(null);
            }}
            className="border rounded px-3 py-1.5 text-sm bg-white"
          >
            <option value="week">{t('week')}</option>
            <option value="month">{t('month')}</option>
            <option value="year">{t('year')}</option>
            <option value="all">{t('all')}</option>
          </select>
          {period !== 'all' && periodOptions.length > 0 && (
            <select
              value={effectivePeriodKey ?? ''}
              onChange={e => {
                const newKey = e.target.value;
                if (newKey === effectivePeriodKey) {
                  retryFetch(); // same period → force refetch (retry after failure)
                } else {
                  setSelectedPeriodKey(newKey);
                }
              }}
              className="border rounded px-3 py-1.5 text-sm bg-white"
            >
              {periodOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button variant={chartMode === 'balance' ? 'default' : 'outline'} size="icon" onClick={() => setChartMode('balance')}>
            <GitBranch className="w-4 h-4" />
          </Button>
          <Button variant={chartMode === 'separate' ? 'default' : 'outline'} size="icon" onClick={() => setChartMode('separate')}>
            <GitMerge className="w-4 h-4" />
          </Button>
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <Button variant="outline" size="icon" onClick={() => setZoom(z => Math.max(0.3, z * 0.8))}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setZoom(z => Math.min(MAX_ZOOM, z * 1.25))}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setZoom(1)}>
            {zoom.toFixed(2)}×
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border p-6">
        <style>{`
          .chart-scroll { overflow-x: auto; overflow-y: hidden; }
          .chart-scroll::-webkit-scrollbar { display: none; }
          .chart-scroll { -ms-overflow-style: none; scrollbar-width: none; }
          .chart-scroll, .chart-scroll * { outline: none !important; }
          .recharts-wrapper:focus,
          .recharts-wrapper:active,
          .recharts-surface:focus,
          .recharts-surface:active,
          .recharts-wrapper *:focus,
          .recharts-wrapper *:active {
            outline: none !important;
            border: none !important;
            box-shadow: none !important;
          }
        `}</style>
        <div ref={chartScrollRef} className="chart-scroll">
          <div style={{ minWidth: '100%', width: `max(100%, ${requiredWidth}px)`, height: 400 }}>
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === 'balance' ? (
                <AreaChart data={animatedChart} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8884d8" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  {showTodayLine && (
                    <ReferenceLine x={todayIso} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1.5}
                      label={{ value: t('today'), position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
                  )}
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={formatXAxis} minTickGap={32} stroke="#e5e7eb" />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} stroke="#e5e7eb" width={48} />
                  <Tooltip content={<CustomTooltip />} cursor={false} />
                  <Area type="monotone" dataKey="balance" name={t('balance')} stroke="#8884d8" fill="url(#colorBalance)" strokeWidth={2.5} isAnimationActive={false} dot={makeDot('#8884d8')} />
                </AreaChart>
              ) : (
                <LineChart data={animatedSeparate} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  {showTodayLine && (
                    <ReferenceLine x={todayIso} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1.5}
                      label={{ value: t('today'), position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
                  )}
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={formatXAxis} minTickGap={32} stroke="#e5e7eb" />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} stroke="#e5e7eb" width={48} />
                  <Tooltip content={<CustomTooltip />} cursor={false} />
                  <Line type="monotone" dataKey="income" name={t('income')} stroke="#10b981" strokeWidth={2.5} isAnimationActive={false} dot={makeDot('#10b981')} />
                  <Line type="monotone" dataKey="expense" name={t('expense')} stroke="#ef4444" strokeWidth={2.5} isAnimationActive={false} dot={makeDot('#ef4444')} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-gray-500">{t('summaryMode')}</span>
        <Button variant={summaryMode === 'overall' ? 'default' : 'outline'} size="sm" onClick={() => setSummaryMode('overall')}>
          {t('overall')}
        </Button>
        <Button variant={summaryMode === 'period' ? 'default' : 'outline'} size="sm" onClick={() => setSummaryMode('period')}>
          {t('period')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard icon={<Wallet className="w-6 h-6 text-green-600" />} bg="bg-green-100" label={t('balance')} value={summary.balance} />
<SummaryCard icon={<TrendingDown className="w-6 h-6 text-red-600" />} bg="bg-red-100"
  label={summaryMode === 'overall' ? t('totalExpense') : t('monthlyExpense')}
  value={summary.expense} />
          <SummaryCard icon={<TrendingUp className="w-6 h-6 text-blue-600" />} bg="bg-blue-100" label={t('totalIncome')} value={summary.totalIncome} />
      </div>

      <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto">
        {displayEvents.length === 0 ? (
          <p className="text-center text-gray-500 py-10">{t('noEntries')}</p>
        ) : (
          <>
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">{t('date')}</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">{t('description')}</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">{t('type')}</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">{t('amount')}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedEvents.map((event) => (
                  <tr
                    key={event.id}
                    className={`border-t cursor-pointer transition-colors ${hoveredEventId === event.id ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-gray-50'}`}
                    onMouseEnter={() => setHoveredEventId(event.id)}
                    onMouseLeave={() => setHoveredEventId(null)}
                    onClick={() => scrollToEvent(event.id)}
                  >
                    <td className="px-4 py-3">{new Date(event.createdAt).toLocaleString('fr-FR')}</td>
                    <td className="px-4 py-3">{event.description}</td>
                    <td className="px-4 py-3">{t(event.source)}</td>
                    <td className={`px-4 py-3 font-medium ${Number(event.change) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {Number(event.change) >= 0 ? '+' : ''}{formatTND(event.change)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalListPages > 1 && (
              <div className="flex justify-between items-center p-4 border-t">
                <span className="text-sm text-gray-500">
                  {t('showing', { from: listPage * LIST_LIMIT + 1, to: Math.min((listPage + 1) * LIST_LIMIT, displayEvents.length), total: displayEvents.length })}
                </span>
                <div className="flex gap-2">
                  <Button disabled={listPage === 0} onClick={() => setListPage(p => p - 1)} variant="outline" size="sm">{t('previous')}</Button>
                  <span className="text-sm">{listPage + 1} / {totalListPages}</span>
                  <Button disabled={listPage >= totalListPages - 1} onClick={() => setListPage(p => p + 1)} variant="outline" size="sm">{t('next')}</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={showEntry} onOpenChange={setShowEntry}>
        <DialogContent className="bg-white max-w-sm">
          <DialogHeader><DialogTitle>{t('addEntry')}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(handleAddEntry)} className="space-y-3">
            <div>
              <label className="text-sm font-medium">{t('amount')}</label>
              <Input type="number" step="0.001" {...register('amount')} />
              {errors.amount && <p className="text-red-500 text-xs">{errors.amount.message as string}</p>}
            </div>
            <div>
              <label className="text-sm font-medium">{t('description')}</label>
              <Input {...register('description')} />
              {errors.description && <p className="text-red-500 text-xs">{errors.description.message as string}</p>}
            </div>
            <Button type="submit" disabled={!isValid} className="w-full">{t('save')}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <ActionConfirmDialog
        open={verifyOpen}
        onOpenChange={(open) => { if (!open) setVerifyOpen(false); }}
        onConfirm={handleVerifyConfirm}
        title={t('verifyEntryTitle')}
        description={t('verifyEntryDescription')}
        confirmLabel={t('confirm')}
        error={verifyError}
        loading={submitting}
      />
    </div>
  );
}

function SummaryCard({ icon, bg, label, value }: { icon: React.ReactNode; bg: string; label: string; value: number }) {
  return (
    <div className="bg-white rounded-2xl border p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center`}>{icon}</div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-xl font-bold">{formatTND(value)}</p>
      </div>
    </div>
  );
}