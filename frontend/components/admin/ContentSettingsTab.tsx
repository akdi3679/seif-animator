'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR, useAdminPUT } from '@/lib/api/hooks';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { RateLimitError } from '@/lib/api/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { uploadToCloudinary } from '@/lib/cloudinary-upload';
import Image from 'next/image';
import { translateBatch } from '@/lib/utils/translate';
import { useWeather } from '@/components/providers/AdminWeatherProvider';
import { cn } from '@/lib/utils';
import { Pencil, ImageIcon, Loader2, MapPin, Wifi } from 'lucide-react';

const siteDataSchema = (t: any) => z.object({
  name_fr: z.string().min(1, t('validation.nameFrRequired')),
  name_ar: z.string().min(1, t('validation.nameArRequired')),
  slogans_fr: z.string().optional(),
  slogans_ar: z.string().optional(),
  logo_url: z.string().url().optional().or(z.literal('')),
  favicon_url: z.string().url().optional().or(z.literal('')),
})
.refine((d) => countSlogans(d.slogans_fr || '') <= 2 && countSlogans(d.slogans_ar || '') <= 2,
  { message: t('slogansMaxTwo') })
.refine((d) => countSlogans(d.slogans_fr || '') === countSlogans(d.slogans_ar || ''),
  { message: t('slogansMustMatch') });


const siteImageSchema = (t: any) => z.object({
  image_url: z.string().url().min(1, t('validation.imageUrlRequired')),
  alt_fr: z.string().min(1, t('validation.altFrRequired')),
  alt_ar: z.string().min(1, t('validation.altArRequired')),
});
const countSlogans = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean).length;
export default function ContentSettingsTab() {
  const t = useTranslations('admin.settings');
  const hasFetched = useRef(false);
const [logoPublicId, setLogoPublicId] = useState<string | null>(null);
const [faviconPublicId, setFaviconPublicId] = useState<string | null>(null);
  const { data: siteData, mutate: mutateSiteData, refresh: refreshSiteData, isValidating: siteDataLoading, error: siteDataError, retry: siteDataRetry, isRetrying: siteDataRetrying } = useAdminGETSWR<any>('/site-data', { manual: true });
const { data: images, mutate: mutateImages, refresh: refreshImages, isValidating: imagesLoading, error: imagesError, retry: imagesRetry, isRetrying: imagesRetrying } = useAdminGETSWR<any[]>('/site-images', { manual: true });

  const [editing, setEditing] = useState<string | null>(null);
  const { trigger: saveSiteData, loading: savingData } = useAdminPUT('/site-data', { showToast: false });
  const { trigger: saveSiteImage, loading: savingImage } = useAdminPUT(() => `/site-images/${editing}`, { showToast: false });
const { mode, setMode, loading: weatherLoading, refreshWeather, lastGeo, geoLabel } = useWeather();
const [savingWeather, setSavingWeather] = useState(false);
const [translatingData, setTranslatingData] = useState(false);
const [translatingImage, setTranslatingImage] = useState(false);
  useEffect(() => {
    if (!hasFetched.current) { hasFetched.current = true; refreshSiteData(); refreshImages(); }
  }, [refreshSiteData, refreshImages]);

  const refreshAll = () => { refreshSiteData(); refreshImages(); refreshWeather(); };
  const initialLoading = !((siteData || siteDataError) && (images || imagesError));

  // ────────────── SITE DATA FORM (inline) ──────────────
  const dataForm = useForm({ resolver: zodResolver(siteDataSchema(t)), defaultValues: { name_fr: '', name_ar: '', logo_url: '', favicon_url: '', slogans_fr: '', slogans_ar: '' }, mode: 'onChange' });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
const [logoBlob, setLogoBlob] = useState<string | null>(null);
const [faviconBlob, setFaviconBlob] = useState<string | null>(null);

// derived previews — the file you just picked wins, otherwise the saved URL
const logoPreview = logoBlob || siteData?.logo_url || null;
const faviconPreview = faviconBlob || siteData?.favicon_url || null;
  const dataInitialized = useRef(false);
useEffect(() => {
  if (siteData && !dataInitialized.current) {
    dataInitialized.current = true;
    dataForm.reset({
      name_fr: siteData.name_fr || '',
      name_ar: siteData.name_ar || '',
      logo_url: siteData.logo_url || '',
      favicon_url: siteData.favicon_url || '',
      slogans_fr: Array.isArray(siteData.slogans_fr) ? siteData.slogans_fr.join(', ') : siteData.slogans_fr || '',
      slogans_ar: Array.isArray(siteData.slogans_ar) ? siteData.slogans_ar.join(', ') : siteData.slogans_ar || '',
    });
    setLogoPublicId(siteData.logo_public_id || null);
    setFaviconPublicId(siteData.favicon_public_id || null);
    // ❌ no setLogoPreview / setFaviconPreview here anymore
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [siteData]);
 const onLogoChange = (e: any) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  console.log('[preview] logo selected', url);      // ← to verify it fires
  setLogoFile(file);
  setLogoBlob(url);
  dataForm.setValue('logo_url', url, { shouldValidate: true });
};

const onFaviconChange = (e: any) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  console.log('[preview] favicon selected', url);   // ← to verify it fires
  setFaviconFile(file);
  setFaviconBlob(url);
  dataForm.setValue('favicon_url', url, { shouldValidate: true });
};

const handleSaveData = dataForm.handleSubmit(async (formData) => {
  let logo_url = formData.logo_url;
  let favicon_url = formData.favicon_url;
  let newLogoPid = logoPublicId;
  let newFaviconPid = faviconPublicId;

  // ① Cloudinary first — only for files that actually changed
  try {
    if (logoFile) { setUploadingLogo(true); const r = await uploadToCloudinary(logoFile); logo_url = r.url; newLogoPid = r.public_id; setUploadingLogo(false); }
    if (faviconFile) { setUploadingFavicon(true); const r = await uploadToCloudinary(faviconFile); favicon_url = r.url; newFaviconPid = r.public_id; setUploadingFavicon(false); }
  } catch {
    toast.error(t('uploadFailed')); setUploadingLogo(false); setUploadingFavicon(false); return;
  }

  try {
    // ② ONE Supabase update
    const updated = await saveSiteData({
      ...formData,
      logo_url, favicon_url,
      logo_public_id: newLogoPid,
      favicon_public_id: newFaviconPid,
      slogans_fr: formData.slogans_fr ? formData.slogans_fr.split(',').map((s: string) => s.trim()) : [],
      slogans_ar: formData.slogans_ar ? formData.slogans_ar.split(',').map((s: string) => s.trim()) : [],
    });

    // ③ Optimistic local cache — no refetch
    mutateSiteData(updated, false);
    setLogoFile(null); setFaviconFile(null);
setLogoBlob(null); setFaviconBlob(null);   
    setLogoPublicId(newLogoPid); setFaviconPublicId(newFaviconPid);
    setLogoFile(null); setFaviconFile(null);
    toast.success(t('saved'));
  } catch (err: any) {
    if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
    else toast.error(err.message || t('error'));
  }
});

  // ────────────── SITE IMAGE EDIT FORM (inline, in dialog) ──────────────
  const imageForm = useForm({ resolver: zodResolver(siteImageSchema(t)), defaultValues: { image_url: '', alt_fr: '', alt_ar: '' }, mode: 'onChange' });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (editing) {
      const img = images?.find((i: any) => i.name === editing);
      imageForm.reset({ image_url: img?.image_url || '', alt_fr: img?.alt_fr || '', alt_ar: img?.alt_ar || '' });
      setImagePreview(img?.image_url || null);
      setImageFile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const onImageChange = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
    imageForm.setValue('image_url', url, { shouldValidate: true });
  };

 const handleSaveImage = imageForm.handleSubmit(async (formData) => {
  if (!editing) return;
  const img = images?.find((i: any) => i.name === editing);
  let image_url = formData.image_url;
  let image_public_id = img?.image_public_id || null;

  if (imageFile) {
    setUploadingImage(true);
    try { const r = await uploadToCloudinary(imageFile); image_url = r.url; image_public_id = r.public_id; }
    catch { toast.error(t('uploadFailed')); setUploadingImage(false); return; }
    setUploadingImage(false);
  }

  try {
    const updated = await saveSiteImage({ image_url, image_public_id, alt_fr: formData.alt_fr, alt_ar: formData.alt_ar });
    // Optimistic: replace just this image in the cached list
    mutateImages((current: any[]) => (current || []).map(i => i.name === editing ? updated : i), false);
    toast.success(t('imageUpdated'));
    setEditing(null);
  } catch (err: any) {
    if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
    else toast.error(err.message || t('error'));
  }
});
 const handleToggleWeather = async () => {
  const newMode = mode === 'ip' ? 'geo' : 'ip';
  if (newMode === mode) return;
  setSavingWeather(true);
  try {
    if (newMode === 'geo') {
      let coords = null;
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error('no geo'));
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, maximumAge: 0, enableHighAccuracy: true });
        });
        coords = { lat: position.coords.latitude, lng: position.coords.longitude };
      } catch {
        coords = lastGeo;                       // fresh fix failed → reuse last saved geo
      }
      if (coords) { await setMode('geo', coords); toast.success(t('saved')); }
      else toast.error(t('geoUnavailable'));
    } else {
      await setMode('ip');
      toast.success(t('saved'));
    }
  } catch (err: any) {
    toast.error(err.message || t('geoUnavailable'));
  } finally {
    setSavingWeather(false);
  }
};
// ── Translate: Site Data (name + slogans) ──
const dWatch = dataForm.watch();
const canTranslateData =
  (dWatch.name_fr && !dWatch.name_ar) ||
  (dWatch.name_ar && !dWatch.name_fr) ||
  (dWatch.slogans_fr && !dWatch.slogans_ar) ||
  (dWatch.slogans_ar && !dWatch.slogans_fr);

const handleTranslateData = async () => {
  const values = dataForm.getValues();
  const missing: any[] = [];
  if (values.name_fr && !values.name_ar) missing.push({ field: 'name_ar', text: values.name_fr, targetLang: 'ar', sourceLang: 'fr' });
  if (values.name_ar && !values.name_fr) missing.push({ field: 'name_fr', text: values.name_ar, targetLang: 'fr', sourceLang: 'ar' });
  if (values.slogans_fr && !values.slogans_ar) missing.push({ field: 'slogans_ar', text: values.slogans_fr, targetLang: 'ar', sourceLang: 'fr' });
  if (values.slogans_ar && !values.slogans_fr) missing.push({ field: 'slogans_fr', text: values.slogans_ar, targetLang: 'fr', sourceLang: 'ar' });
  if (missing.length === 0) return;
  setTranslatingData(true);
  try {
    const groups: Record<string, any[]> = {};
    missing.forEach(b => { if (!groups[b.sourceLang]) groups[b.sourceLang] = []; groups[b.sourceLang].push(b); });
    for (const group of Object.values(groups)) {
      const translated = await translateBatch(group.map(b => b.text), group[0].targetLang, group[0].sourceLang);
      group.forEach((b, idx) => dataForm.setValue(b.field as any, translated[idx], { shouldValidate: true }));
    }
  } catch { toast.error(t('translationFailed')); }
  setTranslatingData(false);
};

// ── Translate: Site Image (alt text) ──
const iWatch = imageForm.watch();
const canTranslateImage =
  (iWatch.alt_fr && !iWatch.alt_ar) ||
  (iWatch.alt_ar && !iWatch.alt_fr);

const handleTranslateImage = async () => {
  const values = imageForm.getValues();
  const missing: any[] = [];
  if (values.alt_fr && !values.alt_ar) missing.push({ field: 'alt_ar', text: values.alt_fr, targetLang: 'ar', sourceLang: 'fr' });
  if (values.alt_ar && !values.alt_fr) missing.push({ field: 'alt_fr', text: values.alt_ar, targetLang: 'fr', sourceLang: 'ar' });
  if (missing.length === 0) return;
  setTranslatingImage(true);
  try {
    const groups: Record<string, any[]> = {};
    missing.forEach(b => { if (!groups[b.sourceLang]) groups[b.sourceLang] = []; groups[b.sourceLang].push(b); });
    for (const group of Object.values(groups)) {
      const translated = await translateBatch(group.map(b => b.text), group[0].targetLang, group[0].sourceLang);
      group.forEach((b, idx) => imageForm.setValue(b.field as any, translated[idx], { shouldValidate: true }));
    }
  } catch { toast.error(t('translationFailed')); }
  setTranslatingImage(false);
};
  if (initialLoading) return <LoadingSpinner />;

  const dErr = dataForm.formState.errors;
  const iErr = imageForm.formState.errors;
const frCount = countSlogans(dataForm.watch('slogans_fr') || '');
const arCount = countSlogans(dataForm.watch('slogans_ar') || '');
  return (
    <div className="space-y-8">
      {/* ONE shared header + refresh */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('contentTitle')}</h2>
        <RefreshButton onRefresh={refreshAll} loading={siteDataLoading || imagesLoading} />
      </div>

      {/* ══════════ SITE DATA SECTION ══════════ */}
      <section className="space-y-4">
        <h3 className="font-semibold">{t('siteDataTitle')}</h3>
        {siteDataError ? (
          <RetryableError error={siteDataError} onRetry={siteDataRetry} isRetrying={siteDataRetrying} />
        ) : siteData ? (
          <form onSubmit={handleSaveData} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('nameFr')}</label>
                <Input {...dataForm.register('name_fr')} />
                {dErr.name_fr && <p className="text-red-500 text-xs">{dErr.name_fr.message as string}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('nameAr')}</label>
                <Input {...dataForm.register('name_ar')} />
                {dErr.name_ar && <p className="text-red-500 text-xs">{dErr.name_ar.message as string}</p>}
              </div>
            </div>

            {/* Logo (upload / replace) */}
            <div>
              <label className="block text-sm font-medium mb-1">{t('logo')}</label>
              {logoPreview ? (
                <div className="relative inline-block">
                  <Image src={logoPreview} alt="Logo" width={90} height={90} className="rounded-lg object-contain border" unoptimized />
                  <label className="absolute bottom-1 right-1 bg-white/90 rounded-full p-1 shadow cursor-pointer hover:bg-white" title={t('replaceImage')}>
                    <ImageIcon className="w-4 h-4 text-primary" />
                    <input type="file" accept="image/*" className="hidden" onChange={onLogoChange} />
                  </label>
                </div>
              ) : (
                <label className="cursor-pointer inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  <ImageIcon className="w-4 h-4" /> {t('chooseImage')}
                  <input type="file" accept="image/*" className="hidden" onChange={onLogoChange} />
                </label>
              )}
              <input type="hidden" {...dataForm.register('logo_url')} />
              {dErr.logo_url && <p className="text-red-500 text-xs">{dErr.logo_url.message as string}</p>}
            </div>

            {/* Favicon (upload / replace) */}
            <div>
              <label className="block text-sm font-medium mb-1">{t('favicon')}</label>
             {faviconPreview ? (
  <div className="relative inline-block">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={faviconPreview} alt="Favicon" width={44} height={44} className="rounded object-contain border bg-white" style={{ width: 44, height: 44 }} />
    <label className="absolute bottom-0 right-0 bg-white/90 rounded-full p-1 shadow cursor-pointer hover:bg-white" title={t('replaceImage')}>
      <ImageIcon className="w-3.5 h-3.5 text-primary" />
      <input type="file" accept="image/*" className="hidden" onChange={onFaviconChange} />
    </label>
  </div>
) : (
  <label className="cursor-pointer inline-flex items-center gap-1 text-sm text-primary hover:underline">
    <ImageIcon className="w-4 h-4" /> {t('chooseImage')}
    <input type="file" accept="image/*" className="hidden" onChange={onFaviconChange} />
  </label>
)}
              <input type="hidden" {...dataForm.register('favicon_url')} />
              {dErr.favicon_url && <p className="text-red-500 text-xs">{dErr.favicon_url.message as string}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">{t('slogansFr')}</label>
              <Textarea placeholder={t('slogansPlaceholder')} {...dataForm.register('slogans_fr')} />
              <p className="text-xs text-gray-400 mt-1">{frCount} / 2 · {t('slogansHint')}</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('slogansAr')}</label>
              <Textarea placeholder={t('slogansPlaceholder')} {...dataForm.register('slogans_ar')} />
              {dataForm.formState.errors.slogans_fr && <p className="text-red-500 text-xs">{dataForm.formState.errors.slogans_fr.message as string}</p>}
            </div>

            <div className="flex gap-2 justify-end">
  {canTranslateData && (
    <Button type="button" variant="outline" onClick={handleTranslateData} disabled={translatingData}>
      {translatingData ? t('translating') : t('translate')}
    </Button>
  )}
  <Button type="submit" disabled={!dataForm.formState.isValid || savingData || uploadingLogo || uploadingFavicon}>
    {savingData || uploadingLogo || uploadingFavicon ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
    {t('save')}
  </Button>
</div>
          </form>
        ) : null}
      </section>

      {/* ══════════ SITE IMAGES SECTION ══════════ */}
      <section className="space-y-4">
        <h3 className="font-semibold">{t('siteImagesTitle')}</h3>
        {imagesError ? (
          <RetryableError error={imagesError} onRetry={imagesRetry} isRetrying={imagesRetrying} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {images?.map((img: any) => (
              <div key={img.name} className="bg-white rounded-2xl border p-4 flex flex-col items-center">
                <p className="font-medium text-sm mb-2">{img.name}</p>
                {img.image_url ? (
                  <Image src={img.image_url} alt={img.alt_fr || img.name} width={200} height={150} className="rounded-lg object-cover" unoptimized />
                ) : (
                  <div className="w-full h-32 bg-gray-100 flex items-center justify-center rounded-lg">
                    <ImageIcon className="w-8 h-8 text-gray-400" />
                  </div>
                )}
                {/* Replace only — no delete */}
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditing(img.name)}>
                  <Pencil className="w-4 h-4 mr-1" /> {t('edit')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
{/* ══════════ WEATHER SECTION ══════════ */}
<section className="space-y-4">
  <h3 className="font-semibold">{t('weatherTitle')}</h3>
  <div className="bg-white rounded-2xl border p-4">
    <div className="flex items-center gap-3">
      <span className={cn('text-sm', mode === 'ip' ? 'font-semibold text-primary' : 'text-gray-500')}>
        <Wifi className="w-4 h-4 inline mr-1" />
        {t('ipBased')}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={mode === 'geo'}
        onClick={handleToggleWeather}
        disabled={savingWeather || weatherLoading}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          mode === 'geo' ? 'bg-primary' : 'bg-gray-300'
        )}
      >
        <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', mode === 'geo' ? 'translate-x-6' : 'translate-x-1')} />
      </button>
      {geoLabel && (
  <span className="text-xs text-gray-400 inline-flex items-center gap-1">
    <MapPin className="w-3 h-3" /> {geoLabel}
  </span>
)}
      <span className={cn('text-sm', mode === 'geo' ? 'font-semibold text-primary' : 'text-gray-500')}>
        <MapPin className="w-4 h-4 inline mr-1" />
        {t('geoBased')}
      </span>
    </div>
    {(savingWeather || weatherLoading) && <p className="text-sm text-gray-500 mt-2">{t('saving')}</p>}
  </div>
</section>
      {/* ══════════ SITE IMAGE EDIT DIALOG (inline form) ══════════ */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle>{t('editImage')} – {editing}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveImage} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('image')}</label>
              {imagePreview ? (
                <div className="relative inline-block">
                  <Image src={imagePreview} alt="Preview" width={200} height={130} className="rounded-lg object-cover" unoptimized />
                  <label className="absolute bottom-1 right-1 bg-white/90 rounded-full p-1.5 shadow cursor-pointer hover:bg-white" title={t('replaceImage')}>
                    <ImageIcon className="w-4 h-4 text-primary" />
                    <input type="file" accept="image/*" className="hidden" onChange={onImageChange} />
                  </label>
                </div>
              ) : (
                <label className="cursor-pointer inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  <ImageIcon className="w-4 h-4" /> {t('chooseImage')}
                  <input type="file" accept="image/*" className="hidden" onChange={onImageChange} />
                </label>
              )}
              <input type="hidden" {...imageForm.register('image_url')} />
              {iErr.image_url && <p className="text-red-500 text-xs">{iErr.image_url.message as string}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('altFr')}</label>
              <Input {...imageForm.register('alt_fr')} />
              {iErr.alt_fr && <p className="text-red-500 text-xs">{iErr.alt_fr.message as string}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('altAr')}</label>
              <Input {...imageForm.register('alt_ar')} />
              {iErr.alt_ar && <p className="text-red-500 text-xs">{iErr.alt_ar.message as string}</p>}
            </div>
           <div className="flex gap-2 justify-end">
  {canTranslateImage && (
    <Button type="button" variant="outline" onClick={handleTranslateImage} disabled={translatingImage}>
      {translatingImage ? t('translating') : t('translate')}
    </Button>
  )}
  <Button type="submit" disabled={!imageForm.formState.isValid || savingImage || uploadingImage || !imagePreview}>
    {savingImage || uploadingImage ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
    {t('save')}
  </Button>
</div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}