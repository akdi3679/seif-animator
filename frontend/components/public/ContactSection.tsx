'use client';

import { useState , useMemo  } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import { Mail, Phone, MapPin, User, MessageSquare, AtSign, Send } from 'lucide-react';
import { usePublicPOST } from '@/lib/api/hooks';
import { toast } from 'sonner';
import { PhoneInput } from '@/components/public/PhoneInput';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { RateLimitError } from '@/lib/api/types';
import { useSiteData } from '@/components/providers/SiteDataProvider';
import { useContactInfo } from '@/components/providers/ContactInfoProvider';
import { usePublicGETSWR } from '@/lib/api/hooks';

const contactSchema = (t: any) =>
  z.object({
    name: z.string().min(2, t('form.errors.nameMin')),
    email: z.string().email(t('form.errors.emailInvalid')).optional().or(z.literal('')),
    phone: z.string().optional().refine(
      (val) => !val || isValidPhoneNumber(val, { defaultCountry: 'TN' }),
      { message: t('form.errors.phoneInvalid') }
    ),
    message: z.string().min(10, t('form.errors.messageMin')),
  }).refine((data) => data.email || data.phone, {
    message: t('form.errors.contactMethod'),
  });

type ContactFormData = z.infer<ReturnType<typeof contactSchema>>;

export function ContactSection() {
  const t = useTranslations('contactSection');
  const locale = useLocale();
  const { name: siteName } = useSiteData();
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const { mutate: submitContact, loading } = usePublicPOST('/contact', { showToast: false });
const { data: subjects, error: subjectsError } = usePublicGETSWR<{ id: string; title_fr: string; title_ar: string }[]>('/contact-subjects');
  // Use the shared provider – it already returns `contactInfo`, `isLoading`, `error`, etc.
  const { contactInfo, isLoading: infoLoading, error: infoError } = useContactInfo();
const [touchedSubject, setTouchedSubject] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
    trigger,
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema(t)),
    defaultValues: { name: '', email: '', phone: '', message: '' },
    mode: 'onChange',
  });
const otherSubject = subjects?.find(s => s.is_other);
const sortedSubjects = useMemo(() => {
  if (!subjects) return [];
  const regular = subjects.filter(s => !s.is_other);
  return [...regular, ...(otherSubject ? [otherSubject] : [])];
}, [subjects, otherSubject]);
const [touchedCustomSubject, setTouchedCustomSubject] = useState(false);
const [selectedSubject, setSelectedSubject] = useState('');
const [customSubject, setCustomSubject] = useState('');


const isSubjectValid =
  sortedSubjects.length === 0 ||                          // no subjects → no rule
  (selectedSubject && selectedSubject !== otherSubject?.id) ||  // a regular subject chosen
  (selectedSubject === otherSubject?.id && customSubject.trim().length > 0); // other + custom filled
const isOtherSubject = selectedSubject === otherSubject?.id;

const markTouched = (field: string) => setTouchedFields(prev => ({ ...prev, [field]: true }));

  const onSubmit = async (formData: ContactFormData) => {
  // Require subject if data is loaded and not empty
  // NEW – inline error, same pattern as other fields
if (sortedSubjects.length > 0) {
  if (!selectedSubject) {
    setTouchedSubject(true);
    return;
  }
}
if (isOtherSubject && !customSubject.trim()) {
  setTouchedCustomSubject(true);
  return;
}
  // Build the payload
  const payload = {
    ...formData,
 subjectId: selectedSubject || otherSubject?.id || undefined ,
customSubject: isOtherSubject ? customSubject : (sortedSubjects.length === 0 ? t('form.noSubjectTitle') : undefined),
  };

  try {
    await submitContact(payload);
    toast.success(t('form.success'));
    reset();
    setTouchedFields({});
    setSelectedSubject('');
    setCustomSubject('');
  } catch (err: any) {
    if (err instanceof RateLimitError) {
      toast.error(t('form.rateLimit', { seconds: err.retryAfter }));
    } else {
      toast.error(t('form.error'));
    }
  }
};
  const mapSrc = contactInfo?.latitude && contactInfo?.longitude
    ? `https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d3192.686157440924!2d${contactInfo.longitude}!3d${contactInfo.latitude}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1s${locale}!2stn!4v1620000000000!5m2!1s${locale}!2stn`
    : 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3192.686157440924!2d10.1815!3d36.8065!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x12fd4b9c5a5e5b5b%3A0x5b5b5b5b5b5b5b5b!2sTunis%2C%20Tunisia!5e0!3m2!1sen!2stn!4v1620000000000!5m2!1sen!2stn';
if (subjectsError) return null;  
  return (
    <section className="relative py-24 bg-cream overflow-hidden">
      {/* Watermark – site name */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-center pointer-events-none select-none">
        <div className="text-[16rem] font-black text-primary/[0.05] leading-none translate-y-10">
          {siteName}
        </div>
      </div>

      {/* Subtle gradient sweep */}
      <div className="absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-secondary/10 via-primary/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto px-8 relative z-10">
        <ScrollReveal>
          <div className="text-center mb-16">
            <h2 className="text-5xl md:text-6xl font-black text-dark mb-4">
              {t('title')}
            </h2>
            <p className="text-gray-500 text-xl max-w-2xl mx-auto">
              {t('subtitle')}
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Form side */}
          <ScrollReveal direction="right">
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="bg-white rounded-[40px] p-8 md:p-10 shadow-lg border border-gray-100 space-y-6"
            >
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">
                  {t('form.name')}
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/60" />
                  <input
                    type="text"
                    {...register('name')}
                    placeholder={t('form.nameplaceholder')}
                    onBlur={() => markTouched('name')}
                    className={`w-full pl-12 pr-4 py-4 rounded-2xl border bg-gray-50 focus:bg-white transition-colors ${
                      touchedFields.name && errors.name ? 'border-red-500' : 'border-gray-200 focus:border-primary'
                    } outline-none`}
                  />
                </div>
                {touchedFields.name && errors.name && (
                  <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">
                  {t('form.email')}
                </label>
                <div className="relative">
                  <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary/60" />
                  <input
                    type="email"
                    {...register('email')}
                    placeholder={t('form.emailplaceholder')}
                    onBlur={() => markTouched('email')}
                    className={`w-full pl-12 pr-4 py-4 rounded-2xl border bg-gray-50 focus:bg-white transition-colors ${
                      touchedFields.email && errors.email ? 'border-red-500' : 'border-gray-200 focus:border-primary'
                    } outline-none`}
                  />
                </div>
                {touchedFields.email && errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
                )}
              </div>

              {/* Phone */}
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
                      onChange={(val) => {
                        field.onChange(val);
                        trigger('phone');
                      }}
                      onBlur={() => {
                        field.onBlur();
                        markTouched('phone');
                      }}
                      placeholder={t('form.phonePlaceholder')}
                      error={touchedFields.phone && errors.phone?.message}
                    />
                  )}
                />
              </div>
{/* Subject – only if data loaded and not empty */}
{sortedSubjects.length > 0 && (
  <div>
    <label className="block text-sm font-medium mb-2 text-gray-700">
      {t('form.subject')}
    </label>
    <select
  value={selectedSubject}
  onChange={(e) => {
    setSelectedSubject(e.target.value);
    setTouchedSubject(false);           // clear error on change
    if (!e.target.value) setCustomSubject('');
  }}
  className={`w-full p-4 rounded-2xl border bg-gray-50 focus:bg-white focus:border-primary outline-none ${
    touchedSubject && !selectedSubject ? 'border-red-500' : 'border-gray-200'
  }`}
>
  <option value="">{t('form.subjectPlaceholder')}</option>
  {sortedSubjects.map((s) => (
    <option key={s.id} value={s.id}>
      {locale === 'fr' ? s.title_fr : s.title_ar}
    </option>
  ))}
</select>
{/* Inline error message – same pattern as other fields */}
{touchedSubject && !selectedSubject && (
  <p className="text-red-500 text-sm mt-1">{t('form.subjectRequired')}</p>
)}
  </div>
)}

{/* Custom subject input – only when “Other” is selected */}
{isOtherSubject && (
  <div>
    <label className="block text-sm font-medium mb-2 text-gray-700">
      {t('form.customSubject')}
    </label>
    <input
      type="text"
      value={customSubject}
      onChange={(e) => {
        setCustomSubject(e.target.value);
        if (touchedCustomSubject) setTouchedCustomSubject(false);
      }}
      onBlur={() => {
        if (isOtherSubject) setTouchedCustomSubject(true);
      }}
      placeholder={t('form.customSubjectPlaceholder')}
      className={`w-full p-4 rounded-2xl border bg-gray-50 focus:bg-white focus:border-primary outline-none ${
        touchedCustomSubject && !customSubject.trim() ? 'border-red-500' : 'border-gray-200'
      }`}
    />
    {touchedCustomSubject && !customSubject.trim() && (
      <p className="text-red-500 text-sm mt-1">{t('form.customSubjectRequired')}</p>
    )}
  </div>
)}
              {/* Message */}
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">
                  {t('form.message')}
                </label>
                <div className="relative">
                  <MessageSquare className="absolute left-4 top-4 w-5 h-5 text-primary/60" />
                  <textarea
                    {...register('message')}
                    rows={5}
                    placeholder={t('form.messageplaceholder')}
                    onBlur={() => markTouched('message')}
                    className={`w-full pl-12 pr-4 py-4 rounded-2xl border bg-gray-50 focus:bg-white transition-colors resize-none ${
                      touchedFields.message && errors.message ? 'border-red-500' : 'border-gray-200 focus:border-primary'
                    } outline-none`}
                  />
                </div>
                {touchedFields.message && errors.message && (
                  <p className="text-red-500 text-sm mt-1">{errors.message.message}</p>
                )}
              </div>

              {errors.email?.message === t('form.errors.contactMethod') && (
                <p className="text-red-500 text-sm">{t('form.errors.contactMethod')}</p>
              )}

              <Button
                type="submit"
                disabled={!isValid || loading || !isSubjectValid}
                className="w-full py-5 text-lg font-bold rounded-full bg-primary hover:bg-primary/90 text-white shadow-lg hover:shadow-xl transition-all"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t('form.sending')}
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Send className="w-5 h-5" />
                    {t('form.submit')}
                  </span>
                )}
              </Button>
            </form>
          </ScrollReveal>

          {/* Info side – only shown when data is available */}
          {!infoLoading && !infoError && contactInfo && (
            <ScrollReveal direction="left" delay={0.2}>
              <div className="bg-white rounded-[40px] p-8 md:p-10 shadow-lg border border-gray-100 h-full flex flex-col">
                <div className="space-y-6 flex-1">
                  <div>
                    <h3 className="text-2xl font-bold text-dark mb-6">{t('info.title')}</h3>
                    <div className="space-y-5">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                          <Phone className="w-6 h-6 text-primary" />
                        </div>
                        <span className="text-gray-700 font-medium">
                          {contactInfo.phone || '+216 71 234 567'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                          <Mail className="w-6 h-6 text-primary" />
                        </div>
                        <span className="text-gray-700 font-medium">
                          {contactInfo.email || 'contact@kafela.tn'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                          <MapPin className="w-6 h-6 text-primary" />
                        </div>
                        <span className="text-gray-700 font-medium">
                          {contactInfo.address || 'Tunis, Tunisie'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Map */}
                  <div className="aspect-video rounded-3xl overflow-hidden shadow-inner border border-gray-100">
                    <iframe
                      title="Google Map"
                      src={mapSrc}
                      width="100%"
                      height="100%"
                      style={{ border: 0 }}
                      allowFullScreen
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                </div>
              </div>
            </ScrollReveal>
          )}
        </div>
      </div>
    </section>
  );
}