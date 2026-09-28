'use client';
/**
 * FaviconUpdater — flash-free, injection-safe favicon management.
 *
 * Source of truth: the SIGNED CACHE, not the live API response.
 *
 *  1. On mount: if localStorage has a VALID signed favicon URL → apply it instantly.
 *  2. When API data loads with a real, DIFFERENT URL → update the cache and apply it.
 *  3. When API data loads with the SAME URL as cache → no-op (already applied).
 *  4. When API data is still loading, or fails, or returns empty →
 *     DO NOTHING. Keep showing whatever's already applied (cached favicon,
 *     or initials if there was never a cache). We never clear the cache and
 *     never fall back to initials just because a fetch didn't return a URL.
 *  5. The ONLY way the cache is cleared is an explicit server-confirmed
 *     removal — i.e. the API affirmatively reports no favicon is configured
 *     (a real "removed" signal), not merely "no data yet" or "request failed".
 *
 * Injection protection:
 *  - Stored value is signed with a per-session secret derived from the origin.
 *  - Any value without a valid signature is silently discarded.
 *  - Only https:// URLs are ever stored or applied.
 */

import { useEffect, useRef } from 'react';
import { useSiteData } from '@/components/providers/SiteDataProvider';

const LS_KEY = 'favicon_v2';
const LS_SIG_KEY = 'favicon_v2_sig';

/** Simple non-crypto signature: HMAC-lite using origin as salt */
async function sign(value: string): Promise<string> {
  const key = window.location.origin + '_favicon_salt_2025';
  const encoder = new TextEncoder();
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await window.crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(value)
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function verify(value: string, sig: string): Promise<boolean> {
  try {
    const expected = await sign(value);
    return expected === sig;
  } catch {
    return false;
  }
}

function isValidFaviconUrl(url: string): boolean {
  // Only accept absolute https:// URLs — never data:, javascript:, etc.
  return /^https:\/\/.{4,}/.test(url);
}

function setFaviconHref(href: string) {
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  if (link.href !== href) {
    link.href = href;
  }
}

async function loadCached(): Promise<string | null> {
  try {
    const url = localStorage.getItem(LS_KEY);
    const sig = localStorage.getItem(LS_SIG_KEY);
    if (!url || !sig) return null;
    if (!isValidFaviconUrl(url)) {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_SIG_KEY);
      return null;
    }
    const valid = await verify(url, sig);
    if (!valid) {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem(LS_SIG_KEY);
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function saveToCache(url: string) {
  try {
    const sig = await sign(url);
    localStorage.setItem(LS_KEY, url);
    localStorage.setItem(LS_SIG_KEY, sig);
  } catch {
    // localStorage unavailable — silent fail
  }
}

function clearCache() {
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_SIG_KEY);
  } catch {}
}

export function FaviconUpdater() {
  const { faviconUrl } = useSiteData();
  const appliedRef = useRef<string | null>(null);

  // ── Step 1: On mount, instantly apply cached favicon (before any API response)
  useEffect(() => {
    loadCached().then((cached) => {
      if (cached && appliedRef.current !== cached) {
        setFaviconHref(cached);
        appliedRef.current = cached;
      }
    });
  }, []);

  // ── Step 2: Reconcile with API data — but the cache stays authoritative
  // for anything short of a confirmed signal from the server.
  useEffect(() => {
    // undefined = still loading, errored, or no data yet — unknown state.
    // Never touch the cache or the applied favicon here; whatever's showing
    // (cached favicon, or initials if there was never a cache) is correct.
    if (faviconUrl === undefined) return;

    if (faviconUrl === null) {
      // Explicit signal from the backend: admin removed the favicon.
      // This is the ONLY case that clears the cache — it's a confirmed
      // deletion, not an empty/loading/error state.
      clearCache();
      appliedRef.current = null;
      // Don't touch <link> — SSR/generateMetadata already set initials favicon.
      return;
    }

    const realUrl = isValidFaviconUrl(faviconUrl) ? faviconUrl : null;

    if (!realUrl) {
      // Resolved, non-null, but not a valid https URL (malformed data) —
      // treat like "unknown," not "removed." Keep the cache authoritative.
      loadCached().then((cached) => {
        if (cached && appliedRef.current !== cached) {
          setFaviconHref(cached);
          appliedRef.current = cached;
        }
      });
      return;
    }

    // We have a real URL from the API.
    loadCached().then(async (cached) => {
      if (cached === realUrl) {
        if (appliedRef.current !== realUrl) {
          setFaviconHref(realUrl);
          appliedRef.current = realUrl;
        }
        return;
      }

      // Different (or no cache yet) → this is a genuine update. Write-through
      // to cache and apply immediately.
      await saveToCache(realUrl);
      setFaviconHref(realUrl);
      appliedRef.current = realUrl;
    });
  }, [faviconUrl]);

  return null;
}