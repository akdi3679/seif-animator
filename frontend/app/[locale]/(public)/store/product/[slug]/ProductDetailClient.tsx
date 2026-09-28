'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { usePublicGETSWR } from '@/lib/api/hooks';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';
import { Button } from '@/components/ui/button';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import { Minus, Plus, ShoppingCart, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from '@/navigation';
import { useCart } from '@/components/providers/CartProvider';
import { useProductCache } from '@/components/providers/ProductCacheProvider';
import { formatTND } from '@/lib/utils/currency';

interface ProductImage {
  id: string;
  url: string;
  is_primary: boolean;
  order_index: number;
}

interface Product {
  id: string;
  slug: string;
  name_fr: string;
  name_ar: string;
  description_fr: string;
  description_ar: string;
  price: number;
  show_original_price: boolean;
  discount_percentage: number | null;
  stock_quantity: number;
  is_limited: boolean;
  ProductCategory: { name_fr: string; name_ar: string; slug: string };
  ProductImage: ProductImage[];
}

export default function ProductDetailClient() {
  const params = useParams();
  const slug = params.slug as string;
  const t = useTranslations('productDetail');
  const locale = useLocale();
  const [quantity, setQuantity] = useState(1);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const { addItem } = useCart();
const { getProduct, hasAllProducts, missingSlugs, markMissing } = useProductCache();
console.log('hasAllProducts:', hasAllProducts, 'slug:', slug);

  // Try to get the product from the cache first
 
  const cachedProduct = getProduct(slug) as Product | undefined;
  const knownMissing = missingSlugs.has(slug);

  // Only fetch if cache is incomplete AND product not cached AND not already known missing
const shouldFetch = !cachedProduct && !knownMissing;

  // Only fetch from the API if the product is not cached AND we don't yet have all products

const { data: fetchedProduct, loading, error, retry, isRetrying } =
    usePublicGETSWR<Product>(shouldFetch ? `/products/${slug}` : null);

  const product = cachedProduct || fetchedProduct;

  // ---- States ----
 if (loading && shouldFetch) {
    return <LoadingSpinner />;
  }
  // Product not found – either cache is complete and product is missing, or API returned 404
  if (!product || (hasAllProducts && !cachedProduct) || knownMissing) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
          <ShoppingCart className="w-12 h-12 text-gray-400" />
        </div>
        <h2 className="text-2xl font-black text-dark mb-2">{t('notFound')}</h2>
        <p className="text-gray-500 mb-8 max-w-md">
          {t('productnotfound')}
        </p>
        <Link
          href="/store"
          className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl font-bold hover:bg-primary/80 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {t('backToStore')}
        </Link>
      </div>
    );
  }
   if (error && shouldFetch) {
    return <RetryableError error={error} onRetry={retry} isRetrying={isRetrying} />;
  }

  // Images
  const images =
    product.ProductImage?.length > 0
      ? product.ProductImage
      : [{ id: 'default', url: (product as any).image_url || '', is_primary: true, order_index: 1 } as ProductImage];

 useEffect(() => {
    if (error && (error as any)?.status === 404) {
      markMissing(slug);
    }
  }, [error, slug, markMissing]);
  const handleAddToCart = () => {
    addItem({
      id: product.id,
      name: locale === 'fr' ? product.name_fr : product.name_ar,
      price: product.price,
      compareAtPrice: product.compare_at_price || undefined,
      image_url: images[0]?.url || '',
      quantity,
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 sm:py-16">
      <ScrollReveal>
        <Link
          href="/store"
          className="text-primary hover:underline mb-4 inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" /> {t('backToStore')}
        </Link>
      </ScrollReveal>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 mt-8">
        {/* Image gallery */}
        <div>
          <div className="aspect-square bg-gray-100 rounded-3xl overflow-hidden relative">
            {images[currentImageIndex]?.url ? (
              <img
                src={images[currentImageIndex].url}
                alt={locale === 'fr' ? product.name_fr : product.name_ar}
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                {t('noImage')}
              </div>
            )}
            {images.length > 1 && (
              <>
                <button
                  onClick={() => setCurrentImageIndex(p => (p - 1 + images.length) % images.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full p-2"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setCurrentImageIndex(p => (p + 1) % images.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full p-2"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 mt-4 overflow-x-auto">
              {images.map((img, idx) => (
                <button
                  key={img.id}
                  onClick={() => setCurrentImageIndex(idx)}
                  className={`w-20 h-20 rounded-xl overflow-hidden border-2 ${
                    idx === currentImageIndex ? 'border-primary' : 'border-transparent'
                  }`}
                >
                  <img
                    src={img.url}
                    alt=""
                    className="object-cover w-full h-full"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product info */}
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black mb-2">
            {locale === 'fr' ? product.name_fr : product.name_ar}
          </h1>
          <p className="text-gray-500 text-sm mb-4">
            {locale === 'fr'
              ? product.ProductCategory?.name_fr
              : product.ProductCategory?.name_ar}
          </p>

                             <div className="flex items-center gap-3 mb-6 flex-wrap">
            <span className="text-2xl sm:text-3xl font-black text-dark">
              {formatTND(Math.round(product.price * (1 - (product.discount_percentage || 0) / 100)))}
            </span>
            {product.show_original_price && product.discount_percentage && product.discount_percentage > 0 && (
              <span className="text-gray-400 line-through text-lg">
                {formatTND(product.price)}
              </span>
            )}
            {product.discount_percentage && product.discount_percentage > 0 && (
              <span className="bg-secondary/20 text-secondary font-bold px-3 py-1 rounded-full text-sm">
                -{product.discount_percentage}%
              </span>
            )}
            {product.is_limited && (
              <span className="bg-red-100 text-red-600 font-bold px-3 py-1 rounded-full text-sm">
                {locale === 'fr' ? 'Limité' : 'محدود'}
              </span>
            )}
          </div>

          {(product.description_fr || product.description_ar) && (
            <div className="prose prose-lg max-w-none mb-8 text-gray-600">
              {locale === 'fr' ? product.description_fr : product.description_ar}
            </div>
          )}

          {/* Quantity + Add to Cart */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex items-center border border-gray-200 rounded-2xl">
              <button
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="p-3 hover:bg-gray-50 rounded-l-2xl"
              >
                <Minus className="w-5 h-5" />
              </button>
              <input
                type="number"
                value={quantity}
                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 text-center border-x border-gray-200 py-3 outline-none"
                min={1}
                max={product.stock_quantity}
              />
              <button
                onClick={() => setQuantity(q => Math.min(product.stock_quantity, q + 1))}
                className="p-3 hover:bg-gray-50 rounded-r-2xl"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <Button
              onClick={handleAddToCart}
              className="flex-1 py-6 text-lg font-bold rounded-2xl bg-primary hover:bg-primary/90 text-white"
            >
              <ShoppingCart className="w-5 h-5 mr-2" />
              {t('addToCart')}
            </Button>
          </div>

          <p className="text-sm text-gray-500">
            {t('stock', { count: product.stock_quantity })}
          </p>
        </div>
      </div>
    </div>
  );
}