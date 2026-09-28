'use client';

import { createContext, useContext } from 'react';
import { usePublicGETSWR } from '@/lib/api/hooks';

interface KeyFigure {
  id: string;
  name_fr: string;
  name_ar: string;
  value: string;
  icon_url?: string | null;       // Lucide icon name (e.g. "Heart") or URL
  description_fr?: string;
  description_ar?: string;
}
interface Goal {
  id: string;
  title_fr: string;
  title_ar: string;
  current_value: number;
  target_value: number;
  unit: string | null;
  icon_url?: string | null;
  start_date?: string;
  end_date?: string;
}

interface GoalsContextType {
  figures: KeyFigure[];
  goals: Goal[];
  isLoading: boolean;
  error: any;
  retry: () => void;
  isRetrying: boolean;
}

const GoalsContext = createContext<GoalsContextType | null>(null);

export function useGoals() {
  const ctx = useContext(GoalsContext);
  if (!ctx) throw new Error('useGoals must be used within GoalsProvider');
  return ctx;
}

export function GoalsProvider({ children }: { children: React.ReactNode }) {
  const { data, error, loading, retry, isRetrying } = usePublicGETSWR<{ figures: KeyFigure[]; goals: Goal[] }>('/goals', {
    dedupingInterval: 60000,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const figures = data?.figures ?? [];
  const goals = data?.goals ?? [];

  const value: GoalsContextType = {
    figures,
    goals,
    isLoading: loading,
    error,
    retry,
    isRetrying,
  };

  return (
    <GoalsContext.Provider value={value}>
      {children}
    </GoalsContext.Provider>
  );
}