'use client';
import { useMemo, useState, useCallback , useRef  , useEffect  } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR, useAdminPOST, useAdminPUT, useAdminDELETE } from '@/lib/api/hooks';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { RetryableError } from '@/components/shared/RetryableError';
import { GenericFilterBar } from '@/components/admin/GenericFilterBar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { toast } from 'sonner';
import { RateLimitError } from '@/lib/api/types';
import { Pencil, Trash2, Plus, Loader2, ImageIcon, X, Eye, RotateCcw } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/admin/DeleteConfirmDialog';
import { GenericTrashDialog } from '@/components/admin/GenericTrashDialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { translateBatch } from '@/lib/utils/translate';
import { uploadToCloudinary } from '@/lib/cloudinary-upload';
import { adminAPI } from '@/lib/api/client';
import { ProductDetailDialog } from '@/components/admin/ProductDetailDialog';
import Image from 'next/image';
import { useNotifications } from '@/components/providers/NotificationsProvider';


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
function collectChildCategoryIds(parentId: string, categories: any[]): string[] {
  const ids = [parentId];
  const children = categories.filter((c: any) => c.parent_id === parentId);
  for (const child of children) {
    ids.push(...collectChildCategoryIds(child.id, categories));
  }
  return ids;
}
const ALL_VALUE = '__all__';
const LIMIT = 20;
const STANDARD_SLUGS = ['all', 'top-selling', 'new', 'recommended', 'discount', 'packages'];

const productSchema = (t: any) =>
  z.object({
    category_id: z.string().uuid(t('validation.categoryRequired')),
    name_fr: z.string().min(1, t('validation.nameFrRequired')),
    name_ar: z.string().min(1, t('validation.nameArRequired')),
    description_fr: z.string().optional(),
    description_ar: z.string().optional(),
    price: z.coerce.number().positive(t('validation.pricePositive')),
    show_original_price: z.boolean().optional().default(false),
    discount_percentage: z.coerce.number().min(0).max(100).optional().nullable(),
    stock_quantity: z.coerce.number().int().min(0).default(0),
    is_recommended: z.boolean().optional(),
    is_limited: z.boolean().optional(),
    is_active: z.boolean().optional().default(true),
  });

type ProductFormData = z.infer<ReturnType<typeof productSchema>>;

export default function ProductsTab() {
  const t = useTranslations('admin.products');

  const [localSearch, setLocalSearch] = useState('');
  const [localCategory, setLocalCategory] = useState(ALL_VALUE);
  const [serverSearch, setServerSearch] = useState('');
  const [serverCategory, setServerCategory] = useState(ALL_VALUE);
  const [page, setPage] = useState(0);
  const [viewProduct, setViewProduct] = useState<any>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const { data: categories } = useAdminGETSWR<any[]>('/categories');
const { refresh: refreshNotifications } = useNotifications();

  // Badge filters – stored as set of selected values
  const [selectedBadges, setSelectedBadges] = useState<Set<string>>(new Set());
  const [serverBadges, setServerBadges] = useState<Set<string>>(new Set());
const [badgesOpen, setBadgesOpen] = useState(false);
 const toggleBadge = (badge: string) => {
  setSelectedBadges(prev => {
    const next = new Set(prev);
    if (next.has(badge)) next.delete(badge);
    else next.add(badge);
    return next;
  });
  // Do NOT set page=0 here; that's only on Apply
};
 const queryString = useMemo(() => {
  const params = new URLSearchParams();
  if (serverSearch) params.set('search', serverSearch);
  if (serverCategory !== ALL_VALUE) params.set('category', serverCategory);
  if (serverBadges.has('recommended')) params.set('recommended', 'true');
  if (serverBadges.has('limited')) params.set('limited', 'true');
  if (serverBadges.has('discount')) params.set('discount', 'true');
  if (serverBadges.has('active')) params.set('active', 'true');
  params.set('limit', LIMIT.toString());
  params.set('offset', (page * LIMIT).toString());
  return params.toString();
}, [serverSearch, serverCategory, serverBadges, page]);

  const { data, error, mutate, isValidating, retry, isRetrying } = useAdminGETSWR<{ products: any[]; total: number }>(`/products?${queryString}`);

  const {
    trigger: deleteProduct,
    loading: deleteLoading,
    error: deleteApiError,
  } = useAdminDELETE(() => `/products/${deleteTarget}`);

  const categoryMap = useMemo(() => {
    const map: Record<string, any> = {};
    categories?.forEach((c: any) => (map[c.id] = c));
    return map;
  }, [categories]);

  const getCategoryPath = (product: any) => {
    if (!categoryMap || !Object.keys(categoryMap).length) return product.ProductCategory?.name_fr || '—';
    const cat = categoryMap[product.category_id];
    if (!cat) return product.ProductCategory?.name_fr || '—';
    if (cat.parent_id && categoryMap[cat.parent_id]) {
      return `${categoryMap[cat.parent_id].name_fr} › ${cat.name_fr}`;
    }
    return cat.name_fr || '—';
  };

const applyAllFilters = () => {
  setServerSearch(localSearch);
  setServerCategory(localCategory);
  setServerBadges(new Set(selectedBadges));
  setPage(0);
};

const clearAllFilters = () => {
  setLocalSearch('');
  setServerSearch('');
  setLocalCategory(ALL_VALUE);
  setServerCategory(ALL_VALUE);
  setSelectedBadges(new Set());
  setServerBadges(new Set());
  setPage(0);
};
const badgeRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  function handleClickOutside(event: MouseEvent) {
    if (badgeRef.current && !badgeRef.current.contains(event.target as Node)) {
      setBadgesOpen(false);
    }
  }
  document.addEventListener('mousedown', handleClickOutside);
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, []);
const removeFilter = (key: string) => {
  if (key === 'search') { setLocalSearch(''); setServerSearch(''); }
  if (key === 'category') { setLocalCategory(ALL_VALUE); setServerCategory(ALL_VALUE); }
  if (key === 'badges') {
    setSelectedBadges(new Set());
    setServerBadges(new Set());
  }
  setPage(0);
};

  const handleDelete = async (deleteCode: string) => {
    if (!deleteTarget) return;
    try {
      await deleteProduct({ deleteCode });
      mutate((current) => {
        if (!current) return current;
        return { ...current, products: current.products.filter((p: any) => p.id !== deleteTarget), total: current.total - 1 };
      }, false);
      toast.success(t('deleted'));
      setDeleteTarget(null);
    } catch {}
  };

  const handleProductUpdate = (updatedProduct: any, finalAdditionalImages: any[]) => {
    mutate((current: any) => {
      if (!current) return current;
      return {
        ...current,
        products: current.products.map((p: any) =>
          p.id === updatedProduct.id ? { ...updatedProduct, ProductImage: finalAdditionalImages } : p
        ),
      };
    }, false);
  };

  const handleEdit = (productId: string) => {
    if (editingId === productId && showForm) return;
    setEditingId(productId);
    setShowForm(true);

    const productFromList = data?.products?.find((p: any) => p.id === productId);
    if (productFromList?.ProductImage) {
      setEditingProduct(productFromList);
      return;
    }

    setEditingProduct(null);
    setLoadingEdit(true);
    adminAPI(`/products/${productId}`)
      .then(full => {
        setEditingProduct(full);
        if (full) {
          mutate((current: any) => {
            if (!current) return current;
            return {
              ...current,
              products: current.products.map((p: any) =>
                p.id === productId ? { ...p, ProductImage: full.ProductImage } : p
              ),
            };
          }, false);
        }
      })
      .catch(err => {
        toast.error(t('errorLoadingProduct'));
        setShowForm(false);
      })
      .finally(() => setLoadingEdit(false));
  };

  const products = data?.products || [];
const categoriesInItems = useMemo(() => {
  const usedIds = new Set<string>();
  products.forEach((p: any) => {
    usedIds.add(p.category_id);
  });
  // Also include parent categories of used subcategories
  categories?.forEach((c: any) => {
    if (c.parent_id && usedIds.has(c.id)) {
      usedIds.add(c.parent_id);
    }
  });
  return categories?.filter((c: any) => usedIds.has(c.id)) ?? [];
}, [products, categories]);
  // Local filtering (search + badges)
const filteredProducts = useMemo(() => {
  let result = products;

  // Apply local search (text)
  if (localSearch.trim()) {
    const term = localSearch.toLowerCase();
    result = result.filter((p: any) =>
      p.name_fr.toLowerCase().includes(term) ||
      p.name_ar.includes(term) ||
      (p.description_fr || '').toLowerCase().includes(term) ||
      (p.description_ar || '').includes(term) ||
      String(p.price).includes(term) ||
      String(p.stock_quantity).includes(term) ||
      String(p.discount_percentage).includes(term)
    );
  }

  // Apply local category filter
  if (localCategory !== ALL_VALUE) {
  const ids = collectChildCategoryIds(localCategory, categories || []);
  result = result.filter(p => ids.includes(p.category_id));
}
  // Apply local badge filters (can be combined)
  if (selectedBadges.size > 0) {
    if (selectedBadges.has('recommended')) {
      result = result.filter(p => p.is_recommended);
    }
    if (selectedBadges.has('limited')) {
      result = result.filter(p => p.is_limited);
    }
    if (selectedBadges.has('discount')) {
      result = result.filter(p => p.discount_percentage > 0);
    }
    if (selectedBadges.has('active')) {
      result = result.filter(p => p.is_active);
    }
  }

  return result;
}, [products, localSearch, localCategory, selectedBadges]);

  const activeFilters: { key: string; label: string }[] = [];
  if (serverSearch) activeFilters.push({ key: 'search', label: `${t('search')}: "${serverSearch}"` });
  if (serverCategory !== ALL_VALUE) {
    const cat = categories?.find((c: any) => c.id === serverCategory);
    activeFilters.push({ key: 'category', label: `${t('category')}: ${cat?.name_fr || serverCategory}` });
  }
  
if (serverBadges.size > 0) {
  activeFilters.push({ key: 'badges', label: Array.from(serverBadges).map(b => t(b)).join(', ') });
}
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
          <Button onClick={() => { setEditingId(null); setEditingProduct(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-1" /> {t('create')}
          </Button>
          <RefreshButton onRefresh={() => mutate()} loading={isValidating} />
        </div>
      </div>

      {/* Filter bar with category + custom badges filter */}
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
        const options = [
          <option key={parent.id} value={parent.id}>{parent.name_fr}</option>
        ];
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
        {/* Badge multi‑select dropdown */}
      <div className="relative" ref={badgeRef}>
  <label className="text-sm font-medium">{t('badges')}</label>
  <Button variant="outline" size="sm" onClick={() => setBadgesOpen(!badgesOpen)} type="button">
    {selectedBadges.size > 0 ? Array.from(selectedBadges).map(b => t(b)).join(', ') : t('all')}
  </Button>

  {badgesOpen && (
    <div className="absolute z-10 mt-1 w-48 bg-white border rounded-lg shadow-lg p-2">
      <label className="flex items-center gap-2 p-1">
        <input type="checkbox" checked={selectedBadges.has('recommended')} onChange={() => toggleBadge('recommended')} />
        {t('recommended')}
      </label>
      <label className="flex items-center gap-2 p-1">
        <input type="checkbox" checked={selectedBadges.has('limited')} onChange={() => toggleBadge('limited')} />
        {t('limited')}
      </label>
      <label className="flex items-center gap-2 p-1">
        <input type="checkbox" checked={selectedBadges.has('discount')} onChange={() => toggleBadge('discount')} />
        {t('discount')}
      </label>
      <label className="flex items-center gap-2 p-1">
        <input type="checkbox" checked={selectedBadges.has('active')} onChange={() => toggleBadge('active')} />
        {t('active')}
      </label>
    </div>
  )}
</div>

        <div className="flex items-end gap-2">
          <div>
            <label className="text-sm font-medium">{t('search')}</label>
            <Input
              placeholder={t('searchPlaceholder')}
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-48"
            />
          </div>
          <Button onClick={applyAllFilters} size="sm">{t('apply')}</Button>
        </div>
        <Button variant="outline" onClick={clearAllFilters} size="sm">{t('reset')}</Button>
      </div>

      {/* Active filter badges */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeFilters.map((f) => (
            <span key={f.key} onClick={() => removeFilter(f.key)}
              className="bg-secondary/20 text-secondary text-xs px-2 py-1 rounded-full cursor-pointer">
              {f.label} <X className="w-3 h-3 inline" />
            </span>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border shadow-sm">
        {!data && isValidating ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filteredProducts.length === 0 ? (
          <p className="text-center text-gray-500 py-10">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('image')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('name')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('category')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('price')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('stock')}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">{t('badges')}</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product: any) => (
                  <tr key={product.id} className="border-t">
                    <td className="px-4 py-3">
                      {product.image_url ? (
                        <Image src={product.image_url} alt="" width={40} height={40} className="rounded object-cover" unoptimized />
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <Highlight text={product.name_fr} term={localSearch} />
                    </td>
                    <td className="px-4 py-3">
                      <Highlight text={getCategoryPath(product)} term={localSearch} />
                    </td>
                    <td className="px-4 py-3">
                      <Highlight text={`${Math.round(product.price * (1 - (product.discount_percentage || 0) / 100))} TND`} term={localSearch} />
                    </td>
                    <td className={`px-4 py-3 ${product.stock_quantity <= 5 ? 'text-red-600 font-bold' : ''}`}>
                      <Highlight text={String(product.stock_quantity)} term={localSearch} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {product.discount_percentage > 0 && (
                          <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">-{product.discount_percentage}%</span>
                        )}
                        {product.is_recommended && (
                          <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">{t('recommended')}</span>
                        )}
                        {product.is_limited && (
                          <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">{t('limited')}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(product.id)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDeleteTarget(product.id)}>
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
          <span className="text-sm text-gray-500">
            {t('showing', { from: page * LIMIT + 1, to: Math.min((page + 1) * LIMIT, data.total), total: data.total })}
          </span>
          <div className="flex items-center gap-2">
            <Button disabled={page === 0} onClick={() => setPage(p => p - 1)} variant="outline" size="sm">{t('previous')}</Button>
            <span className="text-sm font-medium">{t('page')} {page + 1} / {totalPages}</span>
            <Button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} variant="outline" size="sm">{t('next')}</Button>
          </div>
        </div>
      )}

      {/* Edit/Create dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="bg-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? t('edit') : editingId ? t('edit') : t('create')}</DialogTitle>
          </DialogHeader>
          {editingId && loadingEdit ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <ProductForm
              initial={editingProduct ?? null}
              mutate={mutate}
              onClose={() => { setShowForm(false); setEditingId(null); setEditingProduct(null); }}
              onUpdate={handleProductUpdate}
              categories={categories || []}
            />
          )}
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
        endpoint="/products?deleted=true"
        restoreEndpoint={(id) => `/products/${id}/restore`}
        deleteEndpoint={(id) => `/products/${id}/permanent`}
        title={t('trashTitle')}
        columns={[
          { key: 'name_fr', label: t('name') },
          { key: 'ProductCategory.name_fr', label: t('category') },
          { key: 'price', label: t('price') },
        ]}
        searchPlaceholder={t('searchPlaceholder')}
        emptyMessage={t('trashEmpty')}
        t={t}
        renderRow={(product, actions) => (
          <tr key={product.id} className="border-t hover:bg-gray-50">
            <td className="p-3">{product.name_fr}</td>
            <td className="p-3">{product.ProductCategory?.name_fr || '—'}</td>
            <td className="p-3">{product.price} TND</td>
            <td className="p-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => actions.onView?.(product)}><Eye className="w-4 h-4" /></Button>
              <Button variant="outline" size="sm" onClick={() => actions.onRestore(product.id)}><RotateCcw className="w-4 h-4 text-green-600" /></Button>
              <Button variant="outline" size="sm" onClick={() => actions.onDelete(product.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
            </td>
          </tr>
        )}
        onView={(product) => setViewProduct(product)}
      />
            {viewProduct && (
        <ProductDetailDialog
          product={viewProduct}
          open={!!viewProduct}
          onOpenChange={(open) => { if (!open) setViewProduct(null); }}
          t={t}
          categories={categories}
        />
      )}
    </div>
  );
}

/* ── ProductForm (unchanged image logic, category select now uses native select with optgroup) ─── */
function ProductForm({ initial, mutate, onClose, onUpdate, categories }: any) {
  const t = useTranslations('admin.products');
  const schema = productSchema(t);

  const { register, handleSubmit, formState: { errors, isValid }, getValues, setValue, watch } = useForm<ProductFormData>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          category_id: initial.category_id || '',
          name_fr: initial.name_fr || '',
          name_ar: initial.name_ar || '',
          description_fr: initial.description_fr || '',
          description_ar: initial.description_ar || '',
          price: initial.price || 0,
          show_original_price: initial.show_original_price ?? false,
          discount_percentage: initial.discount_percentage ?? null,
          stock_quantity: initial.stock_quantity || 0,
          is_recommended: initial.is_recommended ?? false,
          is_limited: initial.is_limited ?? false,
          is_active: initial.is_active ?? true,
        }
      : {
          category_id: '', name_fr: '', name_ar: '',
          description_fr: '', description_ar: '', price: 0,
          show_original_price: false,
          discount_percentage: null,
          stock_quantity: 0, is_recommended: false, is_limited: false, is_active: true,
        },
    mode: 'onChange',
  });

  const { trigger: create, loading: creating } = useAdminPOST('/products', { showToast: false });
  const { trigger: update, loading: updating } = useAdminPUT(() => `/products/${initial?.id}`, { showToast: false });
  const loading = creating || updating;

  const [mainImageFile, setMainImageFile] = useState<File | null>(null);
  const [mainPreview, setMainPreview] = useState<string | null>(initial?.image_url || null);
  const [additionalFiles, setAdditionalFiles] = useState<File[]>([]);
  const [existingAdditionalImages, setExistingAdditionalImages] = useState<any[]>(initial?.ProductImage || []);
  const [removedAdditionalIds, setRemovedAdditionalIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [translating, setTranslating] = useState(false);

  const parentIdsWithChildren = new Set(categories?.filter((c: any) => c.parent_id).map((c: any) => c.parent_id));
  const eligibleCategories = useMemo(() => {
    if (!categories) return [];
    return categories.filter((c: any) => {
      if (c.slug === 'recommended') return false;
      if (c.slug === 'packages') return true;
      if (!STANDARD_SLUGS.includes(c.slug)) {
        if (c.parent_id) return true;
        return !parentIdsWithChildren.has(c.id);
      }
      return false;
    });
  }, [categories, parentIdsWithChildren]);

  // Handlers unchanged (handleMainImageChange, handleAddImageFile, etc.) ...
  const handleMainImageChange = (e: any) => { const file = e.target.files?.[0]; if (file) { setMainImageFile(file); setMainPreview(URL.createObjectURL(file)); } };
  const handleAddImageFile = (e: any) => { const file = e.target.files?.[0]; if (file) setAdditionalFiles(prev => [...prev, file]); };
  const removeAdditionalFile = (index: number) => setAdditionalFiles(prev => prev.filter((_, i) => i !== index));
  const removeExistingAdditionalImage = (imageId: string) => {
    setExistingAdditionalImages(prev => prev.filter(img => img.id !== imageId));
    setRemovedAdditionalIds(prev => [...prev, imageId]);
  };

  const handleTranslate = async () => {
    const values = getValues();
    const missing: any[] = [];
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

  const handleSave = async (formData: ProductFormData) => {
    let imageUrl = initial?.image_url || '';
    let imagePublicId = initial?.image_public_id || null;
    setUploading(true);
    try {
      if (mainImageFile) {
        toast.info(t('uploadingImage'));
        const result = await uploadToCloudinary(mainImageFile);
        imageUrl = result.url;
        imagePublicId = result.public_id;
      }
      const { image_url: _, image_public_id: __, ...restFormData } = formData as any;
      const payload = { ...restFormData, image_url: imageUrl, image_public_id: imagePublicId };
      if (initial) {
        const imagesAdd = [];
        for (const file of additionalFiles) {
          const uploaded = await uploadToCloudinary(file);
          imagesAdd.push({ url: uploaded.url, public_id: uploaded.public_id });
        }
        const imagesRemove = [...removedAdditionalIds];
        const updated = await update({ ...payload, images: { add: imagesAdd, remove: imagesRemove } });
        const keptExisting = existingAdditionalImages.filter(img => !removedAdditionalIds.includes(img.id));
        const newlySavedImages = imagesAdd.map(img => ({ id: img.public_id, url: img.url, public_id: img.public_id }));
        const finalAdditionalImages = [...keptExisting, ...newlySavedImages];
        onUpdate?.(updated, finalAdditionalImages);
        toast.success(t('updated'));
        refreshNotifications();
      } else {
        const created = await create(payload);
        for (const file of additionalFiles) {
          const uploaded = await uploadToCloudinary(file);
          await adminAPI(`/products/${created.id}/images`, {
            method: 'POST',
            body: JSON.stringify({ url: uploaded.url, public_id: uploaded.public_id }),
          });
        }
        mutate((current: any) => {
          if (!current) return current;
          return { ...current, products: [created, ...current.products], total: (current.total || 0) + 1 };
        }, false);
        toast.success(t('created'));
      }
      onClose();
    } catch (err: any) {
      if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
      else toast.error(err.message || t('error'));
    } finally { setUploading(false); }
  };

  const canTranslate = (watch('name_fr') && !watch('name_ar')) || (watch('name_ar') && !watch('name_fr')) || (watch('description_fr') && !watch('description_ar')) || (watch('description_ar') && !watch('description_fr'));

  return (
    <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
      {/* Main image */}
      <div>
        <label className="block text-sm font-medium mb-1">{t('image')}</label>
        {mainPreview ? (
          <div className="relative inline-block">
            <Image src={mainPreview} alt="Preview" width={120} height={120} className="rounded-xl object-cover" unoptimized />
            <label className="absolute bottom-2 right-2 bg-white/90 rounded-full p-1 shadow cursor-pointer hover:bg-white">
              <ImageIcon className="w-4 h-4 text-primary" />
              <input type="file" accept="image/*" className="hidden" onChange={handleMainImageChange} />
            </label>
          </div>
        ) : (
          <label className="cursor-pointer inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <ImageIcon className="w-4 h-4" /> {t('chooseImage')}
            <input type="file" accept="image/*" className="hidden" onChange={handleMainImageChange} />
          </label>
        )}
      </div>

      {(mainPreview || initial?.image_url) && (
        <div>
          <label className="block text-sm font-medium mb-1">{t('additionalImages')}</label>
          <div className="flex flex-wrap gap-2">
            {existingAdditionalImages.map((img: any) => (
              <div key={img.id} className="relative w-20 h-20 rounded-lg overflow-hidden">
                <Image src={img.url} alt="" fill className="object-cover" unoptimized />
                <button type="button" onClick={() => removeExistingAdditionalImage(img.id)} className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-0.5"><X className="w-3 h-3" /></button>
              </div>
            ))}
            {additionalFiles.map((file, idx) => (
              <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden">
                <Image src={URL.createObjectURL(file)} alt="" fill className="object-cover" unoptimized />
                <button type="button" onClick={() => removeAdditionalFile(idx)} className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-0.5"><X className="w-3 h-3" /></button>
              </div>
            ))}
            <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-primary">
              <Plus className="w-5 h-5 text-gray-400" />
              <input type="file" accept="image/*" className="hidden" onChange={handleAddImageFile} />
            </label>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-sm font-medium mb-1">{t('nameFr')}</label><Input placeholder={t('nameFrPlaceholder')} {...register('name_fr')} />{errors.name_fr && <p className="text-red-500 text-xs mt-1">{errors.name_fr.message}</p>}</div>
        <div><label className="block text-sm font-medium mb-1">{t('nameAr')}</label><Input placeholder={t('nameArPlaceholder')} {...register('name_ar')} />{errors.name_ar && <p className="text-red-500 text-xs mt-1">{errors.name_ar.message}</p>}</div>
        <div><label className="block text-sm font-medium mb-1">{t('price')}</label><Input placeholder={t('pricePlaceholder')} type="number" step="0.01" {...register('price')} />{errors.price && <p className="text-red-500 text-xs mt-1">{errors.price.message}</p>}</div>
        <div className="flex items-center gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register('show_original_price')} />{t('showOriginalPrice')}</label></div>
        <div><label className="block text-sm font-medium mb-1">{t('discount')}</label><Input placeholder={t('discountPlaceholder')} type="number" step="1" {...register('discount_percentage')} />{errors.discount_percentage && <p className="text-red-500 text-xs mt-1">{errors.discount_percentage.message}</p>}</div>
        <div><label className="block text-sm font-medium mb-1">{t('stock')}</label><Input placeholder={t('stockPlaceholder')} type="number" {...register('stock_quantity')} /></div>
       <div>
  <label className="block text-sm font-medium mb-1">{t('category')}</label>
  <select {...register('category_id')} className="w-full border rounded px-3 py-2 text-sm">
    <option value="">{t('selectCategory')}</option>
    {/* Packages always allowed */}
    {categories?.find((c: any) => c.slug === 'packages') && (
      <option value={categories.find((c: any) => c.slug === 'packages')!.id}>
        {categories.find((c: any) => c.slug === 'packages')!.name_fr}
      </option>
    )}
    {/* Manual categories – parent with children shown as group, child selectable */}
    {categories
      ?.filter((c: any) => !STANDARD_SLUGS.includes(c.slug) && !c.parent_id)
      .map((parent: any) => {
        const children = categories.filter((sub: any) => sub.parent_id === parent.id);
        if (children.length > 0) {
          // Parent has subcategories – it CANNOT be selected (leaf rule). Show children as options.
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
          // Parent has no children – it CAN be selected (leaf)
          return (
            <option key={parent.id} value={parent.id}>
              {parent.name_fr}
            </option>
          );
        }
      })}
  </select>
  {errors.category_id && <p className="text-red-500 text-xs mt-1">{errors.category_id.message}</p>}
</div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div><label className="block text-sm font-medium mb-1">{t('descriptionFr')}</label><Textarea placeholder={t('descriptionFrPlaceholder')} {...register('description_fr')} /></div>
        <div><label className="block text-sm font-medium mb-1">{t('descriptionAr')}</label><Textarea placeholder={t('descriptionArPlaceholder')} {...register('description_ar')} /></div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register('is_recommended')} />{t('recommended')}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register('is_limited')} />{t('limited')}</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register('is_active')} />{t('active')}</label>
      </div>

      <div className="flex gap-2 justify-end">
        {canTranslate && <Button type="button" variant="outline" onClick={handleTranslate} disabled={translating}>{translating ? t('translating') : t('translate')}</Button>}
        <Button type="submit" disabled={!isValid || loading || uploading || (!mainPreview && !initial?.image_url)}>
          {loading || uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
          {t('save')}
        </Button>
      </div>
    </form>
  );
}