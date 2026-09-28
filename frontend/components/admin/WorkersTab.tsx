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
import { Pencil, Trash2, Plus, Loader2, UserCircle } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PhoneInput } from '@/components/public/PhoneInput';
import { formatTND } from '@/lib/utils/currency';

const workerSchema = (t: any) =>
  z
    .object({
      firstName: z.string().min(1, t('validation.firstNameRequired')),
      lastName: z.string().min(1, t('validation.lastNameRequired')),
      email: z.string().email(t('validation.emailInvalid')).optional().or(z.literal('')),
      address: z.string().min(1, t('validation.addressRequired')),
      role: z.string().min(1, t('validation.roleRequired')),
      phone: z.string().optional().default(''),
      notes: z.string().optional().default(''),
      isActive: z.boolean().optional().default(true),
      salary: z.coerce.number().positive(t('validation.salaryPositive')),
    })
    .refine(data => data.email || data.phone, {
      message: t('validation.emailOrPhoneRequired'),
      path: ['email'],
    });

export function WorkersTab() {
  const t = useTranslations('admin.workers');
  const { data, mutate, isValidating, error, retry, isRetrying } = useAdminGETSWR<{ items: any[]; total: number }>('/workers');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { trigger: deleteWorker, loading: deleteLoading, error: deleteApiError } = useAdminDELETE(() => `/workers/${deleteTarget}`);

  const handleDelete = async (deleteCode: string) => {
    if (!deleteTarget) return;
    try {
      await deleteWorker({ deleteCode });
      mutate((current) => ({ ...current, items: current.items.filter((w: any) => w.id !== deleteTarget), total: current.total - 1 }), false);
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
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('firstName')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('lastName')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('role')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('email')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('phone')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('salary')}</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">{t('active')}</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((worker: any) => (
                <tr key={worker.id} className="border-t">
                  <td className="px-4 py-3"><UserCircle className="w-8 h-8 text-gray-300" /></td>
                  <td className="px-4 py-3 font-medium">{worker.firstName}</td>
                  <td className="px-4 py-3">{worker.lastName}</td>
                  <td className="px-4 py-3">{worker.role}</td>
                  <td className="px-4 py-3">{worker.email}</td>
                  <td className="px-4 py-3">{worker.phone}</td>
                  <td className="px-4 py-3">{formatTND(worker.salary)}</td>
                  <td className="px-4 py-3">{worker.isActive ? t('yes') : t('no')}</td>
                  <td className="px-4 py-3 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setEditing(worker); setShowForm(true); }}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleteTarget(worker.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
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
          <WorkerForm initial={editing} mutate={mutate} onClose={() => setShowForm(false)} t={t} />
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

function WorkerForm({ initial, mutate, onClose, t }: any) {
  const schema = workerSchema(t);
  const { register, handleSubmit, formState: { errors, isValid }, setValue, watch } = useForm({
    resolver: zodResolver(schema),
    defaultValues: initial || { firstName: '', lastName: '', email: '', address: '', role: '', phone: '', notes: '', isActive: true, salary: 0 },
    mode: 'onChange',
  });

  const { trigger: create, loading: creating } = useAdminPOST('/workers', { showToast: false });
  const { trigger: update, loading: updating } = useAdminPUT(() => `/workers/${initial?.id}`, { showToast: false });
  const loading = creating || updating;

   const handleSave = async (formData: any) => {
    try {
      if (initial) {
        const updated = await update({ ...formData, version: initial.version });  // ← send version
        mutate((current: any) => ({ ...current, items: current.items.map((w: any) => w.id === updated.id ? updated : w) }), false);
        toast.success(t('updated'));
      } else {
        const created = await create(formData);
        mutate((current: any) => ({ ...current, items: [created, ...current.items], total: current.total + 1 }), false);
        toast.success(t('created'));
      }
      onClose();
    } catch (err: any) {
      if (err instanceof RateLimitError) {
        toast.error(t('rateLimit', { seconds: err.retryAfter }));
      } else {
        if (err?.status === 409) mutate();   // someone else edited it → refresh list
        toast.error(err.message || t('error'));
      }
    }
  };
  return (
    <form onSubmit={handleSubmit(handleSave)} className="space-y-3">
      <div>
        <label className="text-sm font-medium">{t('firstName')}</label>
        <Input {...register('firstName')} />
        {errors.firstName && <p className="text-red-500 text-xs">{errors.firstName.message as string}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">{t('lastName')}</label>
        <Input {...register('lastName')} />
        {errors.lastName && <p className="text-red-500 text-xs">{errors.lastName.message as string}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">{t('email')}</label>
        <Input {...register('email')} />
        {errors.email && <p className="text-red-500 text-xs">{errors.email.message as string}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">{t('address')}</label>
        <Input {...register('address')} />
        {errors.address && <p className="text-red-500 text-xs">{errors.address.message as string}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">{t('role')}</label>
        <Input {...register('role')} />
        {errors.role && <p className="text-red-500 text-xs">{errors.role.message as string}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">{t('phone')}</label>
        <PhoneInput
          value={watch('phone')}
          onChange={(val) => setValue('phone', val, { shouldValidate: true })}
          error={errors.phone?.message as string}
        />
        {errors.phone && <p className="text-red-500 text-xs">{errors.phone.message as string}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">{t('salary')}</label>
        <Input type="number" step="0.001" {...register('salary')} />
        {errors.salary && <p className="text-red-500 text-xs">{errors.salary.message as string}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">{t('notes')}</label>
        <Textarea {...register('notes')} />
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