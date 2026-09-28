'use client';

import { useEffect, useRef } from 'react';

import { usePathname } from 'next/navigation';

import { getCachedGeo } from '@/lib/hooks/useGeoLocation';

import { usePublicPOST } from '@/lib/api/hooks';

export function VisitorGeo() {

  const pathname = usePathname();

  const { mutate: postGeo } = usePublicPOST('/geo-lookup', { showToast: false });

  // Stash the latest mutate function in a ref so the useEffect can depend
  // ONLY on pathname. Without this, if usePublicPOST returns a new
  // function reference on every render (very common if the hook does
  // not useCallback internally), the effect re-fires on every render
  // and we get an infinite /geo-lookup loop.
  const postGeoRef = useRef(postGeo);
  postGeoRef.current = postGeo;

  // Track the last pathname we POSTed for, so we don't double-fire on
  // re-renders that don't actually change the route.
  const lastTrackedPathRef = useRef<string | null>(null);

  useEffect(() => {

    if (!pathname) return;

    // Skip admin / auth pages — only track genuine public visitors
    const isAdminOrAuth =
      pathname.startsWith('/admin') ||
      pathname.includes('/login') ||
      pathname.includes('/verify-2fa') ||
      pathname.includes('/forgot-password') ||
      pathname.includes('/reset-password');

    if (isAdminOrAuth) return;

    // Only fire once per actual pathname change
    if (lastTrackedPathRef.current === pathname) return;
    lastTrackedPathRef.current = pathname;

    (async () => {
      try {
        const geo = await getCachedGeo();
        if (!geo) return;
        await postGeoRef.current(geo);
      } catch {
        // silent – tracking failure should never break the page
      }
    })();

  }, [pathname]);

  return null;

}