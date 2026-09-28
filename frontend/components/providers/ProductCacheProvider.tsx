'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface CachedProduct {
  id: string;
  slug: string;
  name_fr: string;
  name_ar: string;
  price: number;
  compare_at_price: number | null;
  discount_percentage: number | null;
  image_url: string | null;
  category_id: string;
  is_limited: boolean;
  stock_quantity: number;
  ProductCategory: { name_fr: string; name_ar: string; slug: string };
}

interface ProductCacheContextType {
  products: Map<string, CachedProduct>;
  addProducts: (products: CachedProduct[]) => void;
  getProduct: (slug: string) => CachedProduct | undefined;
  hasAllProducts: boolean;
  setHasAllProducts: (value: boolean) => void;
}

const ProductCacheContext = createContext<ProductCacheContextType>({
  products: new Map(),
  addProducts: () => {},
  getProduct: () => undefined,
  hasAllProducts: false,
  setHasAllProducts: () => {},
});

export function useProductCache() {
  return useContext(ProductCacheContext);
}

export function ProductCacheProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Map<string, CachedProduct>>(new Map());
  const [hasAllProducts, setHasAllProducts] = useState(false);
const [missingSlugs, setMissingSlugs] = useState<Set<string>>(new Set());

const markMissing = useCallback((slug: string) => {
  setMissingSlugs(prev => new Set(prev).add(slug));
}, []);
  const addProducts = useCallback((newProducts: CachedProduct[]) => {
    setProducts(prev => {
      const next = new Map(prev);
      newProducts.forEach(p => {
        next.set(p.slug, p);
        next.set(p.id, p);
      });
      return next;
    });
  }, []);

  const getProduct = useCallback((slug: string) => {
    return products.get(slug);
  }, [products]);

  return (
    <ProductCacheContext.Provider value={{  products, addProducts, getProduct,
  hasAllProducts, setHasAllProducts,
  missingSlugs, markMissing,}}>
      {children}
    </ProductCacheContext.Provider>
  );
}