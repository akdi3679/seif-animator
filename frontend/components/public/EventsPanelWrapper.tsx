'use client';

import dynamic from 'next/dynamic';

const EventsPanel = dynamic(() => import('./EventsPanel'), { ssr: false });

export default function EventsPanelWrapper() {
  return <EventsPanel />;
}