'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR } from '@/lib/api/hooks';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';
import { toast } from 'sonner';
import { adminAPI } from '@/lib/api/client';
import { RateLimitError } from '@/lib/api/types';
import { translateBatch } from '@/lib/utils/translate';
import dynamic from 'next/dynamic';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });
import 'react-quill-new/dist/quill.snow.css';

const TABS = ['terms', 'privacy', 'conditions'] as const;

export default function TermsClient() {
  const t = useTranslations('admin.terms');
  const { data, mutate, isValidating, error, retry, isRetrying } = useAdminGETSWR<any>('/terms');

  // Store all six fields in a flat object
  const [form, setForm] = useState({
    terms_fr: '',
    terms_ar: '',
    privacy_fr: '',
    privacy_ar: '',
    conditions_fr: '',
    conditions_ar: '',
  });

  const [activeTab, setActiveTab] = useState<string>('terms');
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);

  // Load fetched data into form (once)
  useEffect(() => {
    if (data) {
      setForm({
        terms_fr: data.terms_fr || '',
        terms_ar: data.terms_ar || '',
        privacy_fr: data.privacy_fr || '',
        privacy_ar: data.privacy_ar || '',
        conditions_fr: data.conditions_fr || '',
        conditions_ar: data.conditions_ar || '',
      });
    }
  }, [data]);

  const updateField = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // ── Translation (exactly like WhyChooseUs) ──
  const currentFr = form[`${activeTab}_fr` as keyof typeof form];
  const currentAr = form[`${activeTab}_ar` as keyof typeof form];

  const canTranslate = (!!currentFr && !currentAr) || (!!currentAr && !currentFr);

  const handleTranslate = async () => {
    if (!canTranslate) return;
    setTranslating(true);
    try {
      if (currentFr && !currentAr) {
        const [translated] = await translateBatch([currentFr], 'ar', 'fr');
        updateField(`${activeTab}_ar`, translated);
      } else if (currentAr && !currentFr) {
        const [translated] = await translateBatch([currentAr], 'fr', 'ar');
        updateField(`${activeTab}_fr`, translated);
      }
      toast.success(t('translated'));
    } catch {
      toast.error(t('translationFailed'));
    } finally {
      setTranslating(false);
    }
  };

  // ── Validation (all six fields required) ──
const plainText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const isValid = Object.values(form).every(val => plainText(val).length > 0);
  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await adminAPI('/terms', { method: 'PUT', body: JSON.stringify(form) });
      mutate(form, false);   // optimistic update
      toast.success(t('saved'));
    } catch (err: any) {
      if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
      else toast.error(err.message || t('error'));
    }
    setSaving(false);
  };

  const modules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ color: [] }, { background: [] }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link'],
      ['clean'],
    ],
  };

  if (error) return <RetryableError error={error} onRetry={retry} isRetrying={isRetrying} />;
  if (!data && isValidating) return <LoadingSpinner />;

  const tabLabels: Record<string, string> = {
    terms: t('tab_terms'),
    privacy: t('tab_privacy'),
    conditions: t('tab_conditions'),
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('title')}</h2>
        <RefreshButton onRefresh={() => mutate()} loading={isValidating} />
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-gray-200">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium text-sm transition-colors border-b-2 ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {/* Editors – side by side (FR / AR) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div>
          <h3 className="font-semibold mb-2">{t('french')}</h3>
          <ReactQuill
            theme="snow"
            value={form[`${activeTab}_fr` as keyof typeof form]}
            onChange={val => updateField(`${activeTab}_fr`, val)}
            modules={modules}
            className="h-64 mb-12"
          />
        </div>
        <div>
          <h3 className="font-semibold mb-2">{t('arabic')}</h3>
          <ReactQuill
            theme="snow"
            value={form[`${activeTab}_ar` as keyof typeof form]}
            onChange={val => updateField(`${activeTab}_ar`, val)}
            modules={modules}
            className="h-64 mb-12"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        {canTranslate && (
          <Button type="button" variant="outline" onClick={handleTranslate} disabled={translating}>
            {translating ? t('translating') : t('translate')}
          </Button>
        )}
        <Button onClick={handleSave} disabled={saving || translating || !isValid}>
          {saving ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  );
}