'use client';
import { useFeatureFlags } from '@/components/providers/FeatureFlagsProvider';

export default function FeatureGate({ flag, children }: { flag: string; children: React.ReactNode }) {
  const flags = useFeatureFlags(); // returns Record<string, boolean> — correct
  if (flags[flag] === false) return null;
  return <>{children}</>;
}