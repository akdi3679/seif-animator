'use client';

import { createContext, useContext } from 'react';
import { usePublicGETSWR } from '@/lib/api/hooks';

interface ContactInfo {
  address?: string;
  email?: string;
  phone?: string;
  hours?: string;
  latitude?: number | null;
  longitude?: number | null;
  map_zoom?: number | null;
  social_links?: any[];
}

const ContactInfoContext = createContext<{
  contactInfo: ContactInfo | null;
  isLoading: boolean;
  error: any;
  retry: () => void;
  isRetrying: boolean;
} | null>(null);

export function useContactInfo() {
  const ctx = useContext(ContactInfoContext);
  if (!ctx) throw new Error('useContactInfo must be used within ContactInfoProvider');
  return ctx;
}

export function ContactInfoProvider({ children }: { children: React.ReactNode }) {
  const { data, error, loading, retry, isRetrying } = usePublicGETSWR<ContactInfo>('/contact-info', {
    dedupingInterval: 60000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  return (
    <ContactInfoContext.Provider
      value={{
        contactInfo: error ? null : data ?? null,
        isLoading: loading,
        error,
        retry,
        isRetrying,
      }}
    >
      {children}
    </ContactInfoContext.Provider>
  );
}