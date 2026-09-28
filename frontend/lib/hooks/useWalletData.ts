'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAdminGETSWR } from '@/lib/api/hooks';
import { adminAPI } from '@/lib/api/client';

export type WalletEvent = {
  id: string;
  source: 'worker' | 'expense' | 'tool' | 'manual';
  sourceId: string | null;
  field: string | null;
  oldValue: number;
  newValue: number;
  change: number;
  description: string;
  createdAt: string;
};

type Interval = { start: Date; end: Date };

function mergeInterval(intervals: Interval[], newIv: Interval): Interval[] {
  const all = [...intervals, newIv].sort((a, b) => a.start.getTime() - b.start.getTime());
  if (all.length === 0) return [];
  const merged: Interval[] = [{ ...all[0] }];
  for (let i = 1; i < all.length; i++) {
    const last = merged[merged.length - 1];
    const cur = all[i];
    if (cur.start.getTime() <= last.end.getTime()) {
      last.end = new Date(Math.max(last.end.getTime(), cur.end.getTime()));
    } else {
      merged.push({ start: new Date(cur.start), end: new Date(cur.end) });
    }
  }
  return merged;
}

function isCovered(target: Interval, covered: Interval[]): boolean {
  for (const iv of covered) {
    if (target.start.getTime() >= iv.start.getTime() && target.end.getTime() <= iv.end.getTime()) {
      return true;
    }
  }
  return false;
}

export function useWalletData(
  period: 'week' | 'month' | 'year' | 'all',
  start: Date,
  end: Date,
) {
  const [cachedEvents, setCachedEvents] = useState<WalletEvent[]>([]);
  const [covered, setCovered] = useState<Interval[]>([]);
const [overallSummary, setOverallSummary] = useState({ balance: 0, totalIncome: 0, monthlyExpense: 0, totalExpense: 0 });
  const [dataBounds, setDataBounds] = useState<{ min: Date; max: Date } | null>(null);
  const [balanceBefore, setBalanceBefore] = useState(0);

  const hasEverLoadedRef = useRef(false);
  const [hasEverLoaded, setHasEverLoaded] = useState(false);

  const requestedRangeRef = useRef<Interval | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [armed, setArmed] = useState(false);

  const buildUrl = useCallback((p: string, s: Date, e: Date) => {
    if (p === 'all') return '/wallet';
    return `/wallet?start=${s.toISOString()}&end=${e.toISOString()}`;
  }, []);

  // url is null when the range is already cached → SWR does not fetch
  const rangeIsCovered = isCovered({ start, end }, covered);

  const url = useMemo(
    () => (armed && !rangeIsCovered ? buildUrl(period, start, end) : null),
    [armed, rangeIsCovered, buildUrl, period, start, end],
  );

  const { data: fetchData, error: fetchError, isValidating: fetching, mutate } = useAdminGETSWR(url, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 2000,
  });

  // Arm on first render + track requested range
  useEffect(() => {
    requestedRangeRef.current = { start, end };
    setArmed(true);
  }, [period, start, end]);

  // Apply response
    useEffect(() => {
    if (!fetchData?.events) return;
    if (fetching) return;

    if (fetchData.bounds) {
      setDataBounds({ min: new Date(fetchData.bounds.minDate), max: new Date(fetchData.bounds.maxDate) });
    }

    if (refreshing) {
      setCachedEvents(fetchData.events);
      setCovered(requestedRangeRef.current ? [requestedRangeRef.current] : []);
      setRefreshing(false);
    } else {
      setCachedEvents(prev => {
        const map = new Map(prev.map(e => [e.id, e]));
        for (const e of fetchData.events) map.set(e.id, e);
        return Array.from(map.values()).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
      });
      if (requestedRangeRef.current) {
        setCovered(prev => mergeInterval(prev, requestedRangeRef.current!));
      }
    }

    setOverallSummary({
      balance: fetchData.balance ?? 0,
      totalIncome: fetchData.totalIncome ?? 0,
      monthlyExpense: fetchData.monthlyExpense ?? 0,
      totalExpense: fetchData.totalExpense ?? 0,
    });
    setBalanceBefore(fetchData.balanceBefore ?? 0);

    if (!hasEverLoadedRef.current) {
      hasEverLoadedRef.current = true;
      setHasEverLoaded(true);
    }
  }, [fetchData, fetching, refreshing]);

  // Refresh: empty cache → fetch current period → repopulate
  const refresh = useCallback(async () => {
    const baseUrl = buildUrl(period, start, end);
    const refreshUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}_refresh=${Date.now()}`;
    setRefreshing(true);
    requestedRangeRef.current = { start, end };

    try {
      const data = await adminAPI(refreshUrl);

      setCachedEvents(data.events ?? []);
      setCovered(requestedRangeRef.current ? [requestedRangeRef.current] : []);
      setOverallSummary({
  balance: data.balance ?? 0,
  totalIncome: data.totalIncome ?? 0,
  monthlyExpense: data.monthlyExpense ?? 0,
  totalExpense: data.totalExpense ?? 0,
});
      setBalanceBefore(data.balanceBefore ?? 0);
      if (data.bounds) {
        setDataBounds({ min: new Date(data.bounds.minDate), max: new Date(data.bounds.maxDate) });
      }
      if (!hasEverLoadedRef.current) {
        hasEverLoadedRef.current = true;
        setHasEverLoaded(true);
      }
    } catch (err) {
      console.error('[WALLET] Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  }, [buildUrl, period, start, end]);

  // Retry a failed SWR fetch
  const retryFetch = useCallback(() => {
    mutate();
  }, [mutate]);

  // Optimistic insert (manual entry)
  const addOptimisticEvent = useCallback((newEvent: WalletEvent) => {
    setCachedEvents(prev => {
      const map = new Map(prev.map(e => [e.id, e]));
      map.set(newEvent.id, newEvent);
      return Array.from(map.values()).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    });
  }, []);

  return {
    cachedEvents,
    overallSummary,
    covered,
    dataBounds,
    balanceBefore,
    isLoading: !hasEverLoaded && (fetching || !armed),
    error: fetchError,
    fetching,
    refreshing,
    refresh,
    retryFetch,
    addOptimisticEvent,
  };
}