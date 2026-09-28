'use client';
import { useState, useCallback, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAdminGETSWR, useAdminPOST, useAdminPUT, useAdminDELETE } from '@/lib/api/hooks';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';
import { toast } from 'sonner';
import { Pencil, Trash2, Plus, Save, ChevronRight, ChevronDown, GripVertical, ImageIcon, X, Loader2 } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { translateBatch } from '@/lib/utils/translate';
import { uploadToCloudinary } from '@/lib/cloudinary-upload';
import { RateLimitError } from '@/lib/api/types';
import { adminAPI } from '@/lib/api/client';
import Image from 'next/image';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const STANDARD_SLUGS = ['all', 'latest'];
const isStandard = (cat: any) => STANDARD_SLUGS.includes(cat.slug);

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

function CategoryTreeNode({ category, allCategories, onEdit, onDelete, depth = 0 }: any) {
  const t = useTranslations('admin.galleryCategories');
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const children = allCategories.filter((c: any) => c.parent_id === category.id);
  const hasChildren = children.length > 0;

  return (
    <div className="select-none">
      <div className={`flex items-center justify-between p-3 rounded-xl transition-all mb-1 ${isStandard(category) ? 'bg-primary/10 border border-primary/30' : 'bg-white border border-gray-100 hover:bg-gray-50'} ${depth > 0 ? 'ml-6' : ''}`}>
        <div className="flex items-center gap-3">
          {hasChildren ? (
            <button onClick={() => setExpanded(!expanded)} className="p-1 hover:bg-gray-200 rounded-full">
              {expanded ? <ChevronDown className="w-4 h-4 text-gray-600" /> : <ChevronRight className="w-4 h-4 text-gray-600" />}
            </button>
          ) : <span className="w-6" />}
          {category.image_url ? <Image src={category.image_url} alt="" width={32} height={32} className="rounded-lg object-cover" unoptimized /> : null}
          <span className="font-medium text-sm">{locale === 'fr' ? category.name_fr : category.name_ar}</span>
          {isStandard(category) && <span className="text-xs bg-primary/20 text-primary font-bold px-2 py-0.5 rounded-full">{t('standard')}</span>}
          <span className="text-xs text-gray-400 ml-2">({category.item_count} {t('items')})</span>
          {hasChildren && <span className="text-xs text-gray-400">({children.length} sous‑cat.)</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(category)}><Pencil className="w-4 h-4" /></Button>
          {!isStandard(category) && (
            <Button variant="outline" size="sm" onClick={() => onDelete(category.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
          )}
        </div>
      </div>
      <div className={`overflow-hidden transition-all duration-300 ${expanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
        {children.map((child: any) => (
          <CategoryTreeNode key={child.id} category={child} allCategories={allCategories} onEdit={onEdit} onDelete={onDelete} depth={depth + 1} />
        ))}
      </div>
    </div>
  );
}

export default function GalleryCategoriesTab() {
  const t = useTranslations('admin.galleryCategories');
  const { data, mutate, isValidating, error, retry, isRetrying } = useAdminGETSWR<any[]>('/gallery/categories');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { trigger: deleteCategory, loading: deleteLoading, error: deleteApiError } = useAdminDELETE(() => `/gallery/categories/${deleteTarget}`);

  const topLevelCategories = useMemo(() => {
    if (!data) return [];
    return data.filter(c => !c.parent_id).sort((a, b) => a.order_index - b.order_index);
  }, [data]);

  const standardTopCategories = topLevelCategories.filter(c => STANDARD_SLUGS.includes(c.slug));
  const manualTopCategories = topLevelCategories.filter(c => !STANDARD_SLUGS.includes(c.slug));

  const [orderedTopIds, setOrderedTopIds] = useState<string[] | null>(null);

  const orderChanged = useMemo(() => {
    if (!orderedTopIds) return false;
    return orderedTopIds.join(',') !== manualTopCategories.map(c => c.id).join(',');
  }, [orderedTopIds, manualTopCategories]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = manualTopCategories.findIndex(c => c.id === active.id);
    const newIndex = manualTopCategories.findIndex(c => c.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      setOrderedTopIds(arrayMove(manualTopCategories, oldIndex, newIndex).map(c => c.id));
    }
  }, [manualTopCategories]);

  const handleSaveOrder = async () => {
    if (!orderedTopIds) return;
    const payload = orderedTopIds.map((id, idx) => ({ id, order_index: idx }));
    try {
      await adminAPI('/gallery/categories/order', { method: 'PUT', body: JSON.stringify({ items: payload }) });
      const standardTop = data?.filter(c => STANDARD_SLUGS.includes(c.slug) && !c.parent_id) ?? [];
      const reorderedManual = orderedTopIds.map((id, idx) => {
        const cat = data!.find(c => c.id === id);
        return { ...cat, order_index: idx };
      });
      const subCategories = data?.filter(c => c.parent_id) ?? [];
      mutate([...standardTop, ...reorderedManual, ...subCategories], false);
      toast.success(t('orderSaved'));
    } catch (err: any) {
      if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
      else toast.error(err.message || t('error'));
    }
  };

  const handleDelete = async (deleteCode: string) => {
    if (!deleteTarget) return;
    try {
      await deleteCategory({ deleteCode });
      mutate((current) => current ? current.filter((c: any) => c.id !== deleteTarget) : current, false);
      toast.success(t('deleted'));
      setDeleteTarget(null);
    } catch { /* handled by deleteApiError */ }
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

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden p-3 space-y-1">
        {standardTopCategories.map(category => (
          <div key={category.id}>
            <CategoryTreeNode category={category} allCategories={data || []} onEdit={(cat) => { setEditing(cat); setShowForm(true); }} onDelete={(id) => setDeleteTarget(id)} depth={0} />
          </div>
        ))}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={manualTopCategories.map(c => c.id)} strategy={verticalListSortingStrategy}>
            {(orderedTopIds
              ? orderedTopIds.map(id => manualTopCategories.find(c => c.id === id)!).filter(Boolean)
              : manualTopCategories
            ).map(category => (
              <SortableItem key={category.id} id={category.id}>
                <div className="flex-1">
                  <CategoryTreeNode category={category} allCategories={data || []} onEdit={(cat) => { setEditing(cat); setShowForm(true); }} onDelete={(id) => setDeleteTarget(id)} depth={0} />
                </div>
              </SortableItem>
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {orderChanged && (
        <div className="flex justify-end">
          <Button onClick={handleSaveOrder}><Save className="w-4 h-4 mr-2" /> {t('saveOrder')}</Button>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader><DialogTitle>{editing ? t('edit') : t('create')}</DialogTitle></DialogHeader>
          <GalleryCategoryForm initial={editing} mutate={mutate} onClose={() => setShowForm(false)} allCategories={data || []} />
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

/* ── Gallery Category Form ─────────────────────────────────── */
function GalleryCategoryForm({ initial, mutate, onClose, allCategories }: any) {
  const t = useTranslations('admin.galleryCategories');
  const schema = z.object({
    name_fr: z.string().min(1, t('validation.nameFrRequired')),
    name_ar: z.string().min(1, t('validation.nameArRequired')),
    slug: z.string().optional().default(''),
    parent_id: z.string().uuid().nullable().optional(),
    description_fr: z.string().optional().default(''),
    description_ar: z.string().optional().default(''),
    image_url: z.string().url().optional().or(z.literal('')).default(''),
    is_active: z.boolean().optional().default(true),
  });

  const { register, handleSubmit, formState: { errors, isValid }, getValues, setValue, watch } = useForm({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? { ...initial, parent_id: initial.parent_id || null, is_active: initial.is_active ?? true, slug: initial.slug || '', image_url: initial.image_url || '' }
      : { name_fr: '', name_ar: '', parent_id: null, is_active: true, slug: '', image_url: '' },
    mode: 'onChange',
  });

  const { trigger: create, loading: creating } = useAdminPOST('/gallery/categories', { showToast: false });
  const { trigger: update, loading: updating } = useAdminPUT(() => `/gallery/categories/${initial?.id}`, { showToast: false });
  const loading = creating || updating;

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initial?.image_url || null);
  const [uploading, setUploading] = useState(false);
  const [translating, setTranslating] = useState(false);

  const isStandardCat = initial && STANDARD_SLUGS.includes(initial.slug);
  const parentOptions = allCategories.filter((c: any) => !STANDARD_SLUGS.includes(c.slug) && c.id !== initial?.id && (c.item_count ?? 0) === 0 && !c.parent_id);

  const handleImageChange = (e: any) => { const file = e.target.files?.[0]; if (file) { setImageFile(file); setPreviewUrl(URL.createObjectURL(file)); } };
  const removeImage = () => { setImageFile(null); setPreviewUrl(null); };

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
      group.forEach((b, idx) => setValue(b.field, translated[idx], { shouldValidate: true }));
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
    imagePublicId = null;
  }

  const payload = { ...formData, image_url: imageUrl, image_public_id: imagePublicId };

  try {
    if (initial) {
      payload.parent_id = initial.parent_id ?? null;
      const updated = await update(payload);
      mutate((current: any[]) => current ? current.map(c => c.id === updated.id ? updated : c) : current, false);
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
   const canTranslate =
    (watch('name_fr') && !watch('name_ar')) ||
    (watch('name_ar') && !watch('name_fr')) ||
    (watch('description_fr') && !watch('description_ar')) ||
    (watch('description_ar') && !watch('description_fr'));

  return (
    <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
      {/* Image */}
      {previewUrl ? (
        <div className="flex items-center gap-3">
          <Image src={previewUrl} alt="Preview" width={80} height={80} className="rounded-xl object-cover" unoptimized />
          <Button type="button" variant="outline" size="sm" onClick={removeImage}><X className="w-4 h-4" /></Button>
        </div>
      ) : (
        <label className="cursor-pointer inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ImageIcon className="w-4 h-4" /> {t('chooseImage')}
          <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
        </label>
      )}

      {/* Name fields */}
           <div>
        <label className="block text-sm font-medium mb-1">{t('nameFr')}</label>
        <Input
          placeholder={t('nameFrPlaceholder')}
          {...register('name_fr')}
          readOnly={isStandardCat}
          onFocus={e => { if (isStandardCat) e.target.blur(); }}
          className={`${errors.name_fr ? 'border-red-500' : ''} ${
            isStandardCat ? 'bg-gray-100 text-gray-400 cursor-not-allowed select-none' : ''
          }`}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">{t('nameAr')}</label>
        <Input
          placeholder={t('nameArPlaceholder')}
          {...register('name_ar')}
          readOnly={isStandardCat}
          onFocus={e => { if (isStandardCat) e.target.blur(); }}
          className={`${errors.name_ar ? 'border-red-500' : ''} ${
            isStandardCat ? 'bg-gray-100 text-gray-400 cursor-not-allowed select-none' : ''
          }`}
        />
      </div>

      {/* Description fields */}
      <div>
        <label className="block text-sm font-medium mb-1">{t('descriptionFr')}</label>
        <Textarea
          placeholder={t('descriptionFrPlaceholder')}
          {...register('description_fr')}
          readOnly={isStandardCat}
          className={isStandardCat ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">{t('descriptionAr')}</label>
        <Textarea
          placeholder={t('descriptionArPlaceholder')}
          {...register('description_ar')}
          readOnly={isStandardCat}
          className={isStandardCat ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}
        />
      </div>

      {/* Parent picker (only on creation) */}
      {!initial && (
        <div>
          <label className="text-sm font-medium mb-2 block">{t('parentCategory')}</label>
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            <button type="button" onClick={() => setValue('parent_id', null)} className={`p-2 rounded-xl border text-sm ${!watch('parent_id') ? 'border-primary bg-primary/10' : 'border-gray-200'}`}>{t('none')}</button>
            {parentOptions.map((c: any) => (
              <button key={c.id} type="button" onClick={() => setValue('parent_id', c.id)} className={`p-2 rounded-xl border text-sm flex items-center gap-2 ${watch('parent_id') === c.id ? 'border-primary bg-primary/10' : 'border-gray-200'}`}>
                {c.image_url ? <Image src={c.image_url} alt="" width={28} height={28} className="rounded object-cover" unoptimized /> : <div className="w-7 h-7 bg-gray-100 rounded" />}
                <span className="text-left">{c.name_fr}</span>
              </button>
            ))}
          </div>
        </div>
        
      )}
      {initial && initial.parent_id && (
        <p className="text-xs text-gray-500">{t('parentLocked')}: {allCategories.find((c: any) => c.id === initial.parent_id)?.name_fr}</p>
      )}

      {/* Active toggle */}
      <div className="flex items-center gap-4 flex-wrap">
       {(initial ? initial.slug !== 'all' : true) && (
  <label className="flex items-center gap-2 text-sm">
    <input type="checkbox" {...register('is_active')} />
    {t('active')}
  </label>
)}
      </div>

      {/* Buttons */}
      <div className="flex gap-2 justify-end">
        {canTranslate && (
          <Button type="button" variant="outline" onClick={handleTranslate} disabled={translating}>
            {translating ? t('translating') : t('translate')}
          </Button>
        )}
        <Button type="submit" disabled={!isValid || loading || uploading}>
          {loading || uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
          {t('save')}
        </Button>
      </div>
    </form>
  );
}