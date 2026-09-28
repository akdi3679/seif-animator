'use client';
import { useMemo, useState, useCallback } from 'react';
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
import { Pencil, Trash2, Plus, Loader2, ImageIcon, X, GripVertical } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { translateBatch } from '@/lib/utils/translate';
import { uploadToCloudinary } from '@/lib/cloudinary-upload';
import { adminAPI } from '@/lib/api/client';
import Image from 'next/image';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2">
      <button className="p-2 cursor-grab touch-none text-gray-400 hover:text-gray-600" {...attributes} {...listeners}>
        <GripVertical className="w-4 h-4" />
      </button>
      {children}
    </div>
  );
}

const heroSchema = (t: any) => z.object({
  title_fr: z.string().min(1, t('validation.titleFrRequired')),
  title_ar: z.string().min(1, t('validation.titleArRequired')),
  subtitle_fr: z.string().min(1, t('validation.subtitleFrRequired')),
  subtitle_ar: z.string().min(1, t('validation.subtitleArRequired')),
  button_text_fr: z.string().min(1, t('validation.buttonTextFrRequired')),
  button_text_ar: z.string().min(1, t('validation.buttonTextArRequired')),
  button_link: z.string().min(1, t('validation.buttonLinkRequired'))
    .refine((val) => val.startsWith('/'), { message: t('validation.buttonLinkMustStartWithSlash') }),
  show_floating_buttons: z.boolean().optional().default(false),
});

export default function HeroSlidesTab() {
  const t = useTranslations('admin.heroSlides');
  const { data, mutate, isValidating, error, retry, isRetrying } = useAdminGETSWR<any[]>('/hero');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
const [translating, setTranslating] = useState(false);

  const { trigger: deleteHero, loading: deleteLoading, error: deleteApiError } = useAdminDELETE(() => `/hero/${deleteTarget}`);
const [savingOrder, setSavingOrder] = useState(false);
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
  const orderChanged = useMemo(() => {
    if (!orderedIds || !data) return false;
    return orderedIds.join(',') !== data.map(s => s.id).join(',');
  }, [orderedIds, data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !data) return;
    const oldIndex = data.findIndex(s => s.id === active.id);
    const newIndex = data.findIndex(s => s.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      setOrderedIds(arrayMove(data, oldIndex, newIndex).map(s => s.id));
    }
  }, [data]);
const handleTranslate = async () => {
  const values = getValues();
  const missing: any[] = [];
  if (values.title_fr && !values.title_ar) missing.push({ field: 'title_ar', text: values.title_fr, targetLang: 'ar', sourceLang: 'fr' });
  if (values.title_ar && !values.title_fr) missing.push({ field: 'title_fr', text: values.title_ar, targetLang: 'fr', sourceLang: 'ar' });
  if (missing.length === 0) return;
  setTranslating(true);
  try {
    const groups: Record<string, any[]> = {};
    missing.forEach(b => { if (!groups[b.sourceLang]) groups[b.sourceLang] = []; groups[b.sourceLang].push(b); });
    for (const group of Object.values(groups)) {
      const texts = group.map(b => b.text);
      const translated = await translateBatch(texts, group[0].targetLang, group[0].sourceLang);
      group.forEach((b, idx) => setValue(b.field as any, translated[idx], { shouldValidate: true }));
    }
  } catch { toast.error(t('translationFailed')); }
  setTranslating(false);
};
  const handleSaveOrder = async () => {
    if (!orderedIds || !data) return;
      setSavingOrder(true);

    const payload = orderedIds.map((id, idx) => ({ id, order_index: idx }));
    try {
      await adminAPI('/hero/order', { method: 'PUT', body: JSON.stringify({ items: payload }) });
      const reordered = orderedIds.map(id => data.find(s => s.id === id)!);
      mutate(reordered, false);
      setOrderedIds(null);
      toast.success(t('orderSaved'));
    } catch (err: any) {
      if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
      else toast.error(err.message || t('error'));
    } finally {
    setSavingOrder(false);
  }
  };

  const handleDelete = async (deleteCode: string) => {
    if (!deleteTarget) return;
    try {
      await deleteHero({ deleteCode });
      mutate((current) => current ? current.filter((s: any) => s.id !== deleteTarget) : current, false);
      toast.success(t('deleted'));
      setDeleteTarget(null);
    } catch {}
  };

  if (error) return <RetryableError error={error} onRetry={retry} isRetrying={isRetrying} />;
  if (!data && isValidating) return <LoadingSpinner />;

  const slides = (orderedIds ? orderedIds.map(id => data!.find(s => s.id === id)!) : data) ?? [];

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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={slides.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            {slides.length === 0 ? (
              <p className="text-center text-gray-500 py-10">{t('empty')}</p>
            ) : (
              slides.map(slide => (
                <SortableItem key={slide.id} id={slide.id}>
                  <div className="flex-1 flex items-center justify-between p-3 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      {slide.image_url && <Image src={slide.image_url} alt="" width={60} height={40} className="rounded object-cover" unoptimized />}
                      <span className="font-medium">{slide.title_fr}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setEditing(slide); setShowForm(true); }}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDeleteTarget(slide.id)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </SortableItem>
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>

      {orderChanged && (
        <div className="flex justify-end">
          <Button onClick={handleSaveOrder} disabled={savingOrder} >{savingOrder ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
  {t('saveOrder')}</Button>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-white max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t('edit') : t('create')}</DialogTitle></DialogHeader>
          <HeroForm initial={editing} mutate={mutate} onClose={() => setShowForm(false)} t={t} />
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

function HeroForm({ initial, mutate, onClose, t }: any) {
  const schema = heroSchema(t);
  const { register, handleSubmit, formState: { errors, isValid }, getValues, watch, setValue } = useForm({
    resolver: zodResolver(schema),
    defaultValues: initial || {
      image_url: '', title_fr: '', title_ar: '', subtitle_fr: '', subtitle_ar: '',
      button_text_fr: '', button_text_ar: '', button_link: '', show_floating_buttons: false,
    },
    mode: 'onChange',
  });

  const { trigger: create, loading: creating } = useAdminPOST('/hero', { showToast: false });
  const { trigger: update, loading: updating } = useAdminPUT(() => `/hero/${initial?.id}`, { showToast: false });
  const loading = creating || updating;

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initial?.image_url || null);
  const [uploading, setUploading] = useState(false);
  const [translating, setTranslating] = useState(false);

  const handleImageChange = (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const canTranslate =
    (watch('title_fr') && !watch('title_ar')) ||
    (watch('title_ar') && !watch('title_fr')) ||
    (watch('subtitle_fr') && !watch('subtitle_ar')) ||
    (watch('subtitle_ar') && !watch('subtitle_fr')) ||
    (watch('button_text_fr') && !watch('button_text_ar')) ||
    (watch('button_text_ar') && !watch('button_text_fr'));

  const handleTranslate = async () => {
    const values = getValues();
    const missing: any[] = [];
    if (values.title_fr && !values.title_ar) missing.push({ field: 'title_ar', text: values.title_fr, targetLang: 'ar', sourceLang: 'fr' });
    if (values.title_ar && !values.title_fr) missing.push({ field: 'title_fr', text: values.title_ar, targetLang: 'fr', sourceLang: 'ar' });
    if (values.subtitle_fr && !values.subtitle_ar) missing.push({ field: 'subtitle_ar', text: values.subtitle_fr, targetLang: 'ar', sourceLang: 'fr' });
    if (values.subtitle_ar && !values.subtitle_fr) missing.push({ field: 'subtitle_fr', text: values.subtitle_ar, targetLang: 'fr', sourceLang: 'ar' });
    if (values.button_text_fr && !values.button_text_ar) missing.push({ field: 'button_text_ar', text: values.button_text_fr, targetLang: 'ar', sourceLang: 'fr' });
    if (values.button_text_ar && !values.button_text_fr) missing.push({ field: 'button_text_fr', text: values.button_text_ar, targetLang: 'fr', sourceLang: 'ar' });
    if (missing.length === 0) return;
    setTranslating(true);
    try {
      const groups: Record<string, any[]> = {};
      missing.forEach(b => { if (!groups[b.sourceLang]) groups[b.sourceLang] = []; groups[b.sourceLang].push(b); });
      for (const group of Object.values(groups)) {
        const texts = group.map(b => b.text);
        const translated = await translateBatch(texts, group[0].targetLang, group[0].sourceLang);
        group.forEach((b, idx) => setValue(b.field as any, translated[idx], { shouldValidate: true }));
      }
    } catch { toast.error(t('translationFailed')); }
    setTranslating(false);
  };

  const handleSave = async (formData: any) => {
    let imageUrl = initial?.image_url || '';
    let imagePublicId = initial?.image_public_id || null;

    if (imageFile) {
      setUploading(true);
      try {
        const result = await uploadToCloudinary(imageFile);
        imageUrl = result.url;
        imagePublicId = result.public_id;
      } catch {
        toast.error(t('uploadFailed'));
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const payload = { ...formData, image_url: imageUrl, image_public_id: imagePublicId };

    try {
      if (initial) {
        const updated = await update(payload);
        mutate((current: any[]) => current ? current.map(s => s.id === updated.id ? updated : s) : current, false);
        toast.success(t('updated'));
      } else {
        const created = await create(payload);
        mutate((current: any[]) => [created, ...(current || [])], false);
        toast.success(t('created'));
      }
      onClose();
    } catch (err: any) {
      if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
      else toast.error(err.message || t('error'));
    }
  };

  return (
    <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
      {/* Image */}
      <div>
        <label className="block text-sm font-medium mb-1">{t('image')}</label>
        {previewUrl ? (
          <div className="relative inline-block">
            <Image src={previewUrl} alt="Preview" width={120} height={80} className="rounded object-cover" unoptimized />
            <label className="absolute bottom-1 right-1 bg-white/90 rounded-full p-1 shadow cursor-pointer hover:bg-white">
              <ImageIcon className="w-4 h-4 text-primary" />
              <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </label>
          </div>
        ) : (
          <label className="cursor-pointer inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <ImageIcon className="w-4 h-4" /> {t('chooseImage')}
            <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </label>
        )}
      </div>

      <Input placeholder={t('titleFrPlaceholder')} {...register('title_fr')} />
      <Input placeholder={t('titleArPlaceholder')} {...register('title_ar')} />
      <Input placeholder={t('subtitleFrPlaceholder')} {...register('subtitle_fr')} />
      <Input placeholder={t('subtitleArPlaceholder')} {...register('subtitle_ar')} />
      <Input placeholder={t('buttonTextFrPlaceholder')} {...register('button_text_fr')} />
      <Input placeholder={t('buttonTextArPlaceholder')} {...register('button_text_ar')} />
      <Input placeholder={t('buttonLinkPlaceholder')} {...register('button_link')} />

      <div className="flex items-center gap-2">
        <input type="checkbox" {...register('show_floating_buttons')} />
        <span>{t('showFloatingButtons')}</span>
      </div>

      <div className="flex gap-2 justify-end">
        {canTranslate && (
          <Button type="button" variant="outline" onClick={handleTranslate} disabled={translating}>
            {translating ? t('translating') : t('translate')}
          </Button>
        )}
        <Button type="submit" disabled={!isValid || loading || uploading || (!previewUrl && !initial?.image_url)}>
          {loading || uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
          {t('save')}
        </Button>
      </div>
    </form>
  );
}