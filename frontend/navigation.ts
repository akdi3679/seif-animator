import { createNavigation } from 'next-intl/navigation';

// Define your supported locales and default locale (must match those in i18n/request.ts)
export const locales = ['fr', 'ar'] as const;
export const defaultLocale = 'fr';

export const { Link, redirect, usePathname, useRouter } = createNavigation({
  locales,
  defaultLocale
});