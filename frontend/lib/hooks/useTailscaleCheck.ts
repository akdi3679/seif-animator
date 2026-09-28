'use client';

import useSWR from 'swr';

const fetcher = () =>
  fetch('/api/public/tailscale-verify', {
    method: 'POST',
  }).then(res => res.json());

export function useTailscaleCheck() {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isTailscaleSite = hostname.startsWith('100.');

  const { data } = useSWR(isTailscaleSite ? '/tailscale-verify' : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  return { allowed: isTailscaleSite && data?.allowed === true };
}