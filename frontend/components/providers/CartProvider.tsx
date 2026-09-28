'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useCookieConsent } from './CookieConsentProvider';
import Cookies from 'js-cookie';
import { useProductCache } from './ProductCacheProvider';
import { publicAPI } from '@/lib/api/client';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  compareAtPrice?: number;   // original price if discounted
  image_url: string;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  isOpen: boolean;
  toggleCart: () => void;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextType>({
  items: [],
  addItem: () => {},
  updateQuantity: () => {},
  removeItem: () => {},
  clearCart: () => {},
  totalItems: 0,
  totalPrice: 0,
  isOpen: false,
  toggleCart: () => {},
  openCart: () => {},
  closeCart: () => {},
});

export function useCart() {
  return useContext(CartContext);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
const { consent, showBanner } = useCookieConsent();
const { getProduct, hasAllProducts } = useProductCache();

  // Load cart from storage on mount
  useEffect(() => {
    if (consent === 'accepted') {
      const saved = Cookies.get('cart');
      if (saved) {
        try {
          setItems(JSON.parse(saved));
        } catch {}
      }
    } else {
      const saved = sessionStorage.getItem('cart');
      if (saved) {
        try {
          setItems(JSON.parse(saved));
        } catch {}
      }
    }
  }, [consent]);

  // Save cart to storage whenever items change
  useEffect(() => {
    if (consent === 'accepted') {
      Cookies.set('cart', JSON.stringify(items), { expires: 7 });
    } else {
      sessionStorage.setItem('cart', JSON.stringify(items));
    }
  }, [items, consent]);

  const addItem = useCallback((item: CartItem) => {
    if (consent === 'refused') {
    showBanner();
  }
    setItems(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i);
      }
      return [...prev, item];
    });
    setIsOpen(true); // open cart sidebar after adding
  }, [consent, showBanner]);
useEffect(() => {
  if (items.length === 0) return;
  
  if (hasAllProducts) {
    setItems(prev => prev.filter(item => !!getProduct(item.id)));
    return;
  }
  
  // Check which items ARE in the partial cache already
  const uncached = items.filter(item => !getProduct(item.id));
  if (uncached.length === 0) {
    // All cart items found in cache, nothing to validate
    return;
  }
  
  // Only ask backend about the ones NOT in cache
  const ids = uncached.map(item => item.id);
  publicAPI<{ existingIds: string[] }>('/products/check', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  }).then(({ existingIds }) => {
    setItems(prev => prev.filter(item => 
      getProduct(item.id) || existingIds.includes(item.id)
    ));
  }).catch(() => {});
}, [consent]); // run when consent resolves so items are loaded
  const updateQuantity = useCallback((id: string, quantity: number) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, quantity) } : i));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const toggleCart = () => setIsOpen(prev => !prev);
  const openCart = () => setIsOpen(true);
  const closeCart = () => setIsOpen(false);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, updateQuantity, removeItem, clearCart, totalItems, totalPrice, isOpen, toggleCart, openCart, closeCart }}>
      {children}
    </CartContext.Provider>
  );
}