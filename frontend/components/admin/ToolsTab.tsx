'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR, useAdminPOST, useAdminPUT, useAdminDELETE } from '@/lib/api/hooks';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { RetryableError } from '@/components/shared/RetryableError';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { toast } from 'sonner';
import { RateLimitError } from '@/lib/api/types';
import { Pencil, Trash2, Plus, Loader2, Wrench } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { formatTND } from '@/lib/utils/currency';

const toolSchema = (t: any) =>
  z.object({
    name: z.string().min(1, t('validation.nameRequired')),
    description: z.string().min(1, t('validation.descriptionRequired')),
    quantity: z.coerce.number().int().positive(t('validation.quantityPositive')),
    usageDate: z.string().min(1, t('validation.usageDateRequired')),
    state: z.string().min(1, t('validation.stateRequired')),
    notes: z.string().optional().default(''),
    price: z.coerce.number().min(0).optional().default(0),
  });

export function ToolsTab() {
  const t = useTranslations('admin.tools');
  const { data, mutate, isValidating, error, retry, isRetrying } = useAdminGETSWR<{ items: any[]; total: number }>('/tools');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { trigger: deleteTool, loading: deleteLoading, error: deleteApiError } = useAdminDELETE(() => `/tools/${deleteTarget}`);

  const handleDelete = async (deleteCode: string) => {
    if (!deleteTarget) return;
    try {
      await deleteTool({ deleteCode });
      mutate((current) => ({ ...current, items: current.items.filter((item: any) => item.id !== deleteTarget), total: current.total - 1 }), false);
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
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600"></th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('name')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('quantity')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('state')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('usageDate')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('price')}</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((tool: any) => (
                <tr key={tool.id} className="border-t">
                  <td className="px-4 py-3"><Wrench className="w-8 h-8 text-gray-300" /></td>
                  <td className="px-4 py-3 font-medium">{tool.name}</td>
                  <td className="px-4 py-3">{tool.quantity}</td>
                  <td className="px-4 py-3">{tool.state}</td>
                  <td className="px-4 py-3">{new Date(tool.usageDate).toLocaleDateString('fr-FR')}</td>
                  <td className="px-4 py-3">{tool.price ? formatTND(tool.price) : '—'}</td>
                  <td className="px-4 py-3 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setEditing(tool); setShowForm(true); }}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleteTarget(tool.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
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
          <ToolForm initial={editing} mutate={mutate} onClose={() => setShowForm(false)} t={t} />
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

function ToolForm({ initial, mutate, onClose, t }: any) {
  const schema = toolSchema(t);
  const { register, handleSubmit, formState: { errors, isValid } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: initial || { name: '', description: '', quantity: 1, usageDate: '', state: '', notes: '', price: 0 },
    mode: 'onChange',
  });

  const { trigger: create, loading: creating } = useAdminPOST('/tools', { showToast: false });
  const { trigger: update, loading: updating } = useAdminPUT(() => `/tools/${initial?.id}`, { showToast: false });
  const loading = creating || updating;

  const handleSave = async (formData: any) => {
    try {
      if (initial) {
        const updated = await update(formData);
        mutate((current: any) => ({ ...current, items: current.items.map((item: any) => item.id === updated.id ? updated : item) }), false);
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
        <label className="text-sm font-medium">{t('description')}</label>
        <Textarea {...register('description')} />
        {errors.description && <p className="text-red-500 text-xs">{errors.description.message as string}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">{t('quantity')}</label>
        <Input type="number" {...register('quantity')} />
        {errors.quantity && <p className="text-red-500 text-xs">{errors.quantity.message as string}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">{t('usageDate')}</label>
        <Input type="date" {...register('usageDate')} />
        {errors.usageDate && <p className="text-red-500 text-xs">{errors.usageDate.message as string}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">{t('state')}</label>
        <Input {...register('state')} />
        {errors.state && <p className="text-red-500 text-xs">{errors.state.message as string}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">{t('price')}</label>
        <Input type="number" step="0.001" {...register('price')} />
        {errors.price && <p className="text-red-500 text-xs">{errors.price.message as string}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">{t('notes')}</label>
        <Textarea {...register('notes')} />
      </div>
      <Button type="submit" disabled={!isValid || loading} className="w-full">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
        {t('save')}
      </Button>
    </form>
  );
}