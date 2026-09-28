'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations, useLocale } from 'next-intl'
import { toast } from 'sonner';
import { Loader2, RefreshCw, ArrowLeft } from 'lucide-react';
import Lottie from 'lottie-react';
import Cal, { getCalApi } from '@calcom/embed-react';
import { usePublicGETSWR, usePublicPOST } from '@/lib/api/hooks';
import { withErrorHandling } from '@/lib/api/error-handler';
import { publicAPI, PUBLIC_API_URL } from '@/lib/api/client';
import { useGlobalError } from '@/components/providers/ErrorHandler';
import { RetryableError } from '@/components/shared/RetryableError';
import { ScrollReveal } from '@/components/shared/ScrollReveal';
import ImageUpload from '@/components/public/ImageUpload';
import { PhoneInput } from '@/components/public/PhoneInput';
import balloonAnimation from '@/public/animations/balloon-party.json';
import { RateLimitError } from '@/lib/api/types';
import { useServiceTypes } from '@/components/providers/ServiceTypesProvider';

import { isValidPhoneNumber } from 'libphonenumber-js';
 const buildBookingSchema = (t: ReturnType<typeof useTranslations>) =>
  z.object({
    type: z.enum(['public', 'private']),
    serviceType: z.string().min(1, t('form.errors.serviceType')),
    customService: z.string().optional(),
    childrenCount: z.number().int().min(1).max(20).default(1),
    eventName: z.string().optional(),
    description: z.string().optional(),
    name: z.string()
      .min(2, t('form.errors.name'))
      .regex(/^[\p{L}\p{M}\p{Zs}.'-]+$/u, t('form.errors.nameInvalid')),
    email: z.string()
      .email(t('form.errors.email'))
      .regex(/^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/, t('form.errors.emailInvalid')),
    phone: z.string()
      .min(1, t('form.errors.phone'))
      .refine((val) => isValidPhoneNumber(val), t('form.errors.phoneValid')),
    notes: z.string().optional(),
    location: z.string().min(1, t('form.errors.location')),
  });

type BookingFormData = z.infer<ReturnType<typeof buildBookingSchema>>;
 

export default function BookingPage() {
  const t = useTranslations('booking');
const locale = useLocale();
  // --- Zod Schema
const bookingSchema = useMemo(() => buildBookingSchema(t), [t]);
 // --- State
  const [step, setStep] = useState<'form' | 'calendar'>('form');
  const [isGenerating, setIsGenerating] = useState(false);
  const [embedError, setEmbedError] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [imageUploadResult, setImageUploadResult] = useState<{ public_id: string; url: string } | null>(null);
  // iframeLoading tracks only the Cal iframe itself (post-embed generation)
  const [iframeLoading, setIframeLoading] = useState(false);
  const [calReady, setCalReady] = useState(false);
  // Per-embed timeout ref so it resets on every new embed generation
  const iframeTimeoutRef = useRef<NodeJS.Timeout>();

  const [imagePreview, setImagePreview] = useState<string>('');

  // Per-field touched state – completely independent, no cross-contamination
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});

  const [calLink, setCalLink] = useState<string | null>(null);
  const [calConfig, setCalConfig] = useState<any>(null);

  // --- Refs
  const tokenRef = useRef<string | null>(null);
  const embedShownRef = useRef(false);
  const generatingRef = useRef(false);
  const restoringRef = useRef(false);
  const skipEffectRef = useRef(false);
  const hasRestoredRef = useRef(false);
  const lastSnapshotRef = useRef<string>('');
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 3;
  const FALLBACK_POLLING_INTERVAL = 5000;

  // --- API Hooks
const {
  serviceTypes,
  sortedServiceTypes,
  otherSlug,
  isLoading: typesLoading,
  error: typesError,
  retry: retryServiceTypes,
  isRetrying: isRetryingServiceTypes,
  retriesExhausted: retriesExhaustedService,
} = useServiceTypes();

  const { reportError, clearError } = useGlobalError();
  const { mutate: initBooking } = usePublicPOST<{ token: string }>('/booking-init', { showToast: false });
  const initBookingRef = useRef(initBooking);
const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  // --- React Hook Form
  const {
    control,
    register,
    watch,
    setValue,
    reset,
    getValues,
    formState: { isValid, errors },
  } = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      type: 'private',
      serviceType: '',
      customService: '',
      childrenCount: 1,
      eventName: '',
      description: '',
      name: '',
      email: '',
      phone: '',
      location: '',
      notes: '',
    },
    mode: 'onChange',
  });

  const formValues = watch();

  const isFormFilled = !!(
    formValues.name &&
    formValues.email &&
    formValues.phone &&
    formValues.serviceType &&
    formValues.location &&
    formValues.childrenCount >= 1 &&
    formValues.childrenCount <= 20
  );

  // Helper: mark a single field as touched
  const markTouched = useCallback((field: string) => {
    setTouchedFields((prev) => ({ ...prev, [field]: true }));
  }, []);

  // Helper: clear all touched state (on full reset)
  const clearTouched = useCallback(() => {
    setTouchedFields({});
  }, []);

useEffect(() => {
  const searchParams = new URLSearchParams(window.location.search);
  const rawService = searchParams.get('service')?.trim();
  const rawName = searchParams.get('name')?.trim();
  const rawLocation = searchParams.get('location')?.trim();

  // Build a clean set of only valid parameters
  const cleanParams = new URLSearchParams();
  if (rawService)  { cleanParams.set('service', rawService); setValue('serviceType', rawService); }
  if (rawName)     { cleanParams.set('name', rawName);       setValue('name', rawName); }
  if (rawLocation) { cleanParams.set('location', rawLocation); setValue('location', rawLocation); }

  // Replace the URL with only the valid parameters – they stay visible
  const newQuery = cleanParams.toString();
  const newUrl = window.location.pathname + (newQuery ? `?${newQuery}` : '');
  window.history.replaceState({}, '', newUrl);
}, [setValue]);
// Add this near the other hooks in BookingPageClient
useEffect(() => {
  return () => {
    // Cleanup on unmount
    if (eventSourceRef.current) eventSourceRef.current.close();
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (iframeTimeoutRef.current) clearTimeout(iframeTimeoutRef.current);
  };
}, []);
  // --- Data Fetching & Error Reporting
  useEffect(() => {
    if (retriesExhaustedService && typesError) {
      reportError(typesError, true);
    } else if (!typesError) {
      clearError();
    }
  }, [retriesExhaustedService, typesError, reportError, clearError]);

  useEffect(() => {
    initBookingRef.current = initBooking;
  }, [initBooking]);


  // --- Cal.com Initialization
  // Initialize once. calReady gates rendering of the <Cal> component.
  // iframeLoading is managed per-embed with its own resetable timeout.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cal = await getCalApi({ namespace: 'booking' });
        if (!mounted) return;
        cal('ui', {
          theme: 'light',
          styles: { branding: { brandColor: '#000000' } },
          hideEventTypeDetails: false,
        });
        cal('on', {
          action: '*',
          callback: (e: any) => {
            const type = e?.detail?.type;
            // Cal emits iframeReady when the booking iframe is fully painted
            if (type === 'iframeReady' || type === '__iframeReady') {
              if (iframeTimeoutRef.current) clearTimeout(iframeTimeoutRef.current);
              setIframeLoading(false);
            }
            if (type === 'bookingFailed') {
              if (iframeTimeoutRef.current) clearTimeout(iframeTimeoutRef.current);
              setEmbedError(true);
              setIframeLoading(false);
            }
          },
        });
        // Mark ready whether or not cal('ui') worked — the component will
        // attempt to render and surface real errors itself.
        if (mounted) setCalReady(true);
      } catch (err) {
        if (mounted) {
          console.error('Cal init error:', err);
          // Still mark ready so the embed can try to render
          setCalReady(true);
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  // --- Full Reset (wipes everything including sessionStorage)
  const resetWithoutAnimation = useCallback(() => {
    reset({
      type: 'private',
      serviceType: '',
      customService: '',
      childrenCount: 1,
      eventName: '',
      description: '',
      name: '',
      email: '',
      phone: '',
      location: '',
      notes: '',
    });
    clearTouched();
    setEmbedError(false);
    setIsGenerating(false);
    setIframeLoading(false);
    if (iframeTimeoutRef.current) clearTimeout(iframeTimeoutRef.current);
    setImagePreview((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return '';
    });
setImageUploadResult(null);
    setCalLink(null);
    setCalConfig(null);
    tokenRef.current = null;
    embedShownRef.current = false;
    lastSnapshotRef.current = '';
    if (eventSourceRef.current) eventSourceRef.current.close();
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    reconnectAttempts.current = 0;
    // Clear ALL booking-related sessionStorage keys
    sessionStorage.removeItem('bookingCalLink');
    sessionStorage.removeItem('bookingCalConfig');
    sessionStorage.removeItem('bookingToken');
    window.history.replaceState({}, '', window.location.pathname);
    setStep('form');
  }, [reset, clearTouched]);

  const resetWithAnimation = useCallback(() => {
    setShowAnimation(true);
    setTimeout(() => {
      resetWithoutAnimation();
      setShowAnimation(false);
    }, 2000);
  }, [resetWithoutAnimation]);

  // --- Token Management
  const getValidToken = (): string | null => {
    const dataStr = sessionStorage.getItem('bookingToken');
       if (!dataStr) return null;

    try {
      const { token, expiresAt } = JSON.parse(dataStr);
      if (Date.now() < expiresAt) return token;
      // Expired – wipe everything so a refresh shows a clean form
      sessionStorage.removeItem('bookingToken');
      sessionStorage.removeItem('bookingCalLink');
      sessionStorage.removeItem('bookingCalConfig');
      window.history.replaceState({}, '', window.location.pathname);
      return null;
    } catch {
      sessionStorage.removeItem('bookingToken');
      sessionStorage.removeItem('bookingCalLink');
      sessionStorage.removeItem('bookingCalConfig');
      window.history.replaceState({}, '', window.location.pathname);
      return null;
    }
  };

  // --- SSE / Polling Fallback
  const startPollingFallback = useCallback(
    (token: string) => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const status = await publicAPI<{ status: string }>(`/booking-status?token=${token}`);
          if (status.status === 'completed') {
            clearInterval(pollingIntervalRef.current!);
            resetWithAnimation();
            toast.success(t('form.success'));
          } else if (status.status === 'expired') {
            clearInterval(pollingIntervalRef.current!);
            resetWithoutAnimation();
            toast.error(t('form.sessionExpired'));
          }
        } catch {
          // keep polling silently
        }
      }, FALLBACK_POLLING_INTERVAL);
    },
    [resetWithAnimation, resetWithoutAnimation, t]
  );

 const setupSSE = useCallback(
  (token: string) => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    const eventSource = new EventSource(
      `${PUBLIC_API_URL}/api/public/booking-events?token=${token}`
    );
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      if (event.data === 'created') {
        resetWithAnimation();
        toast.success(t('form.success'));
        eventSource.close();
      } else if (event.data === 'expired') {
        resetWithoutAnimation();
        toast.error(t('form.sessionExpired'));
        eventSource.close();
      }
    };
    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;
      if (!getValidToken()) {
        resetWithoutAnimation();
        return;
      }
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.pow(2, reconnectAttempts.current) * 1000;
        reconnectAttempts.current++;
        reconnectTimerRef.current = setTimeout(() => setupSSE(token), delay);
      } else {
        startPollingFallback(token);
      }
    };
  },
  [resetWithAnimation, resetWithoutAnimation, t, startPollingFallback]
);

  // --- Token Expiry Check (client-side interval)
  useEffect(() => {
    if (step !== 'calendar') return;
    const interval = setInterval(() => {
      const tokenDataStr = sessionStorage.getItem('bookingToken');
      if (!tokenDataStr) {
        resetWithoutAnimation();
        return;
      }
      try {
        const { expiresAt } = JSON.parse(tokenDataStr);
        if (Date.now() > expiresAt) {
          toast.error(t('form.sessionExpired'));
          resetWithoutAnimation();
        }
      } catch {
        resetWithoutAnimation();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [step, resetWithoutAnimation, t]);

  // --- File Helpers

  // --- Generate Embed
  const generateEmbed = useCallback(async () => {
    if (!isFormFilled && !tokenRef.current) return;
    if (generatingRef.current) return;
    generatingRef.current = true;
    setIsGenerating(true);
    setEmbedError(false);
    skipEffectRef.current = true;

    try {
     
      const validToken = getValidToken();
      const bookingData = {
        type: formValues.type,
        serviceType: formValues.serviceType,
        customService: formValues.customService,
        childrenCount: formValues.childrenCount,
        eventName: formValues.eventName,
        description: formValues.description,
        name: formValues.name,
        email: formValues.email,
        token: validToken,
        phone: formValues.phone,
        notes: formValues.notes,
        location: formValues.location,
       imageUrl: imageUploadResult?.url || '',
  imagePublicId: imageUploadResult?.public_id || '',
 
      };

      const { token } = await withErrorHandling(initBookingRef.current(bookingData), {
        showToast: false,
      });

      const tokenData = { token, expiresAt: Date.now() + 30 * 60 * 1000 };
       if (token !== tokenRef.current) {
        tokenRef.current = token;
        sessionStorage.setItem('bookingToken', JSON.stringify(tokenData));
        // Token stays in sessionStorage only — never in the URL
        // (URL exposes it in Referer headers sent to Cal.com embed)
      }

      const selectedService = serviceTypes?.find(
        (s: any) => s.calcom_slug === formValues.serviceType
      );
      const baseUrl = process.env.NEXT_PUBLIC_CALCOM_BASE_URL!;
      const username = baseUrl.split('/').pop() || '';
      const eventSlug = selectedService?.calcom_slug || 'other';
      const fullSlug = username && eventSlug ? `${username}/${eventSlug}` : '';

      if (!fullSlug) {
        console.error('Invalid calLink – missing username or eventSlug');
        setEmbedError(true);
        return;
      }

      // Cal.com embed prefill – per official docs:
      // • name, email, notes, guests are top-level string keys.
      // • location must be JSON.stringify({ value, optionValue }) where
      //   value="attendeeInPerson" means an in-person address.
      // • attendeePhoneNumber and utmCampaign are also top-level.
      const newCalConfig = {
        name: formValues.name,
        email: formValues.email,
        notes: formValues.notes || '',
        attendeePhoneNumber: formValues.phone,
        utmCampaign: token,
        location: JSON.stringify({
          value: 'attendeeInPerson',
          optionValue: formValues.location,
        }),
         language: locale === 'fr' ? 'fr' : 'ar', 
      };

      setCalLink(fullSlug);
      setCalConfig(newCalConfig);

      // Start iframe loading state now that the embed URL is ready.
      // The Cal 'iframeReady' event clears it; this timeout is the hard fallback.
      setIframeLoading(true);
      if (iframeTimeoutRef.current) clearTimeout(iframeTimeoutRef.current);
      iframeTimeoutRef.current = setTimeout(() => setIframeLoading(false), 8000);

      sessionStorage.setItem('bookingCalLink', fullSlug);
      sessionStorage.setItem('bookingCalConfig', JSON.stringify(newCalConfig));

      if (!embedShownRef.current) {
        embedShownRef.current = true;
        setupSSE(token);
      }
    } catch (err: any) {
      if (err.code === 'EXPIRED_TOKEN') {
        sessionStorage.removeItem('bookingToken');
        tokenRef.current = null;
        // Retry once with a clean token
        generatingRef.current = false;
        skipEffectRef.current = false;
        setIsGenerating(false);
        return generateEmbed();
      }
      if (err instanceof RateLimitError) {
        toast.error(t('form.rateLimit', { seconds: err.retryAfter }));

  } else {
    console.error('Failed to generate embed:', err);
    toast.error(t('form.error'));
  }


      if (iframeTimeoutRef.current) clearTimeout(iframeTimeoutRef.current);
      setEmbedError(true);
      setIframeLoading(false);
    } finally {
      generatingRef.current = false;
      skipEffectRef.current = false;
      setIsGenerating(false);
    }
  }, [
    formValues,
    serviceTypes,
    setupSSE,
    t,
    isFormFilled,
    resetWithoutAnimation,
  ]);

  // No auto-effect. generateEmbed is called only from handleNext (explicit user
  // action) or the retry button. This eliminates all unintended /booking-init calls.

  // --- Session Restoration on Mount
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const restore = async () => {
      const savedToken = getValidToken();
      if (!savedToken) return;

      restoringRef.current = true;
      try {
        const preBooking = await publicAPI<any>(`/prebooking-data?token=${savedToken}`);
        if (!preBooking.serviceType) throw new Error('Missing serviceType');

        // Reset form with ALL fields from Redis, including phone
        reset({
          type: preBooking.type ?? 'private',
          serviceType: preBooking.serviceType ?? '',
          customService: preBooking.customService ?? '',
          childrenCount: preBooking.childrenCount ?? 1,
          eventName: preBooking.eventName ?? '',
          description: preBooking.description ?? '',
          name: preBooking.name ?? '',
          email: preBooking.email ?? '',
          phone: preBooking.phone ?? '',   // ← explicitly restore phone
          location: preBooking.location ?? '',
          notes: preBooking.notes ?? '',
        });

       if (preBooking.imageUrl) {
  setImagePreview(preBooking.imageUrl);
  setImageUploadResult({ public_id: preBooking.imagePublicId, url: preBooking.imageUrl });
} else {
  setImagePreview('');
  setImageUploadResult(null);
}
        tokenRef.current = savedToken;

        const savedCalLink = sessionStorage.getItem('bookingCalLink');
        const savedCalConfigStr = sessionStorage.getItem('bookingCalConfig');
        if (savedCalLink) setCalLink(savedCalLink);
        if (savedCalConfigStr) {
          try { setCalConfig(JSON.parse(savedCalConfigStr)); } catch {}
        }

        // Build the same snapshot key that handleNext uses so a Back→Next
        // without changes won't trigger a new /booking-init call.
        lastSnapshotRef.current = JSON.stringify({
          serviceType: preBooking.serviceType ?? '',
          name: preBooking.name ?? '',
          email: preBooking.email ?? '',
          phone: preBooking.phone ?? '',
          location: preBooking.location ?? '',
          notes: preBooking.notes ?? '',
          childrenCount: preBooking.childrenCount ?? 1,
          type: preBooking.type ?? 'private',
          customService: preBooking.customService ?? '',
          eventName: preBooking.eventName ?? '',
          description: preBooking.description ?? '',
         imageUploadResult: preBooking.imageUrl || null,

        });

        // Re-establish SSE so a booking completion resets the form
        // even after a page refresh.
        embedShownRef.current = true;
        setupSSE(savedToken);

        setStep('calendar');
      } catch (err) {
        console.warn('Failed to restore session:', err);
        // Token invalid or expired – clean slate
        sessionStorage.removeItem('bookingToken');
        sessionStorage.removeItem('bookingCalLink');
        sessionStorage.removeItem('bookingCalConfig');
       // window.history.replaceState({}, '', window.location.pathname);
      } finally {
        restoringRef.current = false;
      }
    };

    restore();
  }, [reset]);

  // --- Navigation
  // handleNext is the ONLY place generateEmbed is called (besides retry).
  // We compare the current form snapshot against the last committed snapshot so
  // that going Back → Next without changing anything reuses the existing embed.
  const handleNext = useCallback(async () => {
    if (!isValid) return;

    const currentSnapshot = JSON.stringify({
      serviceType: formValues.serviceType,
      name: formValues.name,
      email: formValues.email,
      phone: formValues.phone,
      location: formValues.location,
      notes: formValues.notes,
      childrenCount: formValues.childrenCount,
      type: formValues.type,
      customService: formValues.customService,
      eventName: formValues.eventName,
      description: formValues.description,
      imageUploadResult: imageUploadResult?.url || null,
    });

    const needsInit = !tokenRef.current
      || !calLink
      || currentSnapshot !== lastSnapshotRef.current;

    if (needsInit) {
      lastSnapshotRef.current = currentSnapshot;
      // Generate embed first, THEN show step 2.
      // This prevents the flicker where step 2 renders for a moment then
      // gets reset back to step 1 if generateEmbed fails or resets state.
      await generateEmbed();
      // Only advance if embed was successfully prepared (no error, token exists)
      if (tokenRef.current && !embedError) {
        setStep('calendar');
      }
    } else {
      setStep('calendar');
    }
  }, [isValid, formValues,   calLink, generateEmbed, embedError]);

  const handleBack = () => setStep('form');

  // --- Loading / Error States
  if (typesLoading)
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (typesError)
    return (
      <RetryableError
        error={typesError}
        onRetry={retryServiceTypes}
        isRetrying={isRetryingServiceTypes}
      />
    );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 sm:py-16">
      <ScrollReveal>
        <h1 className="text-3xl sm:text-5xl md:text-7xl font-black mb-6 text-center">
          {t('title')}
        </h1>
        <p className="text-gray-500 text-lg sm:text-xl text-center mb-8 sm:mb-12">
          {t('subtitle')}
        </p>
      </ScrollReveal>

      {/* Step indicator */}
      <div className="flex justify-center mb-8">
        <div className="flex items-center gap-4">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              step === 'form' ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500'
            }`}
          >
            1
          </div>
          <div className="w-12 h-0.5 bg-gray-200" />
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              step === 'calendar' ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500'
            }`}
          >
            2
          </div>
        </div>
      </div>

      {/* ── FORM STEP ── */}
      {step === 'form' && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <div className="space-y-6">

            {/* Booking Type */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('form.bookingType')} <span className="text-red-500">*</span>
              </label>
              <select {...register('type')} className="w-full p-3 rounded-2xl border border-gray-200">
                <option value="private">{t('form.privateOption')}</option>
                <option value="public">{t('form.publicOption')}</option>
              </select>
            </div>

            {/* Service Type */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('form.serviceType')} <span className="text-red-500">*</span>
              </label>
              <select {...register('serviceType')} className="w-full p-3 rounded-2xl border border-gray-200">
  <option value="">{t('form.selectPlaceholder')}</option>
  {sortedServiceTypes?.map((s: any) => (
    <option key={s.id} value={s.calcom_slug}>
      {locale === 'fr' ? s.name_fr : s.name_ar}
    </option>
  ))}
</select>
              {errors.serviceType && (
                <p className="text-red-500 text-sm mt-1">{errors.serviceType.message}</p>
              )}
            </div>

            {/* Custom Service */}
         {watch('serviceType') === otherSlug && (
  <div>
    <label className="block text-sm font-medium mb-2">{t('form.customService')}</label>
    <input
      type="text"
      {...register('customService')}
      className="w-full p-3 rounded-2xl border border-gray-200"
    />
  </div>
)}

            {/* Children Count */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('form.childrenCount')} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="20"
                {...register('childrenCount', { valueAsNumber: true })}
                className="w-full p-3 rounded-2xl border border-gray-200"
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setValue('childrenCount', isNaN(val) || val < 1 ? 1 : val);
                }}
              />
              {errors.childrenCount && (
                <p className="text-red-500 text-sm mt-1">{errors.childrenCount.message}</p>
              )}
            </div>

            {/* Event Name */}
            <div>
              <label className="block text-sm font-medium mb-2">{t('form.eventName')}</label>
              <input
                type="text"
                {...register('eventName')}
                className="w-full p-3 rounded-2xl border border-gray-200"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-2">{t('form.description')}</label>
              <textarea
                {...register('description')}
                rows={3}
                className="w-full p-3 rounded-2xl border border-gray-200"
              />
            </div>

            {/* Image (public only) */}
            {watch('type') === 'public' && (
              <div>
                <label className="block text-sm font-medium mb-2">{t('form.image')}</label>
              <ImageUpload
  onUpload={(result) => {
    if (result) {
      setImageUploadResult(result);
      setImagePreview(result.url);
    } else {
      setImageUploadResult(null);
      setImagePreview('');
    }
  }}
  previewUrl={imagePreview}
/>
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('form.name')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                autoComplete="name"
                {...register('name')}
                className="w-full p-3 rounded-2xl border border-gray-200"
              />
              {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('form.email')} <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                autoComplete="email"
                {...register('email', { onBlur: () => markTouched('email') })}
                className="w-full p-3 rounded-2xl border border-gray-200"
              />
              {touchedFields.email && errors.email && (
                <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('form.phone')} <span className="text-red-500">*</span>
              </label>
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <PhoneInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={() => { field.onBlur(); markTouched('phone'); }}
                    error={touchedFields.phone ? errors.phone?.message : undefined} 
                                                                  placeholder={t('form.phonePlaceholder')}

                  />
                )}
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('form.location')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                autoComplete="street-address"
                {...register('location', { onBlur: () => markTouched('location') })}
                className="w-full p-3 rounded-2xl border border-gray-200"
              />
              {touchedFields.location && errors.location && (
                <p className="text-red-500 text-sm mt-1">{errors.location.message}</p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium mb-2">{t('form.notes')}</label>
              <textarea
                {...register('notes')}
                rows={3}
                className="w-full p-3 rounded-2xl border border-gray-200"
              />
            </div>
          </div>

          {/* Next */}
          <div className="mt-8 flex justify-end">
            <button
              onClick={handleNext}
              disabled={!isValid || isGenerating}
              className="px-6 py-3 bg-primary text-white rounded-xl hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isGenerating && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('form.next')}
            </button>
          </div>
        </div>
      )}

      {/* ── CALENDAR STEP ── */}
      {step === 'calendar' && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 flex flex-col min-h-[600px]">
          <div className="flex justify-between items-center mb-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-gray-600 hover:text-primary"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('calendar.back')}
            </button>
          </div>

          <h3 className="text-lg font-semibold mb-2 text-center">{t('calendar.title')}</h3>
          <p className="text-sm text-gray-500 mb-4 text-center">{t('calendar.instructions')}</p>

          {/* Error state */}
          {embedError && !isGenerating && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
              <p className="text-red-500 text-center">{t('calendar.loadError')}</p>
              <button
                onClick={generateEmbed}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/80"
              >
                <RefreshCw className="w-4 h-4" />
                {t('calendar.retry')}
              </button>
            </div>
          )}

          {/* Cal embed container – always rendered once calLink is ready so the
              iframe can mount and fire iframeReady. The loading overlay sits on
              top of it; we never unmount the iframe while it's loading. */}
          {!embedError && calReady && calLink && calConfig && (
            <div className="relative w-full h-[70vh] sm:h-[600px] overflow-hidden rounded-xl">

              {/* Loading overlay – sits above the iframe until it's ready */}
              {(isGenerating || iframeLoading) && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white rounded-xl">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="ml-2 text-gray-500">{t('calendar.loading')}</span>
                </div>
              )}

              {/* Success animation */}
              {showAnimation && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-transparent">
                  <div className="w-48 h-48">
                    <Lottie animationData={balloonAnimation} loop={false} />
                  </div>
                </div>
              )}

              <Cal
                key={`${calLink}-${calConfig ? JSON.stringify(calConfig) : ''}`}
                calLink={calLink}
                config={calConfig}
                className="w-full h-full border-0"
              />
            </div>
          )}

          {/* Waiting for first generateEmbed call (no calLink yet) */}
          {!embedError && (!calLink || !calConfig) && isGenerating && (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="ml-2 text-gray-500">{t('calendar.loading')}</span>
            </div>
          )}
        </div>
      )}

      {/* Info panel */}
      {step === 'form' && (
        <div className="mt-8 p-4 bg-gray-50 rounded-2xl border border-gray-200">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center font-serif italic text-base font-bold">
              i
            </div>
            <div className="text-sm text-gray-700">
              <p className="font-medium text-gray-800">{t('info.needChanges')}</p>
              <p className="mt-1">
                {t('info.afterBooking')}{' '}
                <button
                  onClick={() =>
                    window.open(
                      'https://cal.com/docs/enterprise-features/rescheduling-and-cancellation',
                      '_blank'
                    )
                  }
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-yellow-50 text-yellow-700 rounded font-medium hover:bg-yellow-100 transition"
                >
                  {t('info.reschedule')}
                </button>{' '}
                {t('common.or')}{' '}
                <button
                  onClick={() =>
                    window.open(
                      'https://cal.com/docs/enterprise-features/rescheduling-and-cancellation',
                      '_blank'
                    )
                  }
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-50 text-red-700 rounded font-medium hover:bg-red-100 transition"
                >
                  {t('info.cancel')}
                </button>{' '}
                {t('info.appointment')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}