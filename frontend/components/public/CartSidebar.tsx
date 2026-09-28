'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useCart } from '@/components/providers/CartProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  X, Minus, Plus, ShoppingBag, Trash2, ArrowLeft, Loader2,
} from 'lucide-react';
import Image from 'next/image';
import { Link } from '@/navigation';
import { usePublicPOST } from '@/lib/api/hooks';
import { PhoneInput } from '@/components/public/PhoneInput';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { RateLimitError } from '@/lib/api/types';
import { formatTND } from '@/lib/utils/currency';

/* ── Validation schema ── */
const checkoutSchema = (t: any) =>
  z.object({
    name: z.string().min(2, t('form.errors.nameMin')),
    email: z.string().email(t('form.errors.emailInvalid')).optional().or(z.literal('')),
    phone: z.string().optional().refine(
  (val) => !val || val.length < 6 || isValidPhoneNumber(val, { defaultCountry: 'TN' }),
  { message: t('form.errors.phoneInvalid') }
),
    address: z.string().min(5, t('form.errors.addressMin')),
    notes: z.string().optional(),
  });

type CheckoutFormData = z.infer<ReturnType<typeof checkoutSchema>>;

export function CartSidebar() {
  const t = useTranslations('cart');
  const {
    items,
    updateQuantity,
    removeItem,
    totalPrice,
    isOpen,
    closeCart,
    clearCart,
  } = useCart();

  const [step, setStep] = useState<'cart' | 'checkout'>('cart');
  const { mutate: placeOrder, loading } = usePublicPOST('/orders', {
    showToast: false,
  });

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema(t)),
    defaultValues: { name: '', email: '', phone: '', address: '', notes: '' },
    mode: 'onBlur',
  });
const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
const markTouched = (field: string) => setTouchedFields(prev => ({ ...prev, [field]: true }));
  const onSubmitCheckout = async (data: CheckoutFormData) => {
    const orderData = {
      ...data,
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
      total: totalPrice,
    };

    try {
      await placeOrder(orderData);
      toast.success(t('orderSuccess'));
      clearCart();
      reset();
      setStep('cart');
      closeCart();
    } catch (err: any) {
      if (err instanceof RateLimitError) {
        toast.error(t('form.rateLimit', { seconds: err.retryAfter }));
      } else {
        toast.error(t('form.error'));
      }
    }
  };
 
  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 transition-opacity duration-300"
          onClick={closeCart}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[430px] max-w-full bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              {step === 'checkout' && (
                <button
                  onClick={() => setStep('cart')}
                  className="p-2 hover:bg-gray-100 rounded-full transition"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <h2 className="text-2xl font-black text-dark">
                {step === 'cart' ? t('title') : t('checkoutTitle')}
              </h2>
            </div>
            <button
              onClick={closeCart}
              className="p-2 hover:bg-gray-100 rounded-full transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart view */}
          {step === 'cart' && (
            <>
              {items.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center px-6 text-gray-500">
                  <ShoppingBag className="w-20 h-20 mb-6 text-gray-300" />
                  <p className="text-lg font-medium">{t('empty')}</p>
                  <Link href="/store" onClick={closeCart}>
                    <Button variant="link" className="mt-4 text-primary font-bold">
                      {t('continueShopping')}
                    </Button>
                  </Link>
                </div>
              ) : (
                <>
                  {/* Items */}
                  <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="flex gap-4 bg-gray-50 rounded-2xl p-4 items-center"
                      >
                        {/* Image */}
                        <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                          {item.image_url ? (
                            <Image
                              src={item.image_url}
                              alt={item.name}
                              width={80}
                              height={80}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-2xl font-bold">
                              {item.name.charAt(0)}
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-dark truncate">
                            {item.name}
                          </h4>
                          <p className="text-sm text-gray-500 mt-1">
  {formatTND(item.price)}
  {item.compareAtPrice && item.compareAtPrice > item.price && (
    <span className="text-xs text-gray-400 line-through ml-2">
      {formatTND(item.compareAtPrice)}
    </span>
  )}
</p>

                          {/* Quantity controls */}
                          <div className="flex items-center gap-2 mt-3">
                            <button
                              onClick={() =>
                                updateQuantity(item.id, item.quantity - 1)
                              }
                              className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-gray-200 hover:bg-gray-100 transition"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-8 text-center text-sm font-medium">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQuantity(item.id, item.quantity + 1)
                              }
                              className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-gray-200 hover:bg-gray-100 transition"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => removeItem(item.id)}
                              className="ml-auto text-red-500 hover:text-red-700 p-2 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="border-t border-gray-100 px-6 py-5">
                    <div className="flex justify-between items-center text-lg font-bold mb-5">
                      <span>{t('total')}</span>
                      <span className="text-primary">{formatTND(totalPrice)}</span>
                    </div>
                    <Button
                      onClick={() => setStep('checkout')}
                      className="w-full py-6 text-lg font-bold rounded-2xl bg-primary hover:bg-primary/90 text-white shadow-lg hover:shadow-xl transition-all"
                    >
                      {t('checkout')}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Checkout form */}
          {step === 'checkout' && (
            <form
              onSubmit={handleSubmit(onSubmitCheckout)}
              className="flex-1 overflow-y-auto px-6 py-6 space-y-5"
            >
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">
                  {t('form.name')}
                </label>
                <Input {...register('name')} className="rounded-xl focus:ring-0 focus:ring-offset-0 " placeholder={t('form.namePlaceholder')} />

                {errors.name && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">
                  {t('form.email')}
                </label>
               <Input type="email" {...register('email')} className="rounded-xl focus:ring-0 focus:ring-offset-0 " placeholder={t('form.emailPlaceholder')} />

                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">
                  {t('form.phone')}
                </label>
               <Controller
  name="phone"
  control={control}
  render={({ field }) => (
    <PhoneInput
      value={field.value || ''}
      onChange={field.onChange}
      onBlur={() => {
        field.onBlur();
        markTouched('phone');
      }}
      error={touchedFields.phone && errors.phone?.message}
      placeholder={t('form.phonePlaceholder')}
    />
  )}
/>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">
                  {t('form.address')}
                </label>
                <Textarea {...register('address')} className="rounded-xl focus:ring-0 focus:ring-offset-0" placeholder={t('form.addressPlaceholder')} />

                {errors.address && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.address.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">
                  {t('form.notes')}
                </label>
                <Textarea {...register('notes')} className="rounded-xl focus:ring-0 focus:ring-offset-0" placeholder={t('form.notesPlaceholder')} />

              </div>

              <div className="border-t border-gray-100 pt-5">
                <div className="flex justify-between text-lg font-bold mb-5">
                  <span>{t('total')}</span>
                  <span className="text-primary">{formatTND(totalPrice)}</span>
                </div>
                <Button
                  type="submit"
                  disabled={loading || !isValid}
                  className="w-full py-6 text-lg font-bold rounded-2xl bg-primary hover:bg-primary/90 text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {t('form.submitting')}
                    </span>
                  ) : (
                    t('form.placeOrder')
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}