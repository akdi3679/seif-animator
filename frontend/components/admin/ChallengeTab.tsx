'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR, useAdminPUT } from '@/lib/api/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { toast } from 'sonner';
import { RateLimitError } from '@/lib/api/types';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { translateBatch } from '@/lib/utils/translate';
function isValidHTML(html: string): boolean {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    // If the parser encountered a fatal error, it inserts a <parsererror> element
    if (doc.querySelector('parsererror')) return false;
    // Re-serialize the body content and compare with the original
    const serialized = doc.body.innerHTML.replace(/\s+/g, ' ').trim();
    const original = html.replace(/\s+/g, ' ').trim();
    // Normalize: remove spaces between attributes, etc. This is a rough comparison.
    // We remove all spaces to make the comparison more robust.
    const normalizedSerialized = serialized.replace(/\s+/g, '');
    const normalizedOriginal = original.replace(/\s+/g, '');
    // If they differ, the parser had to fix something → malformed
    return normalizedSerialized === normalizedOriginal;
  } catch {
    return false;
  }
}

function getCodeStatus(html_code: string) {
  if (!html_code) return 'empty';
  if (html_code.startsWith('http')) {
    try { new URL(html_code); return 'valid-url'; } catch { return 'invalid'; }
  }
  return isValidHTML(html_code) ? 'valid-html' : 'invalid';
}

const challengeSchema = (t: any) => z.object({
  title_fr: z.string().min(1, t('validation.titleFrRequired')),
  title_ar: z.string().min(1, t('validation.titleArRequired')),
  html_code: z.string().min(1, t('validation.htmlCodeRequired')).refine(
    (val) => {
      if (val.startsWith('http')) {
        try { new URL(val); return true; } catch { return false; }
      }
      return isValidHTML(val);
    },
    { message: t('validation.htmlCodeInvalid') }
  ),
});

export default function ChallengeTab() {
  const t = useTranslations('admin.challenge');
  const { data, error, mutate, isValidating } = useAdminGETSWR<any>('/challenges');
const [translating, setTranslating] = useState(false);

  const schema = challengeSchema(t);
 const { register, handleSubmit, formState: { errors, isValid }, getValues, reset, watch, setValue } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { title_fr: '', title_ar: '', html_code: '' },
    mode: 'onChange',
  });

  useEffect(() => {
    if (data) {
      reset(data);
    }
  }, [data, reset]);

  const { trigger: update, loading } = useAdminPUT('/challenges', { showToast: false });

  const html_code = watch('html_code') || '';
  const codeStatus = getCodeStatus(html_code);

  // --- URL reachability check ---
  const [urlChecking, setUrlChecking] = useState(false);
  const [urlReachable, setUrlReachable] = useState<boolean | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
const canTranslate =
  (watch('title_fr') && !watch('title_ar')) ||
  (watch('title_ar') && !watch('title_fr'));
  const checkUrl = useCallback(async (url: string) => {
    setUrlChecking(true);
    setUrlReachable(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      // no-cors means we can't read resp.status; if it doesn't throw it's reachable
      setUrlReachable(true);
    } catch {
      setUrlReachable(false);
    } finally {
      setUrlChecking(false);
    }
  }, []);
const handleTranslate = async () => {
  const values = getValues();
  const missing: any[] = [];
  if (values.title_fr && !values.title_ar) missing.push({ field: 'title_ar', text: values.title_fr, targetLang: 'ar', sourceLang: 'fr' });
  if (values.title_ar && !values.title_fr) missing.push({ field: 'title_fr', text: values.title_ar, targetLang: 'fr', sourceLang: 'ar' });
  if (missing.length === 0) return;
  setTranslating(true);
  try {
    const groups: Record<string, any[]> = {};
    missing.forEach(b => { if (!groups[b.sourceLang]) groups[b.sourceLang] = []; groups[b.sourceLang].push(b); });
    for (const group of Object.values(groups)) {
      const texts = group.map(b => b.text);
      const translated = await translateBatch(texts, group[0].targetLang, group[0].sourceLang);
      group.forEach((b, idx) => setValue(b.field as any, translated[idx], { shouldValidate: true }));
    }
  } catch { toast.error(t('translationFailed')); }
  setTranslating(false);
};
  useEffect(() => {
    if (codeStatus === 'valid-url') {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        checkUrl(html_code);
      }, 600);
    } else {
      setUrlReachable(null);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [html_code, codeStatus, checkUrl]);

  const canSubmit = isValid && !loading &&
    (codeStatus === 'valid-html' ||
     (codeStatus === 'valid-url' && urlReachable === true));

  const onSubmit = async (formData: any) => {
    try {
      await update({ ...formData, id: data?.id });
      toast.success(t('updated'));
    } catch (err: any) {
      if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
      else toast.error(err.message || t('error'));
    }
  };

  if (error) return <p className="text-red-500">{t('errorLoading')}</p>;
  if (isValidating && !data) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{t('title')}</h2>

      {/* Status pills */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-500">{t('status')}</span>
        {codeStatus === 'valid-html' && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-green-100 text-green-700">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {t('validHtml')}
          </span>
        )}
        {codeStatus === 'valid-url' && urlChecking && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('checkingUrl')}
          </span>
        )}
        {codeStatus === 'valid-url' && urlReachable === true && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-green-100 text-green-700">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {t('urlAccessible')}
          </span>
        )}
        {codeStatus === 'valid-url' && urlReachable === false && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-red-100 text-red-700">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            {t('urlInaccessible')}
          </span>
        )}
        {codeStatus === 'invalid' && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-red-100 text-red-700">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            {t('invalidCode')}
          </span>
        )}
        {codeStatus === 'empty' && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" />
            </svg>
            {t('noCode')}
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 bg-white rounded-2xl border p-6">
        <div>
          <label className="block text-sm font-medium mb-1">{t('titleFr')}</label>
          <Input {...register('title_fr')} />
          {errors.title_fr && <p className="text-red-500 text-xs mt-1">{errors.title_fr.message as string}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('titleAr')}</label>
          <Input {...register('title_ar')} />
          {errors.title_ar && <p className="text-red-500 text-xs mt-1">{errors.title_ar.message as string}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('htmlCode')}</label>
          <Textarea {...register('html_code')} className="h-40 font-mono text-sm" placeholder={t('htmlCodePlaceholder')} />
          {errors.html_code && <p className="text-red-500 text-xs mt-1">{errors.html_code.message as string}</p>}
        </div>
{canTranslate && (
  <Button type="button" variant="outline" onClick={handleTranslate} disabled={translating}>
    {translating ? t('translating') : t('translate')}
  </Button>
)}
        <Button type="submit" disabled={!canSubmit || loading} className="w-full">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
          {t('save')}
        </Button>
      </form>
    </div>
  );
}