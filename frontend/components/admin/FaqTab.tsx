'use client';
import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR, useAdminPOST, useAdminPUT, useAdminDELETE } from '@/lib/api/hooks';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';
import { toast } from 'sonner';
import { Pencil, Trash2, Plus, Save } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { translateBatch } from '@/lib/utils/translate';
import { RateLimitError } from '@/lib/api/types';
import dynamic from 'next/dynamic';
import { adminAPI } from '@/lib/api/client';

const SortableList = dynamic(() => import('@/components/admin/SortableList'), { ssr: false });

function arraysEqual(a: any[], b: any[]) {
  if (a.length !== b.length) return false;
  return a.every((item, idx) => item.id === b[idx].id);
}

const faqSchema = (t: any) =>
  z.object({
    question_fr: z.string().min(1, t('validation.questionFrRequired')),
    question_ar: z.string().min(1, t('validation.questionArRequired')),
    answer_fr: z.string().min(1, t('validation.answerFrRequired')),
    answer_ar: z.string().min(1, t('validation.answerArRequired')),
    // order_index removed – managed by drag-and-drop
  });

type FaqFormData = z.infer<ReturnType<typeof faqSchema>>;

export default function FaqTab() {
  const t = useTranslations('admin.faq');
  const { data, mutate, isValidating, error, retry, isRetrying } = useAdminGETSWR<any[]>('/faq');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [orderedItems, setOrderedItems] = useState<any[] | null>(null);
  const currentItems = orderedItems ?? data ?? [];
  const orderChanged = orderedItems !== null && !arraysEqual(data || [], orderedItems);

  const { trigger: remove } = useAdminDELETE(() => `/faq/${deleteTarget}`);

  const handleOrderChange = useCallback((newItems: any[]) => {
    setOrderedItems(newItems);
  }, []);

  const handleSaveOrder = async () => {
    if (!orderedItems) return;
    const payload = orderedItems.map((item, idx) => ({ id: item.id, order_index: idx }));
    try {
      await adminAPI('/faq/order', { method: 'PUT', body: JSON.stringify({ items: payload }) });
      mutate(orderedItems, false);
      setOrderedItems(null);
      toast.success(t('orderSaved'));
    } catch (err: any) {
      if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
      else toast.error(err.message || t('error'));
    }
  };

  const handleDelete = async (deleteCode: string) => {
    if (!deleteTarget) return;
    const targetId = deleteTarget;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await remove({ deleteCode });
      const next = (currentItems || []).filter(s => s.id !== targetId);
      mutate(next, false);
      toast.success(t('deleted'));
      setDeleteTarget(null);
    } catch (err: any) {
      if (err instanceof RateLimitError) setDeleteError(t('rateLimit', { seconds: err.retryAfter }));
      else if (err.status === 400) setDeleteError(t('invalidCode'));
      else setDeleteError(err.message || t('error'));
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
          <Button onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-1" /> {t('create')}
          </Button>
          <RefreshButton onRefresh={() => mutate()} loading={isValidating} />
        </div>
      </div>

      {currentItems.length === 0 ? (
        <p className="text-center text-gray-500 py-10">{t('empty')}</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <SortableList
            items={currentItems}
            onOrderChange={handleOrderChange}
            idAccessor={(item) => item.id}
            renderItem={(item) => (
              <div className="flex items-center justify-between p-3 w-full">
                <span className="font-medium">{item.question_fr}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setEditing(item); setShowForm(true); }}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDeleteTarget(item.id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            )}
          />
        </div>
      )}

      {orderChanged && (
        <div className="flex justify-end">
          <Button onClick={handleSaveOrder}>
            <Save className="w-4 h-4 mr-2" /> {t('saveOrder')}
          </Button>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-white max-w-lg">
          <DialogHeader><DialogTitle>{editing ? t('edit') : t('create')}</DialogTitle></DialogHeader>
          <FaqForm
            initial={editing}
            onSaved={(newItem) => {
  if (newItem) {
    mutate((current) => {
      const list = current || [];
      const existingIndex = list.findIndex((s: any) => s.id === newItem.id);
      if (existingIndex >= 0) {
        const updated = [...list];
        updated[existingIndex] = newItem;
        return updated;
      }
      // New item – prepend to the list
      return [newItem, ...list];
    }, false);
  } else {
    mutate(); // fallback full refetch
  }
  setShowForm(false);
}}
            onCancel={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteError(null); } }}
        onConfirm={handleDelete}
        error={deleteError}
        loading={deleteLoading}
      />
    </div>
  );
}

function FaqForm({ initial, onSaved, onCancel }: any) {
  const t = useTranslations('admin.faq');
  const schema = faqSchema(t);
  const { register, handleSubmit, formState: { errors, isValid }, getValues, setValue, watch } = useForm<FaqFormData>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? { question_fr: initial.question_fr, question_ar: initial.question_ar, answer_fr: initial.answer_fr, answer_ar: initial.answer_ar }
      : { question_fr: '', question_ar: '', answer_fr: '', answer_ar: '' },
    mode: 'onChange',
  });

  const { trigger: create, loading: creating } = useAdminPOST('/faq', { showToast: false });
  const { trigger: update, loading: updating } = useAdminPUT(() => `/faq/${initial?.id}`, { showToast: false });
  const loading = creating || updating;
  const [translating, setTranslating] = useState(false);

  const handleTranslate = async () => {
    const values = getValues();
    const missing: { field: string; text: string; targetLang: 'fr' | 'ar'; sourceLang: 'fr' | 'ar' }[] = [];
    if (values.question_fr && !values.question_ar) missing.push({ field: 'question_ar', text: values.question_fr, targetLang: 'ar', sourceLang: 'fr' });
    if (values.question_ar && !values.question_fr) missing.push({ field: 'question_fr', text: values.question_ar, targetLang: 'fr', sourceLang: 'ar' });
    if (values.answer_fr && !values.answer_ar) missing.push({ field: 'answer_ar', text: values.answer_fr, targetLang: 'ar', sourceLang: 'fr' });
    if (values.answer_ar && !values.answer_fr) missing.push({ field: 'answer_fr', text: values.answer_ar, targetLang: 'fr', sourceLang: 'ar' });
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

  const handleSave = async (formData: FaqFormData) => {
    try {
      if (initial) {
        const updated = await update(formData);
        toast.success(t('updated'));
        onSaved(updated);
      } else {
        const created = await create(formData);
        toast.success(t('created'));
        onSaved(created);
      }
    } catch (err: any) {
      if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
      else toast.error(err.message || t('error'));
    }
  };

  const canTranslate =
    (watch('question_fr') && !watch('question_ar')) ||
    (watch('question_ar') && !watch('question_fr')) ||
    (watch('answer_fr') && !watch('answer_ar')) ||
    (watch('answer_ar') && !watch('answer_fr'));

  return (
    <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
      <div>
        <Input placeholder="Question FR" {...register('question_fr')} className={errors.question_fr ? 'border-red-500' : ''} />
        {errors.question_fr && <p className="text-red-500 text-xs mt-1">{errors.question_fr.message}</p>}
      </div>
      <div>
        <Input placeholder="Question AR" {...register('question_ar')} className={errors.question_ar ? 'border-red-500' : ''} />
        {errors.question_ar && <p className="text-red-500 text-xs mt-1">{errors.question_ar.message}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">Réponse FR</label>
        <Textarea rows={4} {...register('answer_fr')} className={errors.answer_fr ? 'border-red-500' : ''} />
        {errors.answer_fr && <p className="text-red-500 text-xs mt-1">{errors.answer_fr.message}</p>}
      </div>
      <div>
        <label className="text-sm font-medium">Réponse AR</label>
        <Textarea rows={4} {...register('answer_ar')} className={errors.answer_ar ? 'border-red-500' : ''} />
        {errors.answer_ar && <p className="text-red-500 text-xs mt-1">{errors.answer_ar.message}</p>}
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