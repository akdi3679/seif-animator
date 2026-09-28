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

const keyFigureSchema = (t: any) =>
  z.object({
    name_fr: z.string().min(1, t('validation.nameFrRequired')),
    name_ar: z.string().min(1, t('validation.nameArRequired')),
    value: z.string().min(1, t('validation.valueRequired')),
    description_fr: z.string().min(1, t('validation.descriptionFrRequired')),
    description_ar: z.string().min(1, t('validation.descriptionArRequired')),
    icon_url: z.string().min(1, t('validation.iconRequired')),
  });

type KeyFigureFormData = z.infer<ReturnType<typeof keyFigureSchema>>;

export function KeyFiguresTab() {
  const t = useTranslations('admin.keyFigures');
  const { data, mutate, refresh ,  error, retry, isRetrying, isValidating } = useAdminGETSWR<any[]>('/key-figures');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null); // NEW: Error state for dialog
const { trigger: remove } = useAdminDELETE(() => `/key-figures/${deleteTarget}`, { showToast: false });
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
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('name')}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('value')}</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {data?.length === 0 ? (
              <tr><td colSpan={3} className="text-center text-gray-500 py-6">{t('empty')}</td></tr>
            ) : (
              data?.map((item: any) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3 flex items-center gap-2">
                    {item.icon_url && <span dangerouslySetInnerHTML={{ __html: item.icon_url }} />}
                    {item.name_fr}
                  </td>
                  <td className="px-4 py-3">{item.value}</td>
                  <td className="px-4 py-3 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setEditing(item); setShowForm(true); }}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleteTarget(item.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-white max-w-lg">
          <DialogHeader><DialogTitle>{editing ? t('edit') : t('create')}</DialogTitle></DialogHeader>
          <KeyFigureForm 
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

function KeyFigureForm({ initial, mutate, onClose }: any) {
  const t = useTranslations('admin.keyFigures');
  const schema = keyFigureSchema(t);
  const { register, handleSubmit, formState: { errors, isValid }, getValues, setValue, watch, control } = useForm<KeyFigureFormData>({
    resolver: zodResolver(schema),
    defaultValues: initial || { name_fr: '', name_ar: '', value: '', description_fr: '', description_ar: '', icon_url: '' },
    mode: 'onChange',
  });

  const { trigger: create, loading: creating } = useAdminPOST('/key-figures', { showToast: false });
  const { trigger: update, loading: updating } = useAdminPUT(`/key-figures/${initial?.id || ''}`, { showToast: false });
  const loading = creating || updating;
  const [translating, setTranslating] = useState(false);

  const handleTranslate = async () => {
    const values = getValues();
    const missing: { field: string; text: string; targetLang: 'fr' | 'ar'; sourceLang: 'fr' | 'ar' }[] = [];
    if (values.name_fr && !values.name_ar) missing.push({ field: 'name_ar', text: values.name_fr, targetLang: 'ar', sourceLang: 'fr' });
    if (values.name_ar && !values.name_fr) missing.push({ field: 'name_fr', text: values.name_ar, targetLang: 'fr', sourceLang: 'ar' });
    if (values.description_fr && !values.description_ar) missing.push({ field: 'description_ar', text: values.description_fr, targetLang: 'ar', sourceLang: 'fr' });
    if (values.description_ar && !values.description_fr) missing.push({ field: 'description_fr', text: values.description_ar, targetLang: 'fr', sourceLang: 'ar' });
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

  const handleSave = async (formData: KeyFigureFormData) => {
    try {
      if (initial) {
        const updated = await update(formData);
        mutate((current: any[]) => current?.map(g => g.id === initial.id ? updated : g) || [], false);
        toast.success(t('updated'));
      } else {
        const created = await create(formData);
        mutate((current: any[]) => [...(current || []), created], false);
        toast.success(t('created'));
      }
      onClose();
    } catch (err: any) {
      if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
      else if (err.status === 400) toast.error(t('invalidRequest'));
      else toast.error(t('error'));
    }
  };

  const canTranslate = (watch('name_fr') && !watch('name_ar')) || (watch('name_ar') && !watch('name_fr')) || (watch('description_fr') && !watch('description_ar')) || (watch('description_ar') && !watch('description_fr'));

  return (
    <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
      <div>
        <Input placeholder={t('nameFrPlaceholder')} {...register('name_fr')} className={errors.name_fr ? 'border-red-500' : ''} />
        {errors.name_fr && <p className="text-red-500 text-xs mt-1">{errors.name_fr.message}</p>}
      </div>
      <div>
        <Input placeholder={t('nameArPlaceholder')} {...register('name_ar')} className={errors.name_ar ? 'border-red-500' : ''} />
        {errors.name_ar && <p className="text-red-500 text-xs mt-1">{errors.name_ar.message}</p>}
      </div>
      <div>
        <Input placeholder={t('valuePlaceholder')} {...register('value')} className={errors.value ? 'border-red-500' : ''} />
        {errors.value && <p className="text-red-500 text-xs mt-1">{errors.value.message}</p>}
      </div>
      <div>
        <Input placeholder={t('descriptionFrPlaceholder')} {...register('description_fr')} className={errors.description_fr ? 'border-red-500' : ''} />
        {errors.description_fr && <p className="text-red-500 text-xs mt-1">{errors.description_fr.message}</p>}
      </div>
      <div>
        <Input placeholder={t('descriptionArPlaceholder')} {...register('description_ar')} className={errors.description_ar ? 'border-red-500' : ''} />
        {errors.description_ar && <p className="text-red-500 text-xs mt-1">{errors.description_ar.message}</p>}
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