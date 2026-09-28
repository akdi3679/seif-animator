'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR, useAdminPOST, useAdminPUT, useAdminDELETE } from '@/lib/api/hooks';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { RetryableError } from '@/components/shared/RetryableError';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { toast } from 'sonner';
import { RateLimitError } from '@/lib/api/types';
import { Pencil, Trash2, Plus, Loader2, Receipt } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { formatTND } from '@/lib/utils/currency';

const expenseSchema = (t: any) =>
  z.object({
    name: z.string().min(1, t('validation.nameRequired')),
    amount: z.coerce.number().refine(val => val !== 0, t('validation.amountNotZero')),
    category: z.string().min(1, t('validation.categoryRequired')),
    isActive: z.boolean().optional().default(true),
  });

export function FixedExpensesTab() {
  const t = useTranslations('admin.expenses');
  const { data, mutate, isValidating, error, retry, isRetrying } = useAdminGETSWR<{ items: any[]; total: number }>('/fixed-expenses');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { trigger: deleteExpense, loading: deleteLoading, error: deleteApiError } = useAdminDELETE(() => `/fixed-expenses/${deleteTarget}`);

  const handleDelete = async (deleteCode: string) => {
    if (!deleteTarget) return;
    try {
      await deleteExpense({ deleteCode });
      mutate((current) => ({ ...current, items: current.items.filter((e: any) => e.id !== deleteTarget), total: current.total - 1 }), false);
      toast.success(t('deleted'));
      setDeleteTarget(null);
    } catch {}
  };

  if (error) return <RetryableError error={error} onRetry={retry} isRetrying={isRetrying} />;
  if (!data && isValidating) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('title')}</h2>
        <div className="flex gap-2">
          <Button onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-1" /> {t('create')}
          </Button>
          <RefreshButton onRefresh={() => mutate()} loading={isValidating} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto">
        {data?.items.length === 0 ? (
          <p className="text-center text-gray-500 py-10">{t('empty')}</p>
        ) : (
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600"></th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('name')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('category')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('amount')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('active')}</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((expense: any) => (
                <tr key={expense.id} className="border-t">
                  <td className="px-4 py-3"><Receipt className="w-8 h-8 text-gray-300" /></td>
                  <td className="px-4 py-3 font-medium">{expense.name}</td>
                  <td className="px-4 py-3">{expense.category}</td>
                  <td className={`px-4 py-3 ${Number(expense.amount) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatTND(expense.amount)}
                  </td>
                  <td className="px-4 py-3">{expense.isActive ? t('yes') : t('no')}</td>
                  <td className="px-4 py-3 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setEditing(expense); setShowForm(true); }}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleteTarget(expense.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader><DialogTitle>{editing ? t('edit') : t('create')}</DialogTitle></DialogHeader>
          <ExpenseForm initial={editing} mutate={mutate} onClose={() => setShowForm(false)} t={t} />
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={handleDelete}
        error={deleteApiError?.message ?? null}
        loading={deleteLoading}
      />
    </div>
  );
}

function ExpenseForm({ initial, mutate, onClose, t }: any) {
  const schema = expenseSchema(t);
  const { register, handleSubmit, formState: { errors, isValid }, watch, setValue } = useForm({
    resolver: zodResolver(schema),
    defaultValues: initial || { name: '', amount: 0, category: '', isActive: true },
    mode: 'onChange',
  });

  const { trigger: create, loading: creating } = useAdminPOST('/fixed-expenses', { showToast: false });
  const { trigger: update, loading: updating } = useAdminPUT(() => `/fixed-expenses/${initial?.id}`, { showToast: false });
  const loading = creating || updating;



  const handleSave = async (formData: any) => {
    try {
      if (initial) {
        const updated = await update(formData);
        mutate((current: any) => ({ ...current, items: current.items.map((e: any) => e.id === updated.id ? updated : e) }), false);
        toast.success(t('updated'));
      } else {
        const created = await create(formData);
        mutate((current: any) => ({ ...current, items: [created, ...current.items], total: current.total + 1 }), false);
        toast.success(t('created'));
      }
      onClose();
    } catch (err: any) {
      if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
      else toast.error(err.message || t('error'));
    }
  };

  return (
    <form onSubmit={handleSubmit(handleSave)} className="space-y-3">
      <div>
        <label className="text-sm font-medium">{t('name')}</label>
        <Input {...register('name')} />
        {errors.name && <p className="text-red-500 text-xs">{errors.name.message as string}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">{t('category')}</label>
        <Input {...register('category')} />
        {errors.category && <p className="text-red-500 text-xs">{errors.category.message as string}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">{t('amount')}</label>
<Input type="number" step="0.001" {...register('amount', { valueAsNumber: true })} />
        {errors.amount && <p className="text-red-500 text-xs">{errors.amount.message as string}</p>}
      </div>
     
      <div className="flex items-center gap-2">
        <input type="checkbox" {...register('isActive')} />
        <span>{t('active')}</span>
      </div>
      <Button type="submit" disabled={!isValid || loading} className="w-full">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
        {t('save')}
      </Button>
    </form>
  );
}