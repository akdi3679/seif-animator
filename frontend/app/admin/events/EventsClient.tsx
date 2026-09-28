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
import { Pencil, Trash2, Plus } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { translateBatch } from '@/lib/utils/translate';
import { RateLimitError } from '@/lib/api/types';
import { uploadToCloudinary } from '@/lib/cloudinary-upload';
import Image from 'next/image';
import { ImageIcon, X , Loader2  } from 'lucide-react';

// ── Zod schema for event ──
const eventSchema = (t: any) =>
  z.object({
    titleFr: z.string().min(1, t('validation.titleFrRequired')),
    titleAr: z.string().min(1, t('validation.titleArRequired')),
    descriptionFr: z.string().min(1, t('validation.descriptionFrRequired')),
    descriptionAr: z.string().min(1, t('validation.descriptionArRequired')),
    date: z.string().min(1, t('validation.dateRequired')),
    endDate: z.string().min(1, t('validation.endDateRequired')),
    location: z.string().min(1, t('validation.locationRequired')),
    auto_display: z.boolean().optional(),
  });

type EventFormData = z.infer<ReturnType<typeof eventSchema>>;

export default function EventsClient() {
  const t = useTranslations('admin.events');
  const { data, mutate, isValidating, error, retry, isRetrying } = useAdminGETSWR<any[]>('/events');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
const [uploading, setUploading] = useState(false);
  const { trigger: remove } = useAdminDELETE(() => `/events/${deleteTarget}`);

  const handleDelete = async (deleteCode: string) => {
    if (!deleteTarget) return;
    const targetId = deleteTarget;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await remove({ deleteCode });
      mutate((current) => (current ? current.filter((e: any) => e.id !== targetId) : current), false);
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

      {data && data.length === 0 ? (
        <p className="text-center text-gray-500 py-10">{t('empty')}</p>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('title')}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('date')}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('location')}</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('image')}</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((event: any) => (
                <tr key={event.id} className="border-t">
                  <td className="px-4 py-3">{event.titleFr}</td>
                  <td className="px-4 py-3">{new Date(event.date).toLocaleDateString('fr-FR')}</td>
                  <td className="px-4 py-3">{event.location}</td>
                  <td className="px-4 py-3">
                    {event.imageUrl ? (
                      <Image src={event.imageUrl} alt="" width={40} height={40} className="rounded object-cover" unoptimized />
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setEditing(event); setShowForm(true); }}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleteTarget(event.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-white max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? t('edit') : t('create')}</DialogTitle></DialogHeader>
          <EventForm
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

function EventForm({ initial, mutate, onClose }: any) {
  const t = useTranslations('admin.events');
  const schema = eventSchema(t);
  const { register, handleSubmit, formState: { errors, isValid }, getValues, setValue, watch, control } = useForm<EventFormData>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          titleFr: initial.titleFr || '',
          titleAr: initial.titleAr || '',
          descriptionFr: initial.descriptionFr || '',
          descriptionAr: initial.descriptionAr || '',
          date: initial.date ? new Date(initial.date).toISOString().slice(0, 16) : '',
          endDate: initial.endDate ? new Date(initial.endDate).toISOString().slice(0, 16) : '',
          location: initial.location || '',
          auto_display: initial.auto_display ?? true,
        }
      : {
          titleFr: '', titleAr: '', descriptionFr: '', descriptionAr: '', date: '', endDate: '', location: '', auto_display: true,
        },
    mode: 'onChange',
  });

  const { trigger: create, loading: creating } = useAdminPOST('/events', { showToast: false });
  const { trigger: update, loading: updating } = useAdminPUT(() => `/events/${initial?.id}`, { showToast: false });
  const loading = creating || updating;
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initial?.imageUrl || null);
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
    if (values.titleFr && !values.titleAr) missing.push({ field: 'titleAr', text: values.titleFr, targetLang: 'ar', sourceLang: 'fr' });
    if (values.titleAr && !values.titleFr) missing.push({ field: 'titleFr', text: values.titleAr, targetLang: 'fr', sourceLang: 'ar' });
    if (values.descriptionFr && !values.descriptionAr) missing.push({ field: 'descriptionAr', text: values.descriptionFr, targetLang: 'ar', sourceLang: 'fr' });
    if (values.descriptionAr && !values.descriptionFr) missing.push({ field: 'descriptionFr', text: values.descriptionAr, targetLang: 'fr', sourceLang: 'ar' });
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

  const handleSave = async (formData: EventFormData) => {
    let imageUrl = initial?.imageUrl || '';
    let imagePublicId = initial?.imagePublicId || null;

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
} else if (previewUrl === null && initial?.imagePublicId) {
  imageUrl = '';
  imagePublicId = null;
}

    const payload = {
      ...formData,
      imageUrl,
      imagePublicId,
    };

    try {
      if (initial) {
        const updated = await update(payload);
        toast.success(t('updated'));
        mutate((current: any[]) => (current ? current.map((e: any) => (e.id === updated.id ? updated : e)) : current), false);
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
    (watch('titleFr') && !watch('titleAr')) ||
    (watch('titleAr') && !watch('titleFr')) ||
    (watch('descriptionFr') && !watch('descriptionAr')) ||
    (watch('descriptionAr') && !watch('descriptionFr'));

  return (
    <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Input placeholder={t('titleFrPlaceholder')} {...register('titleFr')} className={errors.titleFr ? 'border-red-500' : ''} />
          {errors.titleFr && <p className="text-red-500 text-xs mt-1">{errors.titleFr.message}</p>}
        </div>
        <div>
          <Input placeholder={t('titleArPlaceholder')} {...register('titleAr')} className={errors.titleAr ? 'border-red-500' : ''} />
          {errors.titleAr && <p className="text-red-500 text-xs mt-1">{errors.titleAr.message}</p>}
        </div>
        <div>
          <Textarea placeholder={t('descriptionFrPlaceholder')} {...register('descriptionFr')} className={errors.descriptionFr ? 'border-red-500' : ''} />
          {errors.descriptionFr && <p className="text-red-500 text-xs mt-1">{errors.descriptionFr.message}</p>}
        </div>
        <div>
          <Textarea placeholder={t('descriptionArPlaceholder')} {...register('descriptionAr')} className={errors.descriptionAr ? 'border-red-500' : ''} />
          {errors.descriptionAr && <p className="text-red-500 text-xs mt-1">{errors.descriptionAr.message}</p>}
        </div>
        <div>
          <label className="text-xs text-gray-500">{t('date')}</label>
          <Input type="datetime-local" {...register('date')} className={errors.date ? 'border-red-500' : ''} />
          {errors.date && <p className="text-red-500 text-xs mt-1">{errors.date.message}</p>}
        </div>
        <div>
          <label className="text-xs text-gray-500">{t('endDate')}</label>
          <Input type="datetime-local" {...register('endDate')} className={errors.endDate ? 'border-red-500' : ''} />
          {errors.endDate && <p className="text-red-500 text-xs mt-1">{errors.endDate.message}</p>}
        </div>
        <div>
          <Input placeholder={t('location')} {...register('location')} className={errors.location ? 'border-red-500' : ''} />
          {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location.message}</p>}
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

      <div className="flex items-center gap-2">
        <input type="checkbox" id="auto_display" {...register('auto_display')} />
        <label htmlFor="auto_display" className="text-sm">{t('autoDisplay')}</label>
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