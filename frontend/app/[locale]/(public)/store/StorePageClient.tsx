'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePublicGETSWR } from '@/lib/api/hooks';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import { useRouter } from '@/navigation';
import { useCart } from '@/components/providers/CartProvider';
import { Search, ShoppingCart, Loader2 } from 'lucide-react';
import { formatTND } from '@/lib/utils/currency';
import { useProductCache } from '@/components/providers/ProductCacheProvider';

interface Product {
  id: string;
  slug: string;
  name_fr: string;
  name_ar: string;
  price: number;
  discount_percentage: number | null;
  show_original_price: boolean;
  image_url: string | null;
  category_id: string;
  is_limited: boolean;
  stock_quantity: number;
  ProductCategory: { name_fr: string; name_ar: string; slug: string; parent_id: string | null };
}

interface Category {
  id: string;
  name_fr: string;
  name_ar: string;
  slug: string;
}
function getStaticGifUrl(url: string) {
  // Replace .gif with .jpg and add Cloudinary first‑frame transformation
  return url.replace(/\.gif$/i, '.jpg') + '?pg_1,f_jpg,q_auto';
}

function isGif(url: string) {
  return /\.gif$/i.test(url);
}
const BATCH_SIZE = 50;
function ProductCard({ product, locale, t, addItem, router }: any) {
  const [hover, setHover] = useState(false);
  const name = locale === 'fr' ? product.name_fr : product.name_ar;
  const isGifImage = product.image_url && isGif(product.image_url);

  return (
    <ScrollReveal>
      <div
        onClick={() => router.push(`/store/product/${product.slug || product.id}`)}
        className="group block bg-white rounded-[40px] shadow-sm border border-gray-100 hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer"
      >
        <div
          className="aspect-square bg-gray-100 relative overflow-hidden"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          {product.image_url ? (
            <img
              src={
                isGifImage
                  ? hover
                    ? product.image_url
                    : getStaticGifUrl(product.image_url)
                  : product.image_url
              }
              alt={name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/10 text-gray-400 text-5xl font-black">
              {name.charAt(0)}
            </div>
          )}
          {product.discount_percentage && product.discount_percentage > 0 && (
            <span className="absolute top-3 left-3 bg-secondary text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">
              -{product.discount_percentage}%
            </span>
          )}
          {product.is_limited && (
            <span className="absolute top-3 right-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-md">
              {t('limited')}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              addItem({
                id: product.id,
                name,
                price: product.price,
                
                image_url: product.image_url || '',
                quantity: 1,
              });
            }}
            className="absolute bottom-3 right-3 w-10 h-10 bg-white/90 rounded-full shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary hover:text-white"
            aria-label={t('addToCart')}
          >
            <ShoppingCart className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          <h3 className="font-semibold text-dark truncate group-hover:text-primary transition-colors">
            {name}
          </h3>
                   <div className="flex items-center gap-2 mt-1">
            <span className="text-lg font-black text-dark">
              {formatTND(Math.round(product.price * (1 - (product.discount_percentage || 0) / 100)))}
            </span>
            {product.show_original_price && product.discount_percentage > 0 && (
              <span className="text-sm text-gray-400 line-through">
                {formatTND(product.price)}
              </span>
            )}
          </div>
        </div>
      </div>
    </ScrollReveal>
  );
}
export default function StorePageClient() {
  const t = useTranslations('store');
  const locale = useLocale();
  const router = useRouter();
  const { addItem } = useCart();
  const { addProducts, setHasAllProducts } = useProductCache();

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sort, setSort] = useState('newest');

  // Pagination
  const [offset, setOffset] = useState(0);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);

  // Build query string dynamically from filters + pagination
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (selectedCategory !== 'all') params.set('category', selectedCategory);
    if (sort !== 'newest') params.set('sort', sort);
    params.set('limit', BATCH_SIZE.toString());
    params.set('offset', offset.toString());
    return params.toString();
  }, [search, selectedCategory, sort, offset]);

  const { data, loading, error, retry, isRetrying } = usePublicGETSWR<{
    products: Product[];
    total: number;
  }>(`/products?${queryString}`);

  // Reset products and offset whenever filters change
  useEffect(() => {
    setOffset(0);
    setAllProducts([]);
  }, [search, selectedCategory, sort]);

  // Append new data when it arrives
  useEffect(() => {
    if (!data) return;
    addProducts(data.products);
    if (offset === 0) {
      setAllProducts(data.products);
    } else {
      setAllProducts(prev => [...prev, ...data.products]);
    }
    setTotal(data.total);
    if ((offset + BATCH_SIZE) >= data.total || data.products.length < BATCH_SIZE) {
      setHasAllProducts(true);
    }
  }, [data, offset, addProducts, setHasAllProducts]);

  const loadMore = useCallback(() => {
    setOffset(prev => prev + BATCH_SIZE);
  }, []);

  const hasMore = allProducts.length < total;

  // Categories (unchanged ordering logic)
  const { data: categories } = usePublicGETSWR<Category[]>('/categories');
  const standardSlugs = ['all', 'top-selling', 'new', 'recommended', 'discount', 'packages'];
  const orderedCategories = useMemo(() => {
    if (!categories) return [];
    const validCategories = categories.filter(c => c.slug && c.slug.trim() !== '');
    const standard = validCategories.filter(c => standardSlugs.includes(c.slug));
    const regular = validCategories.filter(c => !standardSlugs.includes(c.slug));
    const sortedStandard = standardSlugs
      .map(slug => standard.find(c => c.slug === slug))
      .filter(Boolean) as Category[];
    return [...sortedStandard, ...regular.sort((a, b) => a.name_fr.localeCompare(b.name_fr))];
  }, [categories]);

  if (!data && loading) return <LoadingSpinner />;
  if (error && !allProducts.length)
    return <RetryableError error={error} onRetry={retry} isRetrying={isRetrying} />;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-16">
      <ScrollReveal>
        <h1 className="text-5xl md:text-7xl font-black mb-8 text-center">{t('title')}</h1>
      </ScrollReveal>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-10">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="pl-10 rounded-2xl bg-gray-50 focus:bg-white"
          />
        </div>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-full md:w-48 rounded-2xl bg-gray-50 focus:bg-white">
            <SelectValue placeholder={t('allCategories')} />
          </SelectTrigger>
          <SelectContent>
            {orderedCategories.map(cat => (
              <SelectItem key={cat.id} value={cat.slug}>
                {locale === 'fr' ? cat.name_fr : cat.name_ar}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-full md:w-48 rounded-2xl bg-gray-50 focus:bg-white">
            <SelectValue placeholder={t('sortBy')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{t('newest')}</SelectItem>
            <SelectItem value="price_asc">{t('priceAsc')}</SelectItem>
            <SelectItem value="price_desc">{t('priceDesc')}</SelectItem>
            <SelectItem value="name_asc">{t('nameAsc')}</SelectItem>
            <SelectItem value="name_desc">{t('nameDesc')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Products grid */}
      {allProducts.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 text-lg">{t('noProducts')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {allProducts.map(product => (
              <ProductCard key={product.id} product={product} locale={locale} t={t} addItem={addItem} router={router} />
            ))}          </div>

          {hasMore && (
            <div className="flex justify-center mt-10">
              <button
                onClick={loadMore}
                disabled={loading}
                className="px-8 py-3 bg-primary text-white rounded-full font-bold hover:bg-primary/90 disabled:opacity-50 transition flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('loadMore')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}