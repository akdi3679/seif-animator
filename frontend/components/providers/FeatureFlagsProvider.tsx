'use client';

import { createContext, useContext, ReactNode } from 'react';

const FeatureFlagsContext = createContext<Record<string, boolean>>({});

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}

export function FeatureFlagsProvider({
  initialFlags,
  children,
}: {
  initialFlags: Record<string, boolean>;
  children: ReactNode;
}) {
  return (
    <FeatureFlagsContext.Provider value={initialFlags}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}