'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { usePublicGETSWR } from '@/lib/api/hooks';
import { useLocale, useTranslations } from 'next-intl';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Play, Pause, ChevronLeft, ChevronRight, X, FolderOpen, Calendar, Loader2 } from 'lucide-react';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

/* ── Types ── */
interface GalleryItem {
  id: string; title_fr: string; title_ar: string;
  media_url: string; media_type: 'image' | 'gif' | 'video';
  is_gif?: boolean; category_id: string; created_at: string;
}
interface Category {
  id: string; name_fr: string; name_ar: string;
  slug: string; parent_id: string | null;
}

/* ── Helpers ── */
function useGalleryData() {
  const [offset, setOffset] = useState(0);
  const [allItems, setAllItems] = useState<GalleryItem[]>([]);
  const [meta, setMeta] = useState<{
    categories: Category[]; total: number; categoryCounts: Record<string,number>; hasMore: boolean;
  } | null>(null);

  const endpoint = `/gallery/combined?limit=50&offset=${offset}`;
  const { data, loading, error, retry } = usePublicGETSWR<{
    categories: Category[]; items: GalleryItem[];
    total: number; categoryCounts: Record<string,number>; hasMore: boolean;
  }>(endpoint);

  useEffect(() => {
    if (!data) return;
    if (offset === 0) {
      setAllItems(data.items);
    } else {
      setAllItems(prev => [...prev, ...data.items]);
    }
    setMeta({
      categories: data.categories,
      total: data.total,
      categoryCounts: data.categoryCounts,
      hasMore: data.hasMore,
    });
  }, [data, offset]);

  const loadMore = useCallback(() => {
    setOffset(prev => prev + 50);
  }, []);

  return { items: allItems, meta, loading, error, retry, loadMore, hasMore: meta?.hasMore ?? false };
}

/* ── Recursively collect category IDs (for filtering) ── */
function collectCategoryIds(slug: string, categories: Category[]): string[] {
  const cat = categories.find(c => c.slug === slug);
  if (!cat) return [];
  const ids = [cat.id];
  const children = categories.filter(c => c.parent_id === cat.id);
  for (const child of children) {
    ids.push(...collectCategoryIds(child.slug, categories));
  }
  return ids;
}

export default function GalleryPageClient() {
  const t = useTranslations('gallery');
  const locale = useLocale();
  const { items, meta, loading, error, retry, loadMore, hasMore } = useGalleryData();

  const [activeParent, setActiveParent] = useState<string>('all');
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [slideshowActive, setSlideshowActive] = useState(false);
  const [cycleStartIndex, setCycleStartIndex] = useState<number | null>(null);
  const autoplayRef = useRef<NodeJS.Timeout | null>(null);

  const categories = meta?.categories ?? [];
  const categoryCounts = meta?.categoryCounts ?? {};
const hasMovedRef = useRef(false);
  // Ordered parent categories (all, latest, then others)
  const orderedParents = useMemo(() => {
    const topLevel = categories.filter(c => !c.parent_id);
    const all = topLevel.find(c => c.slug === 'all');
    const latest = topLevel.find(c => c.slug === 'latest');
    const others = topLevel
      .filter(c => c.slug !== 'all' && c.slug !== 'latest')
      .sort((a, b) => (a.order_index ?? 99) - (b.order_index ?? 99));
    return [...(all ? [all] : []), ...(latest ? [latest] : []), ...others];
  }, [categories]);

  const parentCat = categories.find(c => c.slug === activeParent);
  const subCats = useMemo(
    () => categories.filter(c => c.parent_id === parentCat?.id),
    [categories, parentCat?.id]
  );

  // Locally filtered items
  const filteredItems = useMemo(() => {
    if (!items.length) return [];
    if (activeSub) {
      const ids = collectCategoryIds(activeSub, categories);
      return items.filter(item => ids.includes(item.category_id));
    }
    if (activeParent === 'all') return items;
    if (activeParent === 'latest') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      return items.filter(item => item.created_at >= thirtyDaysAgo);
    }
    const ids = collectCategoryIds(activeParent, categories);
    return items.filter(item => ids.includes(item.category_id));
  }, [items, activeParent, activeSub, categories]);

  // Do we need "Load more" for this tab?
  const effectiveSlug = activeSub || activeParent;
  const totalForTab = categoryCounts[effectiveSlug] ?? 0;
  const needMoreForTab = filteredItems.length < totalForTab && hasMore;

  // Lightbox
  const selectedMedia = selectedIndex !== null ? filteredItems[selectedIndex] : null;

  const openLightbox = (index: number) => {
    setSelectedIndex(index);
    setSlideshowActive(false);
    setHasCycled(false);
    setCycleStartIndex(index);
  };

  const closeLightbox = () => {
    setSelectedIndex(null);
    setSlideshowActive(false);
    if (autoplayRef.current) clearInterval(autoplayRef.current);
  };

  const goToPrev = () => setSelectedIndex(p => (p === null ? 0 : p === 0 ? filteredItems.length - 1 : p - 1));
  const goToNext = () => setSelectedIndex(p => (p === null ? 0 : p === filteredItems.length - 1 ? 0 : p + 1));

  // Slideshow – one full cycle
  const toggleSlideshow = () => {
  setSlideshowActive(prev => {
    if (prev) {
      if (autoplayRef.current) clearInterval(autoplayRef.current);
      return false;
    } else {
      const start = selectedIndex ?? 0;
      setCycleStartIndex(start);
      hasMovedRef.current = false;   // ← reset movement flag
      return true;
    }
  });
};

 const advanceSlide = useCallback(() => {
  if (selectedIndex === null || cycleStartIndex === null || filteredItems.length <= 1) {
    setSlideshowActive(false);
    return;
  }
  setSelectedIndex(prev => {
    if (prev === null) return cycleStartIndex;
    const next = prev + 1;
    if (next >= filteredItems.length) return 0;
    return next;
  });
  hasMovedRef.current = true;       // ← moved at least once
}, [selectedIndex, cycleStartIndex, filteredItems.length]);

  // Detect cycle completion
  useEffect(() => {
  if (
    slideshowActive &&
    cycleStartIndex !== null &&
    hasMovedRef.current &&            // only after moving
    selectedIndex === cycleStartIndex
  ) {
    // Completed one full cycle
    setSlideshowActive(false);
    if (autoplayRef.current) clearInterval(autoplayRef.current);
  }
}, [selectedIndex, cycleStartIndex, slideshowActive]);
  
  // Auto‑advance
  useEffect(() => {
    if (slideshowActive && filteredItems.length > 1) {
      autoplayRef.current = setInterval(advanceSlide, 3000);
    }
    return () => { if (autoplayRef.current) clearInterval(autoplayRef.current); };
  }, [slideshowActive, advanceSlide, filteredItems.length]);

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (selectedIndex === null) return;
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedIndex, filteredItems.length]);

  // States
  if (!meta && loading) return <LoadingSpinner />;
  if (error && !items.length) return <RetryableError error={error} onRetry={retry} />;

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 md:py-16">
      <ScrollReveal>
        <h1 className="text-5xl md:text-7xl font-black text-center mb-8">{t('title')}</h1>
      </ScrollReveal>

      {/* Parent tabs */}
      <div className="flex justify-center gap-3 mb-4 flex-wrap">
        {orderedParents.map(cat => (
          <button
            key={cat.id}
            onClick={() => { setActiveParent(cat.slug); setActiveSub(null); }}
            className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all ${
              activeParent === cat.slug ? 'bg-primary text-white shadow-lg' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {locale === 'fr' ? cat.name_fr : cat.name_ar}
            {categoryCounts[cat.slug] !== undefined && (
              <span className="ml-2 text-xs opacity-70">({categoryCounts[cat.slug]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Subcategory tabs */}
      {subCats.length > 0 && (
        <div className="flex justify-center gap-2 mb-8 flex-wrap">
          <button
            onClick={() => setActiveSub(null)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
              !activeSub ? 'bg-primary/20 text-primary' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
           {t('allSub')}
          </button>
          {subCats.map(sub => (
            <button
              key={sub.id}
              onClick={() => setActiveSub(sub.slug)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                activeSub === sub.slug ? 'bg-primary/20 text-primary' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {locale === 'fr' ? sub.name_fr : sub.name_ar}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-20">
          <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">{t('empty')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredItems.map((item, index) => {
              const title = locale === 'fr' ? item.title_fr : item.title_ar;
              const dateStr = item.created_at
                ? new Date(item.created_at).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'ar-TN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })
                : '';
              return (
                <div
                  key={item.id}
                  onClick={() => openLightbox(index)}
                  className="cursor-pointer group overflow-hidden rounded-3xl aspect-square relative bg-gray-100"
                >
                  {item.media_type === 'video' ? (
                    <div className="w-full h-full relative">
                      <video src={item.media_url} className="w-full h-full object-cover" muted />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Play className="w-10 h-10 text-white fill-white" />
                      </div>
                    </div>
                  ) : (
                    <img
                      src={item.media_url}
                      alt={title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                    <span className="text-white font-semibold text-sm line-clamp-2">{title}</span>
                    {dateStr && (
                      <span className="text-white/70 text-xs mt-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {dateStr}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load more button */}
          {needMoreForTab && (
            <div className="flex justify-center mt-8">
              <button
                onClick={loadMore}
                disabled={loading}
                className="px-6 py-3 bg-primary text-white rounded-full font-bold hover:bg-primary/90 disabled:opacity-50 transition flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('loadMore')}
              </button>
            </div>
          )}
        </>
      )}

      {/* Lightbox */}
      {selectedMedia && (
        <Dialog open onOpenChange={closeLightbox}>
          <DialogContent className="max-w-5xl p-0 bg-black border-0 rounded-3xl overflow-hidden">
            <VisuallyHidden>
              <DialogTitle>{selectedMedia.title_fr || selectedMedia.title_ar}</DialogTitle>
            </VisuallyHidden>

            <button onClick={closeLightbox} className="absolute top-4 right-4 z-20 w-8 h-8 bg-white/10 backdrop-blur rounded-full flex items-center justify-center text-white hover:bg-white/20 transition">
              <X className="w-4 h-4" />
            </button>

            {filteredItems.length > 1 && (
              <button onClick={toggleSlideshow} className="absolute top-4 left-4 z-20 w-8 h-8 bg-white/10 backdrop-blur rounded-full flex items-center justify-center text-white hover:bg-white/20 transition">
                {slideshowActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
            )}

            <div className="relative flex items-center justify-center min-h-[70vh]">
              {filteredItems.length > 1 && (
                <>
                  <button onClick={goToPrev} className="absolute left-4 z-10 w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center text-white hover:bg-white/20 transition">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button onClick={goToNext} className="absolute right-4 z-10 w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center text-white hover:bg-white/20 transition">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}

              {selectedMedia.media_type === 'video' ? (
                <video key={selectedMedia.id} src={selectedMedia.media_url} controls autoPlay className="gallery-image-animate max-h-[80vh] max-w-full object-contain" />
              ) : (
                <img key={selectedMedia.id} src={selectedMedia.media_url} alt={selectedMedia.title_fr || selectedMedia.title_ar} className="gallery-image-animate max-h-[80vh] max-w-full object-contain" />
              )}
            </div>

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
              <p className="text-white font-semibold">{locale === 'fr' ? selectedMedia.title_fr : selectedMedia.title_ar}</p>
              {filteredItems.length > 1 && (
                <p className="text-white/60 text-sm mt-1">{selectedIndex! + 1} / {filteredItems.length}</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}