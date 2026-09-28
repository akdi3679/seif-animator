'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR, useAdminPOST, useAdminPUT, useAdminDELETE } from '@/lib/api/hooks';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';
import { toast } from 'sonner';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { translateBatch } from '@/lib/utils/translate';
import { RateLimitError } from '@/lib/api/types';
import { IconPicker } from '@/components/admin/IconPicker';

const goalSchema = (t: any) =>
  z.object({
    title_fr: z.string().min(1, t('validation.titleFrRequired')),
    title_ar: z.string().min(1, t('validation.titleArRequired')),
    current_value: z.coerce.number().min(0, t('validation.currentValueMin')),
    target_value: z.coerce.number().min(1, t('validation.targetValueMin')),
    unit: z.string().min(1, t('validation.unitRequired')).regex(/^\S+$/, t('validation.unitSingleWord')),
    icon_url: z.string().min(1, t('validation.iconRequired')),
    start_date: z.string().min(1, t('validation.startDateRequired')),
    end_date: z.string().min(1, t('validation.endDateRequired')),
  }).refine(data => new Date(data.end_date) >= new Date(data.start_date), {
    message: t('validation.endAfterStart'),
    path: ['end_date'],
  });

type GoalFormData = z.infer<ReturnType<typeof goalSchema>>;

export function GoalsTab() {
  const t = useTranslations('admin.goals');
  const { data, mutate, refresh , error, retry, isRetrying, isValidating } = useAdminGETSWR<any[]>('/goals');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null); // NEW: Error state for dialog
const { trigger: remove } = useAdminDELETE(() => `/goals/${deleteTarget}`, { showToast: false });
const [deleteLoading, setDeleteLoading] = useState(false);
     const handleDelete = async (code: string) => {
  if (!deleteTarget) return;
  const targetId = deleteTarget;
  setDeleteLoading(true);
  try {
    await remove({ deleteCode: code });
    mutate((current: any[]) => current?.filter(g => g.id !== targetId) || [], false);
    toast.success(t('deleted'));
    setDeleteTarget(null);
  } catch (err: any) {
    if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
    else if (err.status === 400) toast.error(t('invalidCode'));
    else toast.error(err.message || t('error'));
  } finally {
    setDeleteLoading(false);
  }
};
  // 3. Strict State Pattern
  if (error) return <RetryableError error={error} onRetry={retry} isRetrying={isRetrying} />;
  if (!data && isValidating) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('title')}</h2>
        <div className="flex gap-2">
          <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="w-4 h-4 mr-1" /> {t('create')}</Button>
          <RefreshButton onRefresh={() => mutate()} loading={isValidating} />
        </div>
      </div>

            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('title')}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('progress')}</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.length === 0 ? (
              <tr><td colSpan={3} className="text-center text-gray-500 py-6">{t('empty')}</td></tr>
            ) : (
              data?.map((goal: any) => (
                <tr key={goal.id} className="border-t">
                  <td className="px-4 py-3">{goal.title_fr}</td>
                  <td className="px-4 py-3">{goal.current_value} / {goal.target_value} {goal.unit}</td>
                  <td className="px-4 py-3 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setEditing(goal); setShowForm(true); }}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleteTarget(goal.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>      </div>


      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-white max-w-lg">
          <DialogHeader><DialogTitle>{editing ? t('edit') : t('create')}</DialogTitle></DialogHeader>
          <GoalForm 
            initial={editing} 
            mutate={mutate} 
            onClose={() => setShowForm(false)} 
          />
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog 
        open={!!deleteTarget} 
        onOpenChange={(open) => { 
          if (!open) { 
            setDeleteTarget(null); 
            setDeleteError(null); 
          } 
        }} 
        onConfirm={handleDelete} 
        error={deleteError} 
          loading={deleteLoading}

      />


          </div>
  );
}

function GoalForm({ initial, mutate, onClose }: any) {
  const t = useTranslations('admin.goals');
  const schema = goalSchema(t);
  
  const { register, handleSubmit, formState: { errors, isValid }, getValues, setValue, watch, control } = useForm<GoalFormData>({
    resolver: zodResolver(schema),
    defaultValues: initial || { title_fr: '', title_ar: '', current_value: 0, target_value: 100, unit: '', icon_url: '', start_date: '', end_date: '' },
    mode: 'onChange',
  });

  // Hooks are instantiated INSIDE the form with the correct initial ID. No stale closures.
  const { trigger: create, loading: creating } = useAdminPOST('/goals', { showToast: false });
  const { trigger: update, loading: updating } = useAdminPUT(`/goals/${initial?.id || ''}`, { showToast: false });
  const loading = creating || updating;
  const [translating, setTranslating] = useState(false);

  const handleTranslate = async () => {
    const values = getValues();
    const missing: { field: string; text: string; targetLang: 'fr' | 'ar'; sourceLang: 'fr' | 'ar' }[] = [];
    if (values.title_fr && !values.title_ar) missing.push({ field: 'title_ar', text: values.title_fr, targetLang: 'ar', sourceLang: 'fr' });
    if (values.title_ar && !values.title_fr) missing.push({ field: 'title_fr', text: values.title_ar, targetLang: 'fr', sourceLang: 'ar' });
    if (missing.length === 0) return;
    setTranslating(true);
    try {
      const groups: Record<string, typeof missing> = {};
      missing.forEach(b => { const key = b.sourceLang; if (!groups[key]) groups[key] = []; groups[key].push(b); });
      for (const group of Object.values(groups)) {
        const texts = group.map(b => b.text);
        const translated = await translateBatch(texts, group[0].targetLang, group[0].sourceLang);
        group.forEach((b, idx) => setValue(b.field, translated[idx], { shouldValidate: true }));
      }
    } catch { toast.error(t('translationFailed')); }
    setTranslating(false);
  };

  const handleSave = async (formData: GoalFormData) => {
    try {
      if (initial) {
        const updated = await update(formData);
        // Optimistically update the specific item in the cache
        mutate((current: any[]) => current?.map(g => g.id === initial.id ? updated : g) || [], false);
        toast.success(t('updated'));
      } else {
        const created = await create(formData);
        // Optimistically add the new item to the cache
        mutate((current: any[]) => [...(current || []), created], false);
        toast.success(t('created'));
      }
      onClose(); // Close modal
    } catch (err: any) {
      if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
      else if (err.status === 400) toast.error(t('invalidRequest'));
      else toast.error(t('error'));
    }
  };

  const canTranslate = (watch('title_fr') && !watch('title_ar')) || (watch('title_ar') && !watch('title_fr'));

  return (
    <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
      <div>
        <Input placeholder={t('titleFrPlaceholder')} {...register('title_fr')} className={errors.title_fr ? 'border-red-500' : ''} />
        {errors.title_fr && <p className="text-red-500 text-xs mt-1">{errors.title_fr.message}</p>}
      </div>
      <div>
        <Input placeholder={t('titleArPlaceholder')} {...register('title_ar')} className={errors.title_ar ? 'border-red-500' : ''} />
        {errors.title_ar && <p className="text-red-500 text-xs mt-1">{errors.title_ar.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Input type="number" placeholder={t('currentValuePlaceholder')} {...register('current_value')} className={errors.current_value ? 'border-red-500' : ''} />
          {errors.current_value && <p className="text-red-500 text-xs mt-1">{errors.current_value.message}</p>}
        </div>
        <div>
          <Input type="number" placeholder={t('targetValuePlaceholder')} {...register('target_value')} className={errors.target_value ? 'border-red-500' : ''} />
          {errors.target_value && <p className="text-red-500 text-xs mt-1">{errors.target_value.message}</p>}
        </div>
      </div>
      <div>
        <Input placeholder={t('unitPlaceholder')} {...register('unit')} className={errors.unit ? 'border-red-500' : ''} />
        {errors.unit && <p className="text-red-500 text-xs mt-1">{errors.unit.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-gray-500">{t('startDate')}</label>
          <Input type="date" {...register('start_date')} className={errors.start_date ? 'border-red-500' : ''} />
          {errors.start_date && <p className="text-red-500 text-xs mt-1">{errors.start_date.message}</p>}
        </div>
        <div>
          <label className="text-xs text-gray-500">{t('endDate')}</label>
          <Input type="date" {...register('end_date')} className={errors.end_date ? 'border-red-500' : ''} />
          {errors.end_date && <p className="text-red-500 text-xs mt-1">{errors.end_date.message}</p>}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">{t('icon')}</label>
        <Controller name="icon_url" control={control} render={({ field }) => <IconPicker value={field.value} onChange={field.onChange} />} />
        {errors.icon_url && <p className="text-red-500 text-xs mt-1">{errors.icon_url.message}</p>}
      </div>
      <div className="flex gap-2 justify-end">
        {canTranslate && (
          <Button type="button" variant="outline" onClick={handleTranslate} disabled={translating}>
            {translating ? t('translating') : t('translate')}
          </Button>
        )}
        <Button type="submit" disabled={!isValid || loading}>{loading ? t('saving') : t('save')}</Button>
      </div>
    </form>
  );
}