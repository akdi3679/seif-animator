'use client';

import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslations } from 'next-intl';
import { formatTND } from '@/lib/utils/currency';
import { Wallet } from 'lucide-react';
import { useLineGrowth } from '@/lib/hooks/useLineGrowth';

interface DailyPoint {
  date: string;
  balance: number;
  income: number;
  expense: number;
}

interface MiniWalletData {
  days: DailyPoint[];
  balance: number;
  totalIncome: number;
  totalExpense: number;
}

interface Props {
  data: MiniWalletData | undefined;
  loading: boolean;
  error: any;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function MiniWalletChart({ data, loading, error, onRetry, isRetrying }: Props) {
  const t = useTranslations('admin.wallet');

  const animated = useLineGrowth<DailyPoint>(data?.days ?? [], ['balance', 'income', 'expense'], 1500);

  if (loading) return <LoadingSpinner />;
  if (error) return <RetryableError error={error} onRetry={onRetry || (() => {})} isRetrying={isRetrying || false} />;

  if (!data || data.days.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-4 flex items-center gap-3 text-gray-500" style={{ height: 220 }}>
        <Wallet className="w-5 h-5" />
        <span>{t('noData')}</span>
      </div>
    );
  }

  // Cards show OVERALL (all-time) values — not just the last day
  const overallBalance = data.balance;
  const overallIncome = data.totalIncome;
  const overallExpense = data.totalExpense;

  return (
    <div className="bg-white rounded-2xl p-4">
      <h3 className="font-bold text-lg mb-2">{t('weeklyBalance')}</h3>
      <div className="flex gap-4 text-sm mb-2">
        <span>{t('balance')}: {formatTND(overallBalance)}</span>
        <span className="text-green-600">+{formatTND(overallIncome)}</span>
        <span className="text-red-600">-{formatTND(overallExpense)}</span>
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <AreaChart data={animated}>
          <defs>
            <linearGradient id="miniWalletGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8884d8" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d?.slice(5)} />
          <YAxis tick={{ fontSize: 10 }} width={40} />
          <Tooltip formatter={(v: number) => formatTND(v)} />
          <Area type="monotone" dataKey="balance" stroke="#8884d8" fill="url(#miniWalletGrad)" strokeWidth={2} isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}