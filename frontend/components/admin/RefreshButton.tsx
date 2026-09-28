'use client';
import { RefreshCw } from 'lucide-react';

interface Props {
  onRefresh: () => void;
  loading: boolean;
}

export function RefreshButton({ onRefresh, loading }: Props) {
  return (
    <button
      onClick={onRefresh}
      disabled={loading}
      className="p-1 hover:bg-gray-100 rounded disabled:opacity-50"
      title="Rafraîchir"
    >
      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
    </button>
  );
}