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
import { uploadToCloudinary } from '@/lib/cloudinary-upload';
import Image from 'next/image';
import { ImageIcon, X, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { adminAPI } from '@/lib/api/client';

const SortableList = dynamic(() => import('@/components/admin/SortableList'), { ssr: false });

function arraysEqual(a: any[], b: any[]) {
  if (a.length !== b.length) return false;
  return a.every((item, idx) => item.id === b[idx].id);
}

const serviceSchema = (t: any) =>
  z.object({
    title_fr: z.string().min(1, t('validation.titleFrRequired')),
    title_ar: z.string().min(1, t('validation.titleArRequired')),
    description_fr: z.string().min(1, t('validation.descriptionFrRequired')),
    description_ar: z.string().min(1, t('validation.descriptionArRequired')),
  });

type ServiceFormData = z.infer<ReturnType<typeof serviceSchema>>;

export default function ServicesClient() {
  const t = useTranslations('admin.services');
  const { data, mutate, isValidating, error, retry, isRetrying } = useAdminGETSWR<any[]>('/services');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [orderedItems, setOrderedItems] = useState<any[] | null>(null);
  const currentItems = orderedItems ?? data ?? [];
  const orderChanged = orderedItems !== null && !arraysEqual(data || [], orderedItems);

  const { trigger: remove } = useAdminDELETE(() => `/services/${deleteTarget}`);

  const handleOrderChange = useCallback((newItems: any[]) => {
    setOrderedItems(newItems);
  }, []);

  const handleSaveOrder = async () => {
    if (!orderedItems) return;
    const payload = orderedItems.map((item, idx) => ({ id: item.id, order_index: idx }));
    try {
      await adminAPI('/services/order', { method: 'PUT', body: JSON.stringify({ items: payload }) });
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
      mutate((current) => (current ? current.filter((s: any) => s.id !== targetId) : current), false);
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
                <div className="flex items-center gap-3">
                  {item.image_url && (
                    <Image src={item.image_url} alt="" width={40} height={40} className="rounded-lg object-cover" unoptimized />
                  )}
                  <span className="font-medium">{item.title_fr}</span>
                </div>
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
        <DialogContent className="bg-white max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? t('edit') : t('create')}</DialogTitle></DialogHeader>
          <ServiceForm
            initial={editing}
            mutate={mutate}
            onClose={() => setShowForm(false)}
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

function ServiceForm({ initial, mutate, onClose }: any) {
  const t = useTranslations('admin.services');
  const schema = serviceSchema(t);
  const { register, handleSubmit, formState: { errors, isValid }, getValues, setValue, watch } = useForm<ServiceFormData>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          title_fr: initial.title_fr || '',
          title_ar: initial.title_ar || '',
          description_fr: initial.description_fr || '',
          description_ar: initial.description_ar || '',
        }
      : {
          title_fr: '', title_ar: '', description_fr: '', description_ar: '', 
        },
    mode: 'onChange',
  });

  const { trigger: create, loading: creating } = useAdminPOST('/services', { showToast: false });
  const { trigger: update, loading: updating } = useAdminPUT(() => `/services/${initial?.id}`, { showToast: false });
  const loading = creating || updating;
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initial?.image_url || null);
  const [uploading, setUploading] = useState(false);
  const [translating, setTranslating] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setPreviewUrl(null);
  };

  const handleTranslate = async () => {
    const values = getValues();
    const missing: { field: string; text: string; targetLang: 'fr' | 'ar'; sourceLang: 'fr' | 'ar' }[] = [];
    if (values.title_fr && !values.title_ar) missing.push({ field: 'title_ar', text: values.title_fr, targetLang: 'ar', sourceLang: 'fr' });
    if (values.title_ar && !values.title_fr) missing.push({ field: 'title_fr', text: values.title_ar, targetLang: 'fr', sourceLang: 'ar' });
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

  const handleSave = async (formData: ServiceFormData) => {
    let imageUrl = initial?.image_url || '';
    let imagePublicId = initial?.image_public_id || '';

    if (imageFile) {
      setUploading(true);
      try {
        toast.info(t('uploadingImage'));
        const result = await uploadToCloudinary(imageFile);
        imageUrl = result.url;
        imagePublicId = result.public_id;
      } catch {
        toast.error(t('uploadFailed'));
        setUploading(false);
        return;
      }
      setUploading(false);
    } else if (previewUrl === null && initial?.image_public_id) {
      imageUrl = '';
      imagePublicId = '';
    }

    const payload = {
      ...formData,
      image_url: imageUrl,
      image_public_id: imagePublicId,
    };

    try {
      if (initial) {
        const updated = await update(payload);
        toast.success(t('updated'));
        mutate((current: any[]) => (current ? current.map((s: any) => (s.id === updated.id ? updated : s)) : current), false);
      } else {
        const created = await create(payload);
        toast.success(t('created'));
        mutate((current: any[]) => [created, ...(current || [])], false);
      }
      onClose();
    } catch (err: any) {
      if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
      else toast.error(err.message || t('error'));
    }
  };

  const canTranslate =
    (watch('title_fr') && !watch('title_ar')) ||
    (watch('title_ar') && !watch('title_fr')) ||
    (watch('description_fr') && !watch('description_ar')) ||
    (watch('description_ar') && !watch('description_fr'));

  return (
    <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Input placeholder={t('titleFrPlaceholder')} {...register('title_fr')} className={errors.title_fr ? 'border-red-500' : ''} />
          {errors.title_fr && <p className="text-red-500 text-xs mt-1">{errors.title_fr.message}</p>}
        </div>
        <div>
          <Input placeholder={t('titleArPlaceholder')} {...register('title_ar')} className={errors.title_ar ? 'border-red-500' : ''} />
          {errors.title_ar && <p className="text-red-500 text-xs mt-1">{errors.title_ar.message}</p>}
        </div>
        <div>
          <Textarea placeholder={t('descriptionFrPlaceholder')} {...register('description_fr')} className={errors.description_fr ? 'border-red-500' : ''} />
          {errors.description_fr && <p className="text-red-500 text-xs mt-1">{errors.description_fr.message}</p>}
        </div>
        <div>
          <Textarea placeholder={t('descriptionArPlaceholder')} {...register('description_ar')} className={errors.description_ar ? 'border-red-500' : ''} />
          {errors.description_ar && <p className="text-red-500 text-xs mt-1">{errors.description_ar.message}</p>}
        </div>
       
       
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t('image')}</label>
        {previewUrl ? (
          <div className="flex items-center gap-3">
            <Image src={previewUrl} alt="Preview" width={80} height={80} className="rounded-xl object-cover" unoptimized />
            <Button type="button" variant="outline" size="sm" onClick={removeImage}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <label className="cursor-pointer inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <ImageIcon className="w-4 h-4" /> {t('chooseImage')}
            <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </label>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        {canTranslate && (
          <Button type="button" variant="outline" onClick={handleTranslate} disabled={translating}>
            {translating ? t('translating') : t('translate')}
          </Button>
        )}
        <Button type="submit" disabled={!isValid || loading || uploading}>
          {loading || uploading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('saving')}
            </span>
          ) : (
            t('save')
          )}
        </Button>
      </div>
    </form>
  );
}