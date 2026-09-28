'use client';

import { createContext, useContext } from 'react';
import { usePublicGETSWR } from '@/lib/api/hooks';

interface EventsContextType {
  events: any[];               // all events
  eventsWithImages: any[];     // events that have imageUrl
  isLoading: boolean;
  error: any;
  retry: () => void;
  isRetrying: boolean;
}

const EventsContext = createContext<EventsContextType | null>(null);

export function useEvents() {
  const ctx = useContext(EventsContext);
  if (!ctx) throw new Error('useEvents must be used within EventsProvider');
  return ctx;
}

export function EventsProvider({ children }: { children: React.ReactNode }) {
  const { data, error, loading, retry, isRetrying } = usePublicGETSWR<{ events: any[] }>('/events', {
    dedupingInterval: 60000,   // avoid double fetches within 1 minute
  });

  const events = data?.events ?? [];
    const auto_display = data?.auto_display ?? false;

  const eventsWithImages = events.filter((e: any) => e.imageUrl);

  const value: EventsContextType = {
    events,
    eventsWithImages,
    auto_display, 
    isLoading: loading,
    error,
    retry,
    isRetrying,
  };

  return (
    <EventsContext.Provider value={value}>
      {children}
    </EventsContext.Provider>
  );
}