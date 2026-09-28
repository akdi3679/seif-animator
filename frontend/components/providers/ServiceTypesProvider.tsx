'use client';

import { createContext, useContext, useMemo } from 'react';
import { usePublicGETSWR } from '@/lib/api/hooks';

interface ServiceType {
  id: string;
  calcom_slug: string;
  name_fr: string;
  name_ar: string;
  is_other: boolean;
}

interface ServiceTypesContextType {
  serviceTypes: ServiceType[];
  sortedServiceTypes: ServiceType[];
  otherSlug: string | null;
  isLoading: boolean;
  error: any;
  retry: () => void;
  isRetrying: boolean;
  retriesExhausted: boolean;
}

const ServiceTypesContext = createContext<ServiceTypesContextType | null>(null);

export function useServiceTypes() {
  const ctx = useContext(ServiceTypesContext);
  if (!ctx) throw new Error('useServiceTypes must be used within ServiceTypesProvider');
  return ctx;
}

export function ServiceTypesProvider({ children }: { children: React.ReactNode }) {
  const { data, loading, error, retry, isRetrying, retriesExhausted } = usePublicGETSWR<ServiceType[]>('/service-types', {
    dedupingInterval: 60000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const serviceTypes = data ?? [];

const sortedServiceTypes = useMemo(() => {
  if (!serviceTypes.length) return [];
  const other = serviceTypes.find(s => s.is_other === true);
  const regular = serviceTypes
    .filter(s => s !== other)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  return [...regular, ...(other ? [other] : [])];
}, [serviceTypes]);

  const otherSlug = useMemo(() => {
    const other = serviceTypes.find(s => s.is_other);
    return other?.calcom_slug ?? null;
  }, [serviceTypes]);

  return (
    <ServiceTypesContext.Provider
      value={{
        serviceTypes,
        sortedServiceTypes,
        otherSlug,
        isLoading: loading,
        error,
        retry,
        isRetrying,
        retriesExhausted,
      }}
    >
      {children}
    </ServiceTypesContext.Provider>
  );
}