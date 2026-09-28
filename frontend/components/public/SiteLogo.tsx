'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Link } from '@/navigation';
import { useSiteData } from '@/components/providers/SiteDataProvider';

export function SiteLogo() {
  const { name, slogans, logoUrl } = useSiteData();
  const [sloganIndex, setSloganIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
const [imgError, setImgError] = useState(false);
  const hasSlogans = slogans.length > 0;

const [currentIndex, setCurrentIndex] = useState(0);

useEffect(() => {
  if (slogans.length <= 1) return;
  const interval = setInterval(() => {
    setCurrentIndex(prev => (prev + 1) % slogans.length);
  }, 4000);
  return () => clearInterval(interval);
}, [slogans.length]);

 
  return (
    <Link href="/" className="h-full flex items-center gap-3 no-underline">
     {logoUrl && logoUrl.startsWith('http') && !imgError ? (
  <Image
    src={logoUrl}
    alt={name}
    width={0}
    height={0}
    className="h-full w-auto max-w-[200px] object-contain rounded-none"
    priority
    sizes="200px"
    onError={() => setImgError(true)}
  />
) : (
  <span className="text-2xl font-black bg-gradient-to-r from-[#C084FC] via-[#818CF8] to-[#C084FC] bg-[length:200%_auto] animate-shimmer bg-clip-text text-transparent">
    {name}
  </span>
)}
      {hasSlogans && (
  <span className="text-xs text-gray-500 transition-opacity duration-500">
    {slogans[currentIndex]}
  </span>
)}
    </Link>
  );
}