import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export default async function RootNotFound() {
  const headersList = await headers();
  const acceptLanguage = headersList.get('accept-language') || '';
  
  // Determine preferred locale – default to French
  const preferredLocale = acceptLanguage.includes('ar') ? 'ar' : 'fr';
  
  redirect(`/${preferredLocale}/404`);
}