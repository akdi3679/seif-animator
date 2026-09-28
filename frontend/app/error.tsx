'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('Root error:', error);
    const userLocale = navigator.language.startsWith('ar') ? 'ar' : 'fr';
    router.replace(`/${userLocale}/error`);
  }, [error, router]);

  return null;
}