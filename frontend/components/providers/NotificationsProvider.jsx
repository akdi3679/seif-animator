'use client';
import { createContext, useContext, useCallback } from 'react';
import useSWR from 'swr';
import { adminAPI } from '@/lib/api/client';

const EMPTY = { order: 0, booking: 0, contact: 0, newsletter: 0, stock: 0 };
const NotificationsContext = createContext({ counts: EMPTY, markRead: async () => {}, refresh: async () => {} });
export const useNotifications = () => useContext(NotificationsContext);

export function NotificationsProvider({ children }) {
  const { data, mutate } = useSWR('/notifications/summary', () => adminAPI('/notifications/summary'), {
    refreshInterval: 30000,          // your 30s poll
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });

  const counts = data || EMPTY;

  // Race-safe: optimistic decrement, server confirms, next poll reconciles.
  // stock is NOT dismissible (persists until stock covers the orders).
  const markRead = useCallback(async (type) => {
    if (type === 'stock' || !counts[type]) return;
    mutate((cur) => (cur ? { ...cur, [type]: 0 } : cur), false);
    try {
      await adminAPI('/notifications/read', { method: 'POST', body: JSON.stringify({ type }) });
    } catch { mutate(); }
  }, [counts, mutate]);

  return (
    <NotificationsContext.Provider value={{ counts, markRead, refresh: mutate }}>
      {children}
    </NotificationsContext.Provider>
  );
}