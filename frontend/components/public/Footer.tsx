'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/public/PhoneInput';
import { usePublicGETSWR, usePublicPOST } from '@/lib/api/hooks';
import { toast } from 'sonner';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { useFeatureFlags } from '@/components/providers/FeatureFlagsProvider';

import { Mail, Plus, Minus } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RateLimitError } from '@/lib/api/types';
import { SiteLogo  } from './SiteLogo';
import { useContactInfo } from '@/components/providers/ContactInfoProvider';

interface SocialLink {
  platform: string;
  url: string;
  icon: string;
}

interface ContactInfo {
  email?: string;
  social_links?: SocialLink[];
}

export function Footer() {
  const t = useTranslations('footer');
  const pathname = usePathname();
  const locale = pathname.split('/')[1];
  const [showPhone, setShowPhone] = useState(false);
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
 const flags = useFeatureFlags(); 


  const isEnabled = (name?: string) => !name || (flags ? flags[name] !== false : true);

const { contactInfo } = useContactInfo();

  const { mutate: subscribe, loading } = usePublicPOST('/newsletter', { showToast: false });
const currentYear = new Date().getFullYear();
const copyrightYears = `${currentYear}`;

  // Schema – phone is optional but must be valid if provided
  const newsletterSchema = z.object({
  email: z.string().email(t('newsletter.invalidEmail')).optional().or(z.literal('')),
  phone: z.string().optional().refine(
    (val) => !val || isValidPhoneNumber(val, { defaultCountry: 'TN' }),
    { message: t('newsletter.invalidPhone') }
  ),
}).refine(data => data.email || data.phone, {
  message: t('newsletter.contactRequired'),
});

  type NewsletterFormData = z.infer<typeof newsletterSchema>;

  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isValid },
    reset,
    trigger,
  } = useForm<NewsletterFormData>({
    resolver: zodResolver(newsletterSchema),
    defaultValues: { email: '', phone: '' },
    mode: 'onChange',
  });

  const markTouched = (field: string) => setTouchedFields(prev => ({ ...prev, [field]: true }));

  const onSubmit = async (data: NewsletterFormData) => {
    try {
      const result = await subscribe(data);
      if (result?.message?.includes('Already subscribed')) {
        toast.success(t('newsletter.alreadySubscribed'));
      } else {
        toast.success(t('newsletter.success'));
      }
      reset();
      setShowPhone(false);
      setTouchedFields({});
    } catch (err: any) {
      if (err instanceof RateLimitError) {
            toast.error(t('newsletter.rateLimit', { seconds: err.retryAfter }));

      } else {
        toast.error(t('newsletter.error'));
      }
    }
  };

  // Social links conversion
  const rawSocial = contactInfo?.social_links;
  const socialLinks: SocialLink[] = rawSocial
    ? Array.isArray(rawSocial)
      ? rawSocial
      : Object.entries(rawSocial as Record<string, string>).map(([platform, url]) => ({
          platform,
          url,
          icon: platform.charAt(0).toUpperCase() + platform.slice(1),
        }))
    : [];

  const renderIcon = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    return Icon ? <Icon className="w-5 h-5" /> : <Mail className="w-5 h-5" />;
  };

  return (
      <footer className="footer-hill text-white pb-12 z-10 mt-0 relative overflow-hidden">


      <div className="max-w-7xl mx-auto px-8 relative z-10">
         <SiteLogo />
        {/* Newsletter */}
        <div className="border-b border-white/10 pb-16 mb-8">
          <h3 className="text-xl font-bold mb-4">{t('newsletter.title')}</h3>
          <p className="text-gray-400 mb-4">{t('newsletter.subtitle')}</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
            {/* Email */}
            <div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  type="email"
                  {...register('email')}
                  onBlur={() => markTouched('email')}
                  placeholder={t('newsletter.emailPlaceholder')}
                  className="pl-10 bg-white/10 border-0 text-white placeholder:text-gray-400 rounded-xl"
                />
              </div>
              {touchedFields.email && errors.email && (
                <p className="text-red-400 text-sm mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Phone (optional, toggleable) */}
            {showPhone && (
              <div>
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
                      error={touchedFields.phone && errors.phone?.message}
                    />
                  )}
                />
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPhone(!showPhone)}
              >
                {showPhone ? <Minus className="w-4 h-4 mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                {showPhone ? t('newsletter.removePhone') : t('newsletter.addPhone')}
              </Button>
              <Button
                type="submit"
                disabled={loading || !isValid}
                className="rounded-xl bg-secondary hover:bg-secondary/90"
              >
                {loading ? t('newsletter.subscribing') : t('newsletter.subscribe')}
              </Button>
            </div>
          </form>
        </div>

        {/* Footer links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 border-b border-white/10 pb-16 mb-8">
          <div className="space-y-2">
            <Link href={`/${locale}`} className="text-white font-bold block hover:underline">{t('home')}</Link>
            <Link href={`/${locale}/about`} className="text-gray-400 block hover:text-white transition">{t('about')}</Link>
            <Link href={`/${locale}/services`} className="text-gray-400 block hover:text-white transition">{t('services')}</Link>
          </div>
          <div className="space-y-2">
            <Link href={`/${locale}/booking`} className="text-white font-bold block hover:underline">{t('booking')}</Link>
            {isEnabled('products') && <Link href={`/${locale}/store`} className="text-gray-400 block hover:text-white transition">{t('store')}</Link>}

            <Link href={`/${locale}/terms?tab=terms`} className="text-gray-400 block hover:text-white transition">{t('tab_terms')}</Link>
          </div>
          <div className="space-y-2">
            <Link href={`/${locale}/contact`} className="text-white font-bold block hover:underline">{t('contact')}</Link>
            <Link href={`/${locale}/gallery`} className="text-gray-400 block hover:text-white transition">{t('gallery')}</Link>
          </div>
          <div>
            <p className="font-bold mb-4 text-white">{t('followUs')}</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {socialLinks.map((link) => (
                <a key={link.platform} href={link.url} target="_blank" rel="noopener noreferrer"
                   className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-primary transition-colors"
                   aria-label={link.platform}
                >
                  {renderIcon(link.icon)}
                </a>
              ))}
              {contactInfo?.email && (
                <a href={`mailto:${contactInfo.email}`} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-primary transition-colors">
                  <Mail className="w-5 h-5" />
                </a>
              )}
            </div>
            {contactInfo?.email && <p className="text-gray-400 text-sm">{contactInfo.email}</p>}
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between text-xs text-gray-500 uppercase tracking-widest gap-4">
         <p>{t('copyright', { years: copyrightYears })}</p>

          <div className="flex gap-6">
  <Link href={`/${locale}/terms?tab=terms`}   className="hover:text-white transition">{t('tab_terms')}</Link>
  <Link href={`/${locale}/terms?tab=privacy`} className="hover:text-white transition">{t('tab_privacy')}</Link>
  <Link href={`/${locale}/terms?tab=conditions`} className="hover:text-white transition">{t('tab_conditions')}</Link>
</div>
        </div>

       
      </div>
    </footer>
  );
}