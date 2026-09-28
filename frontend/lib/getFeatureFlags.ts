let cachedFlags: Record<string, boolean> | null = null;

export async function getFeatureFlags(): Promise<Record<string, boolean>> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/public/feature-flags`,
      { next: { revalidate: 300 } }
    );
    if (res.ok) {
      cachedFlags = await res.json();
      return cachedFlags;
    }
  } catch {}
  // Last known good, or a Proxy that returns false for any unknown flag
  return cachedFlags ?? new Proxy({} as Record<string, boolean>, {
    get: () => false,
  });
}