'use client';
import { useState , useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AtSign, Mail, Phone, User, MessageSquare, MapPin, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import { usePublicGETSWR, usePublicPOST } from '@/lib/api/hooks';
import { RetryableError } from '@/components/shared/RetryableError';
import { PhoneInput } from '@/components/public/PhoneInput';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RateLimitError } from '@/lib/api/types';
import { useContactInfo } from '@/components/providers/ContactInfoProvider';

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
    path: ['email'],
  });

type ContactFormData = z.infer<ReturnType<typeof contactSchema>>;

interface ContactInfo {
  address: string;
  email: string;
  phone: string;
  hours: string;
}

interface ScheduleDay {
  day_number: number;
  day_name_fr: string;
  day_name_ar: string;
  work_parts_count: number;
  part1_start: string | null;
  part1_end: string | null;
  part2_start: string | null;
  part2_end: string | null;
  part3_start: string | null;
  part3_end: string | null;
}

export default function ContactPageClient() {
  const t = useTranslations('contact');
  const locale = useLocale();
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [showTooltip, setShowTooltip] = useState(false);
const { data: subjects, error: subjectsError } = usePublicGETSWR<{ id: string; title_fr: string; title_ar: string }[]>('/contact-subjects');
const otherSubject = subjects?.find(s => s.is_other);
const sortedSubjects = useMemo(() => {
  if (!subjects) return [];
  const regular = subjects.filter(s => !s.is_other);
  return [...regular, ...(otherSubject ? [otherSubject] : [])];
}, [subjects, otherSubject]);
const [touchedSubject, setTouchedSubject] = useState(false);
  // SWR for contact info
  const { contactInfo, error: infoError, retry: retryInfo, isRetrying: infoRetrying } = useContactInfo();
  // SWR for schedule
  const { data: schedule = [], error: scheduleError, retry: retrySchedule, isRetrying: scheduleRetrying } =
    usePublicGETSWR<ScheduleDay[]>('/admin-schedule');

  // Mutation for submitting form
const { mutate: submitContact, loading: submitting } = usePublicPOST('/contact', { showToast: false });
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
const [selectedSubject, setSelectedSubject] = useState('');
const [customSubject, setCustomSubject] = useState('');


const isSubjectValid =
  sortedSubjects.length === 0 ||                          // no subjects → no rule
  (selectedSubject && selectedSubject !== otherSubject?.id) ||  // a regular subject chosen
  (selectedSubject === otherSubject?.id && customSubject.trim().length > 0); // other + custom filled
  
const isOtherSubject = selectedSubject === otherSubject?.id;
const [touchedCustomSubject, setTouchedCustomSubject] = useState(false);
  const markTouched = (field: string) => setTouchedFields((prev) => ({ ...prev, [field]: true }));
  const clearTouched = () => setTouchedFields({});

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
    subjectId: selectedSubject || otherSubject?.id || undefined,
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
 const getSummary = () => {
  if (!schedule.length) return t('schedule.summaryFallback');
  const workDays = schedule.filter(d => d.work_parts_count > 0);
  if (workDays.length === 0) return t('schedule.closed');

  const first = workDays[0];
  const last = workDays[workDays.length - 1];

  let earliestStart: string | null = null;
  let latestEnd: string | null = null;

  for (const day of workDays) {
    const starts = [day.part1_start, day.part2_start, day.part3_start].filter(Boolean) as string[];
    const ends   = [day.part1_end,   day.part2_end,   day.part3_end  ].filter(Boolean) as string[];

    for (const s of starts) {
      if (!earliestStart || s < earliestStart) earliestStart = s;
    }
    for (const e of ends) {
      if (!latestEnd || e > latestEnd) latestEnd = e;
    }
  }

  if (!earliestStart || !latestEnd) return t('schedule.summaryFallback');

  const startH = earliestStart.split(':')[0];
  const endH   = latestEnd.split(':')[0];

  const firstLabel = locale === 'fr' ? first.day_name_fr : first.day_name_ar;
  const lastLabel  = locale === 'fr' ? last.day_name_fr  : last.day_name_ar;
  const dayRange = first.day_number === last.day_number
    ? firstLabel
    : `${firstLabel} – ${lastLabel}`;

  return `${dayRange} ${startH}‑${endH}`;
};

  const getFullSchedule = () => {
    if (!schedule.length) return t('schedule.noInfo');
    return schedule
      .map((day) => {
        const dayName = locale === 'fr' ? day.day_name_fr : day.day_name_ar;
        if (day.work_parts_count === 0) return `${dayName}: ${t('schedule.closed')}`;
        const parts = [];
        if (day.part1_start && day.part1_end) parts.push(`${day.part1_start} - ${day.part1_end}`);
        if (day.part2_start && day.part2_end) parts.push(`${day.part2_start} - ${day.part2_end}`);
        if (day.part3_start && day.part3_end) parts.push(`${day.part3_start} - ${day.part3_end}`);
        return `${dayName}: ${parts.join(', ')}`;
      })
      .join('\n');
  };

  const isLoading = !contactInfo && !infoError;
  const scheduleLoading = !schedule.length && !scheduleError;
if (subjectsError) {
  return <RetryableError error={subjectsError} onRetry={() => window.location.reload()} />;
}
  return (
    <div className="max-w-7xl mx-auto px-8 py-16">
      <ScrollReveal>
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-7xl font-black mb-6">{t('title')}</h1>
          <p className="text-gray-500 text-xl max-w-2xl mx-auto">{t('subtitle')}</p>
        </div>
      </ScrollReveal>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
        <ScrollReveal direction="right">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-2">{t('form.name')}</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  {...register('name')}
                                      placeholder={t('form.nameplaceholder')}

                  onBlur={() => markTouched('name')}
                  className={`w-full pl-12 pr-4 py-3 rounded-2xl border bg-gray-50 focus:bg-white transition-colors ${
                    touchedFields.name && errors.name ? 'border-red-500' : 'border-gray-200'
                  }`}
                />
              </div>
              {touchedFields.name && errors.name && (
                <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-2">{t('form.email')}</label>
              <div className="relative">
                <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  {...register('email')}
                                      placeholder={t('form.emailplaceholder')}

                  onBlur={() => markTouched('email')}
                  className={`w-full pl-12 pr-4 py-3 rounded-2xl border bg-gray-50 focus:bg-white transition-colors ${
                    touchedFields.email && errors.email ? 'border-red-500' : 'border-gray-200'
                  }`}
                />
              </div>
              {touchedFields.email && errors.email && (
                <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium mb-2">{t('form.phone')}</label>
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
              <label className="block text-sm font-medium mb-2">{t('form.message')}</label>
              <div className="relative">
                <MessageSquare className="absolute left-4 top-3 w-5 h-5 text-gray-400" />
                <textarea
                  {...register('message')}
                  rows={5}
                                      placeholder={t('form.messageplaceholder')}

                  onBlur={() => markTouched('message')}
                  className={`w-full pl-12 pr-4 py-3 rounded-2xl border bg-gray-50 focus:bg-white transition-colors  ${
                    touchedFields.message && errors.message ? 'border-red-500' : 'border-gray-200'
                  }`}
                />
              </div>
              {touchedFields.message && errors.message && (
                <p className="text-red-500 text-sm mt-1">{errors.message.message}</p>
              )}
            </div>

            {errors.email?.message === t('form.errors.contactMethod') && (
              <p className="text-red-500 text-sm">{t('form.errors.contactMethod')}</p>
            )}

            <button
              type="submit"
              disabled={!isValid || submitting || !isSubjectValid}
              className="w-full bg-primary text-white py-4 rounded-2xl font-bold hover:bg-primary/80 disabled:opacity-50"
            >
              {submitting ? t('form.sending') : t('form.submit')}
            </button>
          </form>
        </ScrollReveal>

        <ScrollReveal direction="left" delay={0.2}>
          <div className="bg-gray-50 rounded-[40px] p-12 h-fit space-y-8">
            <div>
              <h3 className="text-2xl font-bold mb-6">{t('info.title')}</h3>
              {infoError ? (
                <RetryableError error={infoError} onRetry={retryInfo} isRetrying={infoRetrying} />
              ) : isLoading ? (
                <LoadingSpinner />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <MapPin className="w-6 h-6 text-primary flex-shrink-0" />
                    <div>
                      <p className="font-medium">{t('info.addressLabel')}</p>
                      <p className="text-gray-600">{contactInfo?.address}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <Mail className="w-6 h-6 text-primary flex-shrink-0" />
                    <div>
                      <p className="font-medium">{t('info.emailLabel')}</p>
                      <p className="text-gray-600">{contactInfo?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <Phone className="w-6 h-6 text-primary flex-shrink-0" />
                    <div>
                      <p className="font-medium">{t('info.phoneLabel')}</p>
                      <p className="text-gray-600">{contactInfo?.phone}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-8">
                <div className="flex items-start gap-4 relative">
                  <Clock className="w-6 h-6 text-primary flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium">{t('info.hoursLabel')}</p>
                    {scheduleError ? (
                      <RetryableError error={scheduleError} onRetry={retrySchedule} isRetrying={scheduleRetrying} />
                    ) : scheduleLoading ? (
                      <LoadingSpinner />
                    ) : (
                      <div
                        className="relative inline-block cursor-help border-b border-dashed border-gray-400"
                        onMouseEnter={() => setShowTooltip(true)}
                        onMouseLeave={() => setShowTooltip(false)}
                      >
                        <p className="text-gray-600">{getSummary()}</p>
                        {showTooltip && (
                          <div className="absolute z-50 bottom-full left-0 mb-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm text-gray-700 whitespace-pre-line">
                            {getFullSchedule()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </div>
  );
}