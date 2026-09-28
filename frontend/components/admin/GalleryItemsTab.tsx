'use client';
import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
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
import { Pencil, Trash2, Plus, Loader2, X, Eye, RotateCcw, Play , ImageIcon} from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { GenericTrashDialog } from '@/components/admin/GenericTrashDialog';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { translateBatch } from '@/lib/utils/translate';
import { uploadToCloudinary } from '@/lib/cloudinary-upload';
import { adminAPI } from '@/lib/api/client';

const ALL_VALUE = '__all__';
const LIMIT = 20;
const STANDARD_SLUGS = ['all', 'latest'];
function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.substring(0, idx)}
      <mark className="bg-yellow-200">{text.substring(idx, idx + term.length)}</mark>
      {text.substring(idx + term.length)}
    </>
  );
}
function getMediaTypeFromFile(file: File): 'image' | 'gif' | 'video' {
  if (file.type === 'image/gif') return 'gif';
  if (file.type.startsWith('video/')) return 'video';
  return 'image';
}
function collectChildCategoryIds(parentId: string, categories: any[]): string[] {
  const ids = [parentId];
  const children = categories.filter((c: any) => c.parent_id === parentId);
  for (const child of children) {
    ids.push(...collectChildCategoryIds(child.id, categories));
  }
  return ids;
}
export default function GalleryItemsTab() {
  const t = useTranslations('admin.galleryItems');
  const [localSearch, setLocalSearch] = useState('');
  const [localCategory, setLocalCategory] = useState(ALL_VALUE);
  const [localMediaType, setLocalMediaType] = useState(ALL_VALUE);
  const [serverSearch, setServerSearch] = useState('');
  const [serverCategory, setServerCategory] = useState(ALL_VALUE);
  const [serverMediaType, setServerMediaType] = useState(ALL_VALUE);
  const [page, setPage] = useState(0);
const [viewItem, setViewItem] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
// Shared detail cache (list + trash)
const [detailCache, setDetailCache] = useState<Map<string, any>>(new Map());
const [filePreviews, setFilePreviews] = useState<Map<number, string>>(new Map());
// Edit state
const [editingItemId, setEditingItemId] = useState<string | null>(null);
const [editingItemFull, setEditingItemFull] = useState<any>(null);
const [loadingEdit, setLoadingEdit] = useState(false);
  const { data: categories } = useAdminGETSWR<any[]>('/gallery/categories');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (serverSearch) params.set('search', serverSearch);
    if (serverCategory !== ALL_VALUE) params.set('category', serverCategory);
    if (serverMediaType !== ALL_VALUE) params.set('media_type', serverMediaType);
    params.set('limit', LIMIT.toString());
    params.set('offset', (page * LIMIT).toString());
    return params.toString();
  }, [serverSearch, serverCategory, serverMediaType, page]);

  const { data, error, mutate, isValidating, retry, isRetrying } = useAdminGETSWR<{ items: any[]; total: number }>(`/gallery/items?${queryString}`);

  const {
    trigger: deleteItem,
    loading: deleteLoading,
    error: deleteApiError,
  } = useAdminDELETE(() => `/gallery/items/${deleteTarget}`);
const handleEdit = (itemId: string) => {
  if (editingItemId === itemId) return;
  setEditingItemId(itemId);

  // Check cache
  if (detailCache.has(itemId)) {
    setEditingItemFull(detailCache.get(itemId));
    return;
  }

  // Fetch from server
  setLoadingEdit(true);
  adminAPI(`/gallery/items/${itemId}`)
    .then((full) => {
      setDetailCache(prev => new Map(prev).set(itemId, full));
      setEditingItemFull(full);
    })
    .catch(() => toast.error(t('errorLoadingItem')))
    .finally(() => setLoadingEdit(false));
};
  // Bulk form
  const bulkSchema = z.object({
    category_id: z.string().uuid(t('validation.categoryRequired')),
    items: z.array(z.object({
      file: z.any().refine(val => val instanceof File && val.size > 0, { message: 'File required' }),
      title_fr: z.string().min(1, t('validation.titleFrRequired')),
      title_ar: z.string().min(1, t('validation.titleArRequired')),
      description_fr: z.string().optional().default(''),
      description_ar: z.string().optional().default(''),
    })),
  });

  const {
    register,
    control,
    handleSubmit: handleBulkSubmit,
    formState: { errors: bulkErrors, isValid: bulkValid },
    watch,
    setValue,
  } = useForm({
    resolver: zodResolver(bulkSchema),
    defaultValues: {
      category_id: categories?.[0]?.id || '',
       items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchedItems = watch('items');

const canUpload =
  watchedItems &&
  watchedItems.some(
    (item: any) =>
      (item.title_fr || '').trim() && (item.title_ar || '').trim()
  );

 const handleBulkUpload = async (formData: any) => {
  setUploading(true);
  try {
    for (const item of formData.items) {
      const uploaded = await uploadToCloudinary(item.file);
      const media_type = getMediaTypeFromFile(item.file);
      await adminAPI('/gallery/items', {
        method: 'POST',
        body: JSON.stringify({
          category_id: formData.category_id,
          title_fr: item.title_fr,
          title_ar: item.title_ar,
          description_fr: item.description_fr,
          description_ar: item.description_ar,
          media_url: uploaded.url,
          image_public_id: uploaded.public_id,
          media_type,
          is_gif: media_type === 'gif',
        }),
      });
    }
    toast.success(t('bulkUploadSuccess'));
    mutate();
    setShowBulkForm(false);
  } catch (err: any) {
    if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
    else toast.error(err.message || t('error'));
  } finally {
    setUploading(false);
  }
};

  // Edit form
  const editSchema = z.object({
    category_id: z.string().uuid(t('validation.categoryRequired')),
    title_fr: z.string().min(1, t('validation.titleFrRequired')),
    title_ar: z.string().min(1, t('validation.titleArRequired')),
    description_fr: z.string().optional().default(''),
    description_ar: z.string().optional().default(''),
    media_url: z.string().url().min(1, 'Media required'),
    image_public_id: z.string().optional().nullable(),
    media_type: z.enum(['image', 'gif', 'video']),
    is_gif: z.boolean().optional(),
    is_active: z.boolean().optional().default(true),
  });


  const editForm = useForm({
  resolver: zodResolver(editSchema),
  defaultValues: editingItemFull ? {
    category_id: editingItemFull.category_id || '',
    title_fr: editingItemFull.title_fr || '',
    title_ar: editingItemFull.title_ar || '',
    description_fr: editingItemFull.description_fr || '',
    description_ar: editingItemFull.description_ar || '',
    media_url: editingItemFull.media_url || '',
    image_public_id: editingItemFull.image_public_id || null,
    media_type: editingItemFull.media_type || 'image',
    is_gif: editingItemFull.is_gif || false,
    is_active: editingItemFull.is_active ?? true,
  } : {},
  mode: 'onChange',
});
  useEffect(() => {
  if (editingItemFull) {
    editForm.reset({
      category_id: editingItemFull.category_id || '',
      title_fr: editingItemFull.title_fr || '',
      title_ar: editingItemFull.title_ar || '',
      description_fr: editingItemFull.description_fr || '',
      description_ar: editingItemFull.description_ar || '',
      media_url: editingItemFull.media_url || '',
      image_public_id: editingItemFull.image_public_id || null,
      media_type: editingItemFull.media_type || 'image',
      is_gif: editingItemFull.is_gif || false,
      is_active: editingItemFull.is_active ?? true,
    });
  }
}, [editingItemFull, editForm]);
  useEffect(() => {
  if (!showBulkForm) {
    setFilePreviews(new Map());
    setSelectedItemIndex(0);
    setMultiSelectMode(false);
    setSelectedIndices(new Set());
  }
}, [showBulkForm]);
const { register: editRegister, handleSubmit: handleEditSubmit, formState: { errors: editErrors, isValid: editValid }, setValue: setEditValue, watch: editWatch } = editForm;
const { trigger: updateItem, loading: updatingItem } = useAdminPUT(() => `/gallery/items/${editingItemId}`, { showToast: false });
  const onEditSave = async (formData: any) => {
  try {
    const updated = await updateItem(formData);
    // Update list cache
    mutate((current) => {
  if (!current) return current;
  return {
    ...current,
    items: current.items.map((i: any) =>
      i.id === updated.id
        ? { ...updated, GalleryCategory: editingItemFull?.GalleryCategory || i.GalleryCategory }
        : i
    ),
  };
}, false);
    // Update detail cache
    setDetailCache(prev => new Map(prev).set(updated.id, updated));
    toast.success(t('itemUpdated'));
    setEditingItemId(null);
  } catch (err: any) {
    if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
    else toast.error(err.message || t('error'));
  }
};

  // Delete (soft)
  const handleDelete = async (deleteCode: string) => {
    if (!deleteTarget) return;
    try {
      await deleteItem({ deleteCode });
      mutate((current) => {
        if (!current) return current;
        return { ...current, items: current.items.filter((i: any) => i.id !== deleteTarget), total: current.total - 1 };
      }, false);
      toast.success(t('deleted'));
      setDeleteTarget(null);
    } catch {}
  };

  // Filters apply
  const applyAllFilters = () => {
    setServerSearch(localSearch);
    setServerCategory(localCategory);
    setServerMediaType(localMediaType);
    setPage(0);
  };

  const clearAllFilters = () => {
    setLocalSearch('');
    setServerSearch('');
    setLocalCategory(ALL_VALUE);
    setServerCategory(ALL_VALUE);
    setLocalMediaType(ALL_VALUE);
    setServerMediaType(ALL_VALUE);
    setPage(0);
  };

  const items = data?.items || [];
  const filteredItems = useMemo(() => {
  let result = items;

  if (localSearch.trim()) {
    const term = localSearch.toLowerCase();
    result = result.filter((item: any) =>
      (item.title_fr || '').toLowerCase().includes(term) ||
      (item.title_ar || '').includes(term) ||
      (item.description_fr || '').toLowerCase().includes(term) ||
      (item.description_ar || '').includes(term)
    );
  }

 if (localCategory !== ALL_VALUE) {
  const ids = collectChildCategoryIds(localCategory, categories || []);
  result = result.filter(item => ids.includes(item.category_id));
}

  if (localMediaType !== ALL_VALUE) {
    result = result.filter(item => item.media_type === localMediaType);
  }

  return result;
}, [items, localSearch, localCategory, localMediaType]);
 const categoriesInItems = useMemo(() => {
  const usedIds = new Set<string>();
  items.forEach((item: any) => {
    usedIds.add(item.category_id);
  });
  // Also include parent categories of used subcategories
  categories?.forEach((c: any) => {
    if (c.parent_id && usedIds.has(c.id)) {
      usedIds.add(c.parent_id);
    }
  });
  return categories?.filter((c: any) => usedIds.has(c.id)) ?? [];
}, [items, categories]);
  const totalPages = Math.ceil((data?.total || 0) / LIMIT);

  if (error) return <RetryableError error={error} onRetry={retry} isRetrying={isRetrying} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('title')}</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTrashOpen(true)}>
            <Trash2 className="w-4 h-4 mr-2" /> {t('trash')}
          </Button>
          <Button onClick={() => setShowBulkForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> {t('addMultiple')}
          </Button>
          <RefreshButton onRefresh={() => mutate()} loading={isValidating} />
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-4 items-end bg-white p-4 rounded-2xl border">
        <div>
  <label className="text-sm font-medium">{t('category')}</label>
  <select
    value={localCategory}
    onChange={e => setLocalCategory(e.target.value)}
    className="w-48 border rounded px-2 py-1 text-sm"
  >
    <option value="__all__">{t('all')}</option>
    {categoriesInItems
      .filter((c: any) => !c.parent_id)   // top‑level only
      .flatMap((parent: any) => {
        const children = categoriesInItems.filter((sub: any) => sub.parent_id === parent.id);
        // Parent always selectable
        const options = [
          <option key={parent.id} value={parent.id}>
            {parent.name_fr}
          </option>
        ];
        // Indented children
        children.forEach((sub: any) => {
          options.push(
            <option key={sub.id} value={sub.id}>
              {'\u00A0\u00A0\u00A0'}{sub.name_fr}
            </option>
          );
        });
        return options;
      })}
  </select>
</div>
        <div>
          <label className="text-sm font-medium">{t('mediaType')}</label>
          <select value={localMediaType} onChange={e => setLocalMediaType(e.target.value)} className="w-32 border rounded px-2 py-1 text-sm">
            <option value="__all__">{t('all')}</option>
            <option value="image">{t('image')}</option>
            <option value="gif">{t('gif')}</option>
            <option value="video">{t('video')}</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-sm font-medium">{t('search')}</label>
            <Input placeholder={t('searchPlaceholder')} value={localSearch} onChange={e => setLocalSearch(e.target.value)} className="w-48" />
          </div>
          <Button onClick={applyAllFilters} size="sm">{t('apply')}</Button>
        </div>
        <Button variant="outline" onClick={clearAllFilters} size="sm">{t('reset')}</Button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border shadow-sm">
        {!data && isValidating ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filteredItems.length === 0 ? (
          <p className="text-center text-gray-500 py-10">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('media')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('title')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('category')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('type')}</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item: any) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-4 py-3 cursor-pointer" onClick={() => setPreviewItem(item)}>
                      {item.media_type === 'video' ? (
                        <div className="relative w-16 h-16 rounded bg-black">
                          <video src={item.media_url} className="w-full h-full object-cover rounded" muted />
                          <Play className="absolute inset-0 m-auto w-5 h-5 text-white fill-white" />
                        </div>
                      ) : (
                        <img src={item.media_url} alt="" className="w-16 h-16 rounded object-cover" />
                      )}
                    </td>
                     <td className="px-4 py-3 font-medium">
    <Highlight text={item.title_fr} term={localSearch} />
  </td>
  <td className="px-4 py-3">
    {item.GalleryCategory?.name_fr || '—'}
  </td>
                    <td className="px-4 py-3 uppercase text-xs">{item.media_type}</td>
                    <td className="px-4 py-3 flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(item.id)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDeleteTarget(item.id)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.total > 0 && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">{t('showing', { from: page * LIMIT + 1, to: Math.min((page + 1) * LIMIT, data.total), total: data.total })}</span>
          <div className="flex items-center gap-2">
            <Button disabled={page === 0} onClick={() => setPage(p => p - 1)} variant="outline" size="sm">{t('previous')}</Button>
            <span className="text-sm font-medium">{t('page')} {page + 1} / {totalPages}</span>
            <Button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} variant="outline" size="sm">{t('next')}</Button>
          </div>
        </div>
      )}

      {/* Preview lightbox */}
      {previewItem && (
        <Dialog open onOpenChange={() => setPreviewItem(null)}>
          <DialogContent className="max-w-4xl p-0 bg-black/90 border-0 rounded-3xl overflow-hidden">
            <button onClick={() => setPreviewItem(null)} className="absolute top-4 right-4 z-20 w-8 h-8 bg-white/10 backdrop-blur rounded-full flex items-center justify-center text-white hover:bg-white/20 transition">
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center justify-center min-h-[70vh]">
              {previewItem.media_type === 'video' ? (
                <video src={previewItem.media_url} controls autoPlay className="max-h-[80vh] max-w-full object-contain" />
              ) : (
                <img src={previewItem.media_url} alt={previewItem.title_fr} className="max-h-[80vh] max-w-full object-contain" />
              )}
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
              <p className="text-white font-semibold">{previewItem.title_fr}</p>
              <p className="text-white/60 text-sm">{previewItem.GalleryCategory?.name_fr}</p>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit dialog */}
      {editingItemId && (
  <Dialog open onOpenChange={() => { setEditingItemId(null); setEditingItemFull(null); }}>
    <DialogContent className="bg-white max-w-lg">
      <DialogHeader><DialogTitle>{t('editItem')}</DialogTitle></DialogHeader>
      {loadingEdit || !editingItemFull ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <form onSubmit={handleEditSubmit(onEditSave)} className="space-y-4">
          {/* Media preview */}
          <div className="w-full h-40 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center">
            {editingItemFull.media_type === 'video' ? (
              <video src={editingItemFull.media_url} className="max-h-full object-contain" controls />
            ) : (
              <img src={editingItemFull.media_url} alt="" className="max-h-full object-contain" />
            )}
          </div>

          {/* Category */}
          <div>
            <label className="text-sm font-medium">{t('category')}</label>
<select {...editRegister('category_id')} className="w-full border rounded px-3 py-2 text-sm">
              <option value="">{t('selectCategory')}</option>
              {categories
  ?.filter((c: any) => !STANDARD_SLUGS.includes(c.slug) && c.slug !== 'all' && c.slug !== 'latest')
  .filter((c: any) => !c.parent_id)
                  .map((parent: any) => {
                  const children = categories.filter((sub: any) => sub.parent_id === parent.id);
                  if (children.length > 0) {
                    return (
                      <optgroup key={parent.id} label={parent.name_fr}>
                        {children.map((sub: any) => (
                          <option key={sub.id} value={sub.id}>
                            {'\u00A0\u00A0\u00A0'}{sub.name_fr}
                          </option>
                        ))}
                      </optgroup>
                    );
                  } else {
                    return (
                      <option key={parent.id} value={parent.id}>
                        {parent.name_fr}
                      </option>
                    );
                  }
                })}
            </select>
          </div>

          <Input {...editRegister('title_fr')} placeholder={t('titleFrPlaceholder')} />
          <Input {...editRegister('title_ar')} placeholder={t('titleArPlaceholder')} />
          <Textarea {...editRegister('description_fr')} placeholder={t('descriptionFrPlaceholder')} />
          <Textarea {...editRegister('description_ar')} placeholder={t('descriptionArPlaceholder')} />
          <Input {...editRegister('media_url')} placeholder="URL" disabled />

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...editRegister('is_active')} />
              {t('active')}
            </label>
          </div>

                   <div className="flex items-center justify-between">
            {(editWatch('title_fr') && !editWatch('title_ar')) ||
             (editWatch('title_ar') && !editWatch('title_fr')) ||
             (editWatch('description_fr') && !editWatch('description_ar')) ||
             (editWatch('description_ar') && !editWatch('description_fr')) ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  const values = editForm.getValues();
                  const missing: any[] = [];
                  if (values.title_fr && !values.title_ar) missing.push({ field: 'title_ar', text: values.title_fr, targetLang: 'ar', sourceLang: 'fr' });
                  if (values.title_ar && !values.title_fr) missing.push({ field: 'title_fr', text: values.title_ar, targetLang: 'fr', sourceLang: 'ar' });
                  if (values.description_fr && !values.description_ar) missing.push({ field: 'description_ar', text: values.description_fr, targetLang: 'ar', sourceLang: 'fr' });
                  if (values.description_ar && !values.description_fr) missing.push({ field: 'description_fr', text: values.description_ar, targetLang: 'fr', sourceLang: 'ar' });
                  if (missing.length === 0) return;
                  try {
                    const groups: Record<string, any[]> = {};
                    missing.forEach(b => { if (!groups[b.sourceLang]) groups[b.sourceLang] = []; groups[b.sourceLang].push(b); });
                    for (const group of Object.values(groups)) {
                      const texts = group.map(b => b.text);
                      const translated = await translateBatch(texts, group[0].targetLang, group[0].sourceLang);
                      group.forEach((b, idx) => editForm.setValue(b.field as any, translated[idx], { shouldValidate: true }));
                    }
                  } catch { toast.error(t('translationFailed')); }
                }}
              >
                {t('translate')}
              </Button>
            ) : (
              <div />
            )}
            <Button type="submit" disabled={updatingItem}>
              {updatingItem ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {t('save')}
            </Button>
          </div>
        </form>
      )}
    </DialogContent>
  </Dialog>
)}

      {/* Bulk add dialog */}
      <Dialog open={showBulkForm} onOpenChange={setShowBulkForm}>
        <DialogContent className="bg-white max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('addMultiple')}</DialogTitle></DialogHeader>
       <form onSubmit={handleBulkSubmit(handleBulkUpload)} className="space-y-5">
  {/* Category */}
  <div>
    <label className="text-sm font-medium">{t('category')}</label>
    <select {...register('category_id')} className="w-full border rounded px-3 py-2 text-sm">
      <option value="">{t('selectCategory')}</option>
      {categories
        ?.filter((c: any) => !STANDARD_SLUGS.includes(c.slug) && c.slug !== 'all' && c.slug !== 'latest')
        .filter((c: any) => !c.parent_id)
        .map((parent: any) => {
          const children = categories.filter((sub: any) => sub.parent_id === parent.id);
          if (children.length > 0) {
            return (
              <optgroup key={parent.id} label={parent.name_fr}>
                {children.map((sub: any) => (
                  <option key={sub.id} value={sub.id}>
                    {'\u00A0\u00A0\u00A0'}{sub.name_fr}
                  </option>
                ))}
              </optgroup>
            );
          } else {
            return (
              <option key={parent.id} value={parent.id}>
                {parent.name_fr}
              </option>
            );
          }
        })}
    </select>
  </div>

  {/* Images section */}
  <div>
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-medium">{t('images')}</span>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={multiSelectMode}
            onChange={(e) => {
              setMultiSelectMode(e.target.checked);
              setSelectedIndices(new Set());
            }}
          />
          {t('multiSelect')}
        </label>
        <label className="cursor-pointer inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <Plus className="w-4 h-4" />
          {t('addImages')}
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              files.forEach((file) => {
                const idx = fields.length;
                setFilePreviews(prev => new Map(prev).set(idx, URL.createObjectURL(file)));
                append({ file, title_fr: '', title_ar: '', description_fr: '', description_ar: '' });
              });
            }}
          />
        </label>
      </div>
    </div>

    {/* Thumbnails */}
    {fields.length > 0 && (
      <div className="flex gap-2 overflow-x-auto pb-2">
        {fields.map((field, idx) => (
          <div
            key={field.id}
            className={`relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer ring-2 ring-offset-1 ${
              multiSelectMode
                ? selectedIndices.has(idx) ? 'ring-primary' : 'ring-transparent'
                : idx === selectedItemIndex ? 'ring-primary' : 'ring-transparent'
            }`}
            onClick={() => {
              if (multiSelectMode) {
                setSelectedIndices(prev => {
                  const next = new Set(prev);
                  if (next.has(idx)) next.delete(idx);
                  else next.add(idx);
                  return next;
                });
              } else {
                setSelectedItemIndex(idx);
              }
            }}
          >
            {filePreviews.has(idx) ? (
              <img src={filePreviews.get(idx)} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-gray-300" />
              </div>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(idx);
                // Clean up the object URL to avoid memory leaks
                setFilePreviews(prev => {
                  const next = new Map(prev);
                  next.delete(idx);
                  return next;
                });
                if (selectedItemIndex >= idx) setSelectedItemIndex(Math.max(0, selectedItemIndex - 1));
              }}
              className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    )}

    {fields.length === 0 && (
      <p className="text-sm text-gray-400 text-center py-4">{t('noImagesYet')}</p>
    )}
  </div>

  {/* Editing area */}
  {fields.length > 0 && selectedItemIndex < fields.length && (() => {
    const activeIndices = multiSelectMode && selectedIndices.size > 0
      ? Array.from(selectedIndices)
      : [selectedItemIndex];

    if (!activeIndices) return null;
    const firstIdx = activeIndices[0];

    return (
           <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {multiSelectMode && selectedIndices.size > 0
              ? t('selectedCount', { count: activeIndices.length })
              : t('item') + ' ' + (firstIdx + 1) + ' / ' + fields.length}
          </span>
          {(watch(`items.${firstIdx}.title_fr`) && !watch(`items.${firstIdx}.title_ar`)) ||
           (watch(`items.${firstIdx}.title_ar`) && !watch(`items.${firstIdx}.title_fr`)) ||
           (watch(`items.${firstIdx}.description_fr`) && !watch(`items.${firstIdx}.description_ar`)) ||
           (watch(`items.${firstIdx}.description_ar`) && !watch(`items.${firstIdx}.description_fr`)) ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                const item = watchedItems[firstIdx];
                const missing: any[] = [];
                if (item.title_fr && !item.title_ar) missing.push({ field: 'title_ar', text: item.title_fr, targetLang: 'ar', sourceLang: 'fr' });
                if (item.title_ar && !item.title_fr) missing.push({ field: 'title_fr', text: item.title_ar, targetLang: 'fr', sourceLang: 'ar' });
                if (item.description_fr && !item.description_ar) missing.push({ field: 'description_ar', text: item.description_fr, targetLang: 'ar', sourceLang: 'fr' });
                if (item.description_ar && !item.description_fr) missing.push({ field: 'description_fr', text: item.description_ar, targetLang: 'fr', sourceLang: 'ar' });
                if (missing.length === 0) return;
                try {
                  const groups: Record<string, any[]> = {};
                  missing.forEach(b => { if (!groups[b.sourceLang]) groups[b.sourceLang] = []; groups[b.sourceLang].push(b); });
                  for (const group of Object.values(groups)) {
                    const texts = group.map(b => b.text);
                    const translated = await translateBatch(texts, group[0].targetLang, group[0].sourceLang);
                    group.forEach((b, idx) => {
                      activeIndices.forEach(i => setValue(`items.${i}.${b.field}` as any, translated[idx], { shouldValidate: true }));
                    });
                  }
                } catch { toast.error(t('translationFailed')); }
              }}
            >
              {t('translate')}
            </Button>
          ) : null}
        </div>
        <Input
          placeholder={t('titleFrPlaceholder')}
          value={watch(`items.${firstIdx}.title_fr`)}
          onChange={(e) => activeIndices.forEach(i => setValue(`items.${i}.title_fr`, e.target.value))}
        />
        <Input
          placeholder={t('titleArPlaceholder')}
          value={watch(`items.${firstIdx}.title_ar`)}
          onChange={(e) => activeIndices.forEach(i => setValue(`items.${i}.title_ar`, e.target.value))}
        />
        <Textarea
          placeholder={t('descriptionFrPlaceholder')}
          value={watch(`items.${firstIdx}.description_fr`)}
          onChange={(e) => activeIndices.forEach(i => setValue(`items.${i}.description_fr`, e.target.value))}
        />
        <Textarea
          placeholder={t('descriptionArPlaceholder')}
          value={watch(`items.${firstIdx}.description_ar`)}
          onChange={(e) => activeIndices.forEach(i => setValue(`items.${i}.description_ar`, e.target.value))}
        />
      </div>
    );
  })()}

  {/* Upload button */}
  <div className="flex justify-end">
    
   <Button type="submit" disabled={!canUpload || uploading}>
  {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
  {t('uploadAll')}
</Button>
  </div>
</form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={handleDelete}
        error={deleteApiError?.message ?? null}
        loading={deleteLoading}
      />

      <GenericTrashDialog
        open={trashOpen}
        onOpenChange={setTrashOpen}
        endpoint="/gallery/items?deleted=true"
        restoreEndpoint={(id) => `/gallery/items/${id}/restore`}
        deleteEndpoint={(id) => `/gallery/items/${id}/permanent`}
        title={t('trashTitle')}
        onView={(item) => setViewItem(item)}
        columns={[
          { key: 'title_fr', label: t('title') },
          { key: 'GalleryCategory.name_fr', label: t('category') },
          { key: 'media_type', label: t('type') },
        ]}
        searchPlaceholder={t('searchPlaceholder')}
        emptyMessage={t('trashEmpty')}
        t={t}
        renderRow={(item, actions) => (
  <tr key={item.id} className="border-t hover:bg-gray-50">
    <td className="p-3">{item.title_fr}</td>
    <td className="p-3">{item.GalleryCategory?.name_fr || '—'}</td>
    <td className="p-3 uppercase">{item.media_type}</td>
    <td className="p-3 flex justify-end gap-2">
      {/* Eye button to view detail */}
      <Button variant="outline" size="sm" onClick={() => actions.onView?.(item)}>
        <Eye className="w-4 h-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={() => actions.onRestore(item.id)}>
        <RotateCcw className="w-4 h-4 text-green-600" />
      </Button>
      <Button variant="outline" size="sm" onClick={() => actions.onDelete(item.id)}>
        <Trash2 className="w-4 h-4 text-red-500" />
      </Button>
    </td>
  </tr>
)}
      />
    {viewItem && (
  <Dialog open onOpenChange={() => setViewItem(null)}>
    <DialogContent className="bg-white max-w-lg">
      <DialogHeader><DialogTitle>{viewItem.title_fr}</DialogTitle></DialogHeader>
      <GalleryItemDetailContent
        item={viewItem}
        t={t}
        detailCache={detailCache}
        setDetailCache={setDetailCache}
      />
    </DialogContent>
  </Dialog>
)}
     
    </div>
  );
}
function GalleryItemDetailContent({ item, t, detailCache, setDetailCache }: any) {
  const fetchingRef = useRef(false);
  const [full, setFull] = useState<any>(() => {
    // Use cache only if it contains all the fields we need
    const cached = detailCache.get(item.id);
    if (cached && cached.title_ar !== undefined && cached.description_fr !== undefined) {
      return cached;
    }
    return null;
  });
  const [loading, setLoading] = useState(() => {
    // Show spinner only if cache is incomplete
    const cached = detailCache.get(item.id);
    return !(cached && cached.title_ar !== undefined && cached.description_fr !== undefined);
  });

  useEffect(() => {
    // If we already have complete data, do nothing
    const cached = detailCache.get(item.id);
    if (cached && cached.title_ar !== undefined && cached.description_fr !== undefined) {
      setFull(cached);
      setLoading(false);
      return;
    }

    // Avoid duplicate fetches
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);

    adminAPI(`/gallery/items/${item.id}`)
      .then(data => {
        setFull(data);
        // Update cache with complete data
        setDetailCache((prev: Map<string, any>) => new Map(prev).set(item.id, data));
      })
      .catch(() => {
        // Fallback to whatever we have
        setFull(item);
      })
      .finally(() => {
        setLoading(false);
        fetchingRef.current = false;
      });
  }, [item.id]);

  if (loading && !full) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const display = full || item;

  return (
    <div className="space-y-4">
      {display.media_url && (
        <img
          src={display.media_url}
          alt={display.title_fr}
          className="w-full h-48 object-cover rounded-xl"
        />
      )}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-400">{t('titleFr')}</span>
          <p className="font-medium">{display.title_fr || '—'}</p>
        </div>
        <div>
          <span className="text-gray-400">{t('titleAr')}</span>
          <p className="font-medium">{display.title_ar || '—'}</p>
        </div>
        <div>
          <span className="text-gray-400">{t('category')}</span>
          <p className="font-medium">{display.GalleryCategory?.name_fr || '—'}</p>
        </div>
        <div>
          <span className="text-gray-400">{t('type')}</span>
          <p className="font-medium uppercase">{display.media_type || '—'}</p>
        </div>
        <div>
          <span className="text-gray-400">{t('active')}</span>
          <p className="font-medium">{display.is_active ? t('yes') : t('no')}</p>
        </div>
      </div>
      <div className="space-y-2">
        <div>
          <span className="text-gray-400 text-xs">{t('descriptionFr')}</span>
          <p className="text-sm">{display.description_fr || '—'}</p>
        </div>
        <div>
          <span className="text-gray-400 text-xs">{t('descriptionAr')}</span>
          <p className="text-sm">{display.description_ar || '—'}</p>
        </div>
      </div>
    </div>
  );
}