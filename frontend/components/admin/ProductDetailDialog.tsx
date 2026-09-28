import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import Image from 'next/image';

export function ProductDetailDialog({ product, open, onOpenChange, t, categories }: any) {
  if (!product) return null;

  const detail = product;

  // Build full category path
  const getCategoryPath = (cat: any) => {
    if (!cat) return '—';
    if (cat.parent_id && categories) {
      const parent = categories.find((c: any) => c.id === cat.parent_id);
      if (parent) return `${parent.name_fr} › ${cat.name_fr}`;
    }
    return cat.name_fr;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-2xl p-0">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10 rounded-t-xl">
          <DialogTitle className="text-lg font-bold m-0">
            {t('productDetail')} – {detail.name_fr || detail.name_ar}
          </DialogTitle>
          <button onClick={() => onOpenChange(false)} className="p-1 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-6">
          <section className="bg-gray-50 rounded-2xl p-5">
            <div className="flex gap-6">
              {detail.image_url ? (
                <Image
                  src={detail.image_url}
                  alt={detail.name_fr}
                  width={120}
                  height={120}
                  className="rounded-xl object-cover"
                  unoptimized
                />
              ) : (
                <div className="w-24 h-24 bg-gray-200 rounded-xl flex items-center justify-center text-gray-400">
                  —
                </div>
              )}
              <div className="space-y-2">
                <h3 className="font-bold text-xl">{detail.name_fr}</h3>
                <p className="text-gray-500">{detail.name_ar}</p>
                <p className="text-lg font-black text-primary">{detail.price} TND</p>
                {detail.discount_percentage > 0 && (
                  <span className="bg-green-100 text-green-700 text-xs px-3 py-1 rounded-full">
                    -{detail.discount_percentage}%
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="bg-gray-50 rounded-2xl p-5 grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-400">{t('category')}</span><p className="font-medium">{getCategoryPath(detail.ProductCategory)}</p></div>
            <div><span className="text-gray-400">{t('stock')}</span><p className="font-medium">{detail.stock_quantity ?? '—'}</p></div>
            <div><span className="text-gray-400">{t('recommended')}</span><p className="font-medium">{detail.is_recommended ? t('yes') : t('no')}</p></div>
            <div><span className="text-gray-400">{t('limited')}</span><p className="font-medium">{detail.is_limited ? t('yes') : t('no')}</p></div>
            <div className="col-span-2"><span className="text-gray-400">{t('description')}</span><p className="font-medium">{detail.description_fr || '—'}</p></div>
          </section>

          {detail.ProductImage?.length > 0 && (
            <section className="bg-gray-50 rounded-2xl p-5">
              <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {t('additionalImages')}
              </h4>
              <div className="flex flex-wrap gap-3">
                {detail.ProductImage.map((img: any) => (
                  <Image
                    key={img.id}
                    src={img.url}
                    alt=""
                    width={80}
                    height={80}
                    className="rounded-lg object-cover"
                    unoptimized
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}