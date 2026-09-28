'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR } from '@/lib/api/hooks';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';
import { toast } from 'sonner';
import { RateLimitError } from '@/lib/api/types';
import { z } from 'zod';
import dynamic from 'next/dynamic';
import { adminAPI } from '@/lib/api/client';
import { uploadToCloudinary } from '@/lib/cloudinary-upload';
import Image from 'next/image';
import { ImageIcon, X } from 'lucide-react';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });
import 'react-quill-new/dist/quill.snow.css';

const pageSchema = z.object({
  content_fr: z.string().min(1, 'admin.about.validation.contentFrRequired'),
  content_ar: z.string().min(1, 'admin.about.validation.contentArRequired'),
  summary_fr: z.string().min(1, 'admin.about.validation.summaryFrRequired'),
  summary_ar: z.string().min(1, 'admin.about.validation.summaryArRequired'),
});

export function PageTab() {
  const t = useTranslations('admin.about');
  const { data, mutate, refresh , error, retry, isRetrying, isValidating } = useAdminGETSWR<any>('/about');

  const [contentFr, setContentFr] = useState('');
  const [contentAr, setContentAr] = useState('');
  const [summaryFr, setSummaryFr] = useState('');
  const [summaryAr, setSummaryAr] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const plainText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

  useEffect(() => {
    if (data) {
      setContentFr(data.content_fr || '');
      setContentAr(data.content_ar || '');
      setSummaryFr(data.summary_fr || '');
      setSummaryAr(data.summary_ar || '');
      setPreviewUrl(data.image_url || null);
    }
  }, [data]);


useEffect(() => {
  setIsValid(
    plainText(contentFr).length > 0 &&
    plainText(contentAr).length > 0 &&
    plainText(summaryFr).length > 0 &&
    plainText(summaryAr).length > 0
  );
}, [contentFr, contentAr, summaryFr, summaryAr]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setPreviewUrl(null);
  };

  const handleSave = async () => {
    const parsed = pageSchema.safeParse({ content_fr: contentFr, content_ar: contentAr, summary_fr: summaryFr, summary_ar: summaryAr });
    if (!parsed.success) {
      toast.error(t(parsed.error.errors[0].message.replace('admin.about.', '')));
      return;
    }

    let imageUrl = data?.image_url || '';
    let imagePublicId = data?.image_public_id || null;

    if (imageFile) {
      try {
        toast.info(t('uploadingImage'));
        const result = await uploadToCloudinary(imageFile);
        imageUrl = result.url;
        imagePublicId = result.public_id;
      } catch {
        toast.error(t('uploadFailed'));
        return;
      }
    } else if (!previewUrl && data?.image_public_id) {
      imageUrl = '';
      imagePublicId = null;
    }

    setSaving(true);
    try {
      const updatedData = await adminAPI('/about', {
        method: 'PUT',
        body: JSON.stringify({
          content_fr: contentFr,
          content_ar: contentAr,
          summary_fr: summaryFr,
          summary_ar: summaryAr,
          image_url: imageUrl,
          image_public_id: imagePublicId,
        }),
      });
      
      mutate(updatedData, false);
      toast.success(t('saved'));
    } catch (err: any) {
      if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
      else if (err.status === 400) toast.error(t('invalidRequest'));
      else toast.error(t('error'));
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('pageTitle')}</h2>
        <RefreshButton onRefresh={() => mutate()} loading={isValidating} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium mb-1 block">{t('summaryFr')} *</label>
          <input type="text" value={summaryFr} onChange={(e) => setSummaryFr(e.target.value)} className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">{t('summaryAr')} *</label>
          <input type="text" value={summaryAr} onChange={(e) => setSummaryAr(e.target.value)} className="w-full border rounded px-3 py-2" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">{t('imageOptional')}</label>
        {previewUrl ? (
          <div className="flex items-center gap-3">
            <Image src={previewUrl} alt="Preview" width={80} height={80} className="rounded-xl object-cover" unoptimized />
            <Button type="button" variant="outline" size="sm" onClick={handleRemoveImage}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <label className="cursor-pointer inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <ImageIcon className="w-4 h-4" /> {t('chooseImage')}
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </label>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div>
          <h3 className="font-semibold mb-2">{t('french')} *</h3>
          <ReactQuill theme="snow" value={contentFr} onChange={setContentFr} modules={modules} className="h-64 mb-12" />
        </div>
        <div>
          <h3 className="font-semibold mb-2">{t('arabic')} *</h3>
          <ReactQuill theme="snow" value={contentAr} onChange={setContentAr} modules={modules} className="h-64 mb-12" />
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving || !isValid}>
        {saving ? t('saving') : t('save')}
      </Button>
    </div>
  );
}