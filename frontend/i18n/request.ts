// frontend/i18n/request.ts
import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  let locale = cookieStore.get('NEXT_LOCALE')?.value || 'fr';
  
  // Validate locale
  if (locale !== 'fr' && locale !== 'ar') {
    locale = 'fr';
  }

  try {
    const messages = (await import(`../public/locales/${locale}/common.json`)).default;
    
    // Debug log to verify
    console.log(`🌐 Loading locale: ${locale}`, {
      hasHomeTitle: !!messages.home?.title,
      hasHomeSubtitle: !!messages.home?.subtitle
    });

    return {
      locale,
      messages
    };
  } catch (error) {
    console.error(`Failed to load messages for ${locale}:`, error);
    // Fallback to French
    const fallbackMessages = (await import(`../public/locales/fr/common.json`)).default;
    return {
      locale: 'fr',
       timeZone: 'Africa/Tunis', 
      messages: fallbackMessages
    };
  }
});