'use client';
import { useState, useRef } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface Props {
  onUpload: (result: { public_id: string; url: string } | null) => void;
  previewUrl?: string | null;
}

export default function ImageUpload({ onUpload, previewUrl }: Props) {
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const t = useTranslations('booking');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    try {
      // 1. Get signed params from backend
      const signRes = await fetch('/api/public/sign-upload', { method: 'POST' });
      const signData = await signRes.json();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', signData.apiKey);
      formData.append('timestamp', signData.timestamp.toString());
      formData.append('signature', signData.signature);
      formData.append('upload_preset', signData.uploadPreset);
      formData.append('tags', 'booking-pending');   // ← mark as pending

      // 2. Upload directly to Cloudinary
      const cloudRes = await fetch(
        `https://api.cloudinary.com/v1_1/${signData.cloudName}/image/upload`,
        { method: 'POST', body: formData }
      );
      const cloudData = await cloudRes.json();

      if (cloudData.error) throw new Error(cloudData.error.message);

      // 3. Success – send back public_id and url
      onUpload({ public_id: cloudData.public_id, url: cloudData.secure_url });
      setLocalPreview(cloudData.secure_url);
    } catch (err) {
      console.error('Upload failed', err);
      onUpload(null);
      setLocalPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    onUpload(null);
    setLocalPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  if (uploading) {
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
        <Loader2 className="mx-auto w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-gray-500 mt-2">{t('form.uploading')}</p>
      </div>
    );
  }

  const displayPreview = previewUrl || localPreview;

  return (
    <div className="space-y-2">
      {displayPreview ? (
        <div className="relative w-32 h-32 rounded-lg overflow-hidden">
          <img src={displayPreview} alt="Preview" className="object-cover w-full h-full" />
          <button type="button" onClick={handleRemove} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <label className="block">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary">
            <Upload className="mx-auto w-8 h-8 text-gray-400" />
            <p className="text-sm text-gray-500 mt-2">{t('form.clickToUpload')}</p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        </label>
      )}
    </div>
  );
}