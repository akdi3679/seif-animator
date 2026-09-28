function generateInitialsFavicon(name: string): string {
  const letter = name.trim().charAt(0).toUpperCase() || 'K';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" rx="20" fill="#C184FB"/>
    <text x="50" y="68" font-size="50" font-weight="bold" text-anchor="middle" fill="white" font-family="Outfit, sans-serif">${letter}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export async function getSiteData(locale: string) {
  const fallbackName = locale === 'fr'
    ? process.env.NEXT_PUBLIC_SITE_NAME_FR || 'Kafela'
    : process.env.NEXT_PUBLIC_SITE_NAME_AR || 'كافيلا';

  let name = fallbackName;
  let slogan = fallbackName;
  let favicon = '';
  let logo = '';

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/public/site-data`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json();
      name = (locale === 'fr' ? data.name_fr : data.name_ar) || fallbackName;
      const slogansArr = locale === 'fr' ? (data.slogans_fr || []) : (data.slogans_ar || []);
      slogan = slogansArr.length > 0 ? slogansArr.join(' • ') : fallbackName;
      logo = data.logo_url || '';
      if (data.favicon_url && data.favicon_url.trim() !== '') favicon = data.favicon_url;
    }
  } catch {}

  // favicon fallback chain: favicon → logo → one letter
  if (!favicon) favicon = logo || generateInitialsFavicon(name);

  return { name, slogan, favicon };
}