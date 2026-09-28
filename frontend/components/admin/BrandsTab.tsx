'use client';
import { useMemo, useState, useCallback } from 'react';
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

const brandSchema = (t: any) => z.object({
  name_fr: z.string().min(1, t('validation.nameFrRequired')),
  name_ar: z.string().min(1, t('validation.nameArRequired')),
  website_url: z.string().url().min(1, t('validation.websiteRequired')),
  description_fr: z.string().min(1, t('validation.descriptionFrRequired')),
  description_ar: z.string().min(1, t('validation.descriptionArRequired')),
});

export default function BrandsTab() {
  const t = useTranslations('admin.brands');
  const { data, mutate, isValidating, error, retry, isRetrying } = useAdminGETSWR<any[]>('/brands');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
const [savingOrder, setSavingOrder] = useState(false);
  const { trigger: deleteBrand, loading: deleteLoading, error: deleteApiError } = useAdminDELETE(() => `/brands/${deleteTarget}`);

  // Reorder state
  const [orderedIds, setOrderedIds] = useState<string[] | null>(null);
  const orderChanged = useMemo(() => {
    if (!orderedIds || !data) return false;
    return orderedIds.join(',') !== data.map(b => b.id).join(',');
  }, [orderedIds, data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !data) return;
    const oldIndex = data.findIndex(b => b.id === active.id);
    const newIndex = data.findIndex(b => b.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      setOrderedIds(arrayMove(data, oldIndex, newIndex).map(b => b.id));
    }
  }, [data]);

  const handleSaveOrder = async () => {
  if (!orderedIds || !data) return;
  setSavingOrder(true);
  const payload = orderedIds.map((id, idx) => ({ id, order_index: idx }));
  try {
    await adminAPI('/brands/order', { method: 'PUT', body: JSON.stringify({ items: payload }) });
    const reordered = orderedIds.map(id => data!.find(b => b.id === id)!);
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
      await deleteBrand({ deleteCode });
      mutate((current) => current ? current.filter((b: any) => b.id !== deleteTarget) : current, false);
      toast.success(t('deleted'));
      setDeleteTarget(null);
    } catch {}
  };

  if (error) return <RetryableError error={error} onRetry={retry} isRetrying={isRetrying} />;
  if (!data && isValidating) return <LoadingSpinner />;

  const brands = (orderedIds ? orderedIds.map(id => data!.find(b => b.id === id)!) : data) ?? [];

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
        <SortableContext items={brands.map(b => b.id)} strategy={verticalListSortingStrategy}>
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            {brands.length === 0 ? (
              <p className="text-center text-gray-500 py-10">{t('empty')}</p>
            ) : (
              brands.map(brand => (
                <SortableItem key={brand.id} id={brand.id}>
                  <div className="flex-1 flex items-center justify-between p-3 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      {brand.logo_url && <Image src={brand.logo_url} alt="" width={40} height={40} className="rounded object-contain" unoptimized />}
                      <span className="font-medium">{brand.name_fr}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setEditing(brand); setShowForm(true); }}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDeleteTarget(brand.id)}>
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
          <Button onClick={handleSaveOrder} disabled={savingOrder}>
  {savingOrder ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
  {t('saveOrder')}
</Button>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader><DialogTitle>{editing ? t('edit') : t('create')}</DialogTitle></DialogHeader>
          <BrandForm initial={editing} mutate={mutate} onClose={() => setShowForm(false)} t={t} />
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

function BrandForm({ initial, mutate, onClose, t }: any) {
  const schema = brandSchema(t);
  const { register, handleSubmit, formState: { errors, isValid }, getValues, watch, setValue } = useForm({
    resolver: zodResolver(schema),
    defaultValues: initial || { name_fr: '', name_ar: '', logo_url: '', website_url: '', description_fr: '', description_ar: '' },
    mode: 'onChange',
  });

  const { trigger: create, loading: creating } = useAdminPOST('/brands', { showToast: false });
  const { trigger: update, loading: updating } = useAdminPUT(() => `/brands/${initial?.id}`, { showToast: false });
  const loading = creating || updating;
  const [translating, setTranslating] = useState(false);
const canTranslate =
  (watch('name_fr') && !watch('name_ar')) ||
  (watch('name_ar') && !watch('name_fr')) ||
  (watch('description_fr') && !watch('description_ar')) ||
  (watch('description_ar') && !watch('description_fr'));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initial?.logo_url || null);
  const [uploading, setUploading] = useState(false);

  const handleImageChange = (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };
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
    missing.forEach(b => { if (!groups[b.sourceLang]) groups[b.sourceLang] = []; groups[b.sourceLang].push(b); });
    for (const group of Object.values(groups)) {
      const texts = group.map(b => b.text);
      const translated = await translateBatch(texts, group[0].targetLang, group[0].sourceLang);
      group.forEach((b, idx) => setValue(b.field as any, translated[idx], { shouldValidate: true }));
    }
  } catch { toast.error(t('translationFailed')); }
  setTranslating(false);
};
  // Remove image is not allowed – only replace
  const handleSave = async (formData: any) => {
    let logoUrl = initial?.logo_url || '';
    let imagePublicId = initial?.image_public_id || null;

    if (imageFile) {
      setUploading(true);
      try {
        toast.info(t('uploadingImage'));
        const result = await uploadToCloudinary(imageFile);
        logoUrl = result.url;
        imagePublicId = result.public_id;
      } catch {
        toast.error(t('uploadFailed'));
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    if (!logoUrl) {
      toast.error(t('validation.logoRequired'));
      return;
    }

    const payload = { ...formData, logo_url: logoUrl, image_public_id: imagePublicId };

    try {
      if (initial) {
        const updated = await update(payload);
        mutate((current: any[]) => current ? current.map(b => b.id === updated.id ? updated : b) : current, false);
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
      {/* Logo – only replace, no remove */}
      <div>
        <label className="block text-sm font-medium mb-1">{t('logo')}</label>
        {previewUrl ? (
          <div className="relative inline-block">
            <Image src={previewUrl} alt="Preview" width={80} height={80} className="rounded-xl object-cover" unoptimized />
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

      <Input placeholder={t('nameFrPlaceholder')} {...register('name_fr')} />
      {errors.name_fr && <p className="text-red-500 text-xs mt-1">{errors.name_fr.message as string}</p>}
      <Input placeholder={t('nameArPlaceholder')} {...register('name_ar')} />
      {errors.name_ar && <p className="text-red-500 text-xs mt-1">{errors.name_ar.message as string}</p>}
      <Input placeholder={t('websitePlaceholder')} {...register('website_url')} />
      {errors.website_url && <p className="text-red-500 text-xs mt-1">{errors.website_url.message as string}</p>}
      <Textarea placeholder={t('descriptionFrPlaceholder')} {...register('description_fr')} />
      {errors.description_fr && <p className="text-red-500 text-xs mt-1">{errors.description_fr.message as string}</p>}
      <Textarea placeholder={t('descriptionArPlaceholder')} {...register('description_ar')} />
      {errors.description_ar && <p className="text-red-500 text-xs mt-1">{errors.description_ar.message as string}</p>}
      <div className="flex gap-2 justify-end">
        {canTranslate && (
          <Button type="button" variant="outline" onClick={handleTranslate} disabled={translating}>
            {translating ? t('translating') : t('translate')}
          </Button>
        )}
        <Button type="submit" disabled={!isValid || loading || uploading || (!previewUrl && !initial?.logo_url)}>
          {loading || uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
          {t('save')}
        </Button>
      </div>

    </form>
  );
}