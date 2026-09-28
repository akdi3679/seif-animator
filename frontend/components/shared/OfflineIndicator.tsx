// frontend/components/shared/OfflineIndicator.tsx
'use client'

import { useState, useEffect } from 'react'
import { WifiOff } from 'lucide-react'
import { useTranslations } from 'next-intl';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false)
const t = useTranslations('common');

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initial check
    setIsOffline(!navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="fixed bottom-4 left-4 z-50 bg-red-500 text-white px-4 py-2 rounded-full text-sm flex items-center gap-2 shadow-lg">
      <WifiOff className="w-4 h-4" />
      <span>{t('offline')}</span>
    </div>
  )
}