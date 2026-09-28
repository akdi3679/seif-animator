'use client';
import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR } from '@/lib/api/hooks';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';
import { toast } from 'sonner';
import { adminAPI } from '@/lib/api/client';
import { RateLimitError } from '@/lib/api/types';
import { PhoneInput } from '@/components/public/PhoneInput';
import { isValidPhoneNumber } from 'libphonenumber-js';
import MapPicker from '@/components/admin/MapPicker';
import { SocialLinksEditor } from '@/components/admin/SocialLinksEditor';

// Strict email regex (same as your booking schema)
const EMAIL_REGEX = /^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/;

export default function ContactInfoTab() {
  const t = useTranslations('admin.contact');

  const {
    data: contactData,
    mutate: mutateContact,
    isValidating: contactValidating,
    error: contactError,
    retry: contactRetry,
    isRetrying: contactIsRetrying,
  } = useAdminGETSWR<any>('/contact-info');

  // -------------------------------------------------
  // 1. Wait until data has been loaded at least once
  // -------------------------------------------------
  const [ready, setReady] = useState(false);
  const hasData = !!contactData;

  useEffect(() => {
    if (hasData) setReady(true);
  }, [hasData]);

  // -------------------------------------------------
  // 2. Local form state – initialised from API data
  // -------------------------------------------------
  const [form, setForm] = useState({
    address: contactData?.address || '',
    email: contactData?.email || '',
    phone: contactData?.phone || '',
    latitude: contactData?.latitude?.toString() || '36.8065',
    longitude: contactData?.longitude?.toString() || '10.1815',
    map_zoom: contactData?.map_zoom?.toString() || '15',
    social_links: Array.isArray(contactData?.social_links) ? contactData.social_links : [],
  });

  // Prevent overwriting user edits
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (contactData && !dirtyRef.current) {
      setForm({
        address: contactData.address || '',
        email: contactData.email || '',
        phone: contactData.phone || '',
        latitude: contactData.latitude?.toString() || '36.8065',
        longitude: contactData.longitude?.toString() || '10.1815',
        map_zoom: contactData.map_zoom?.toString() || '15',
        social_links: Array.isArray(contactData.social_links) ? contactData.social_links : [],
      });
    }
  }, [contactData]);

  // -------------------------------------------------
  // 3. Touch tracking and field updates
  // -------------------------------------------------
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const markTouched = (field: string) =>
    setTouched((prev) => ({ ...prev, [field]: true }));

  const updateField = (field: string, value: any) => {
    dirtyRef.current = true;
    setForm((prev) => ({ ...prev, [field]: value }));
    markTouched(field);
  };

  // -------------------------------------------------
  // 4. Validation helpers
  // -------------------------------------------------
  const isValidEmail = (email: string) => EMAIL_REGEX.test(email);
  const isValidPhone = (phone: string) =>
    !!phone && isValidPhoneNumber(phone, { defaultCountry: 'TN' });

  const addressValid = form.address.trim().length > 0;
  const emailValid = isValidEmail(form.email);
  const phoneValid = isValidPhone(form.phone);

  const isValid = addressValid && emailValid && phoneValid;

  const [phoneError, setPhoneError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!isValid) return;
    if (!isValidPhone(form.phone)) {
      setPhoneError(t('form.errors.phoneInvalid'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        address: form.address,
        email: form.email,
        phone: form.phone,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        map_zoom: parseInt(form.map_zoom) || 15,
        social_links: form.social_links,
      };
      await adminAPI('/contact-info', {
        method: 'PUT',
        body: JSON.stringify({ contact: payload }),
      });
      mutateContact(payload, false);
      dirtyRef.current = false;
      setTouched({});
      toast.success(t('saved'));
    } catch (err: any) {
      if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
      else toast.error(err.message || t('error'));
    }
    setSaving(false);
  };

  const handleRefresh = () => {
    dirtyRef.current = false;
    setTouched({});
    mutateContact();
  };

  const [saving, setSaving] = useState(false);

  // -------------------------------------------------
  // 5. Render
  // -------------------------------------------------
  if (contactError && !contactData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{t('infoTitle')}</h2>
          <RefreshButton onRefresh={handleRefresh} loading={false} />
        </div>
        <RetryableError error={contactError} onRetry={contactRetry} isRetrying={contactIsRetrying} />
      </div>
    );
  }

  if (!ready) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('infoTitle')}</h2>
        <RefreshButton onRefresh={handleRefresh} loading={contactValidating} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          placeholder={t('address')}
          value={form.address}
          onChange={(e) => updateField('address', e.target.value)}
          className={touched.address && !addressValid ? 'border-red-500' : ''}
        />
        <Input
          placeholder={t('email')}
          value={form.email}
          onChange={(e) => updateField('email', e.target.value)}
          type="email"
          className={touched.email && !emailValid ? 'border-red-500' : ''}
        />
        <div>
          <PhoneInput
            value={form.phone || ''}
            onChange={(val) => {
              updateField('phone', val);
              setPhoneError(null);
            }}
            onBlur={() => {
              markTouched('phone');
              if (form.phone && !isValidPhone(form.phone))
                setPhoneError(t('form.errors.phoneInvalid'));
              else setPhoneError(null);
            }}
            error={touched.phone && phoneError ? phoneError : undefined}
            placeholder={t('form.phonePlaceholder')}
          />
          {touched.phone && !form.phone && (
            <p className="text-red-500 text-xs mt-1">{t('form.errors.phoneRequired')}</p>
          )}
        </div>
      </div>

      <MapPicker
        lat={parseFloat(form.latitude) || 36.8065}
        lng={parseFloat(form.longitude) || 10.1815}
        onChange={(lat, lng) => {
          updateField('latitude', lat.toString());
          updateField('longitude', lng.toString());
        }}
      />
      <div className="flex gap-4 mt-2">
        <Input
          type="number"
          placeholder="Latitude"
          value={form.latitude}
          onChange={(e) => updateField('latitude', e.target.value)}
        />
        <Input
          type="number"
          placeholder="Longitude"
          value={form.longitude}
          onChange={(e) => updateField('longitude', e.target.value)}
        />
      </div>

      <SocialLinksEditor
        value={form.social_links}
        onChange={(val) => updateField('social_links', val)}
      />

      <Button onClick={handleSave} disabled={saving || !isValid}>
        {saving ? t('saving') : t('save')}
      </Button>
    </div>
  );
}