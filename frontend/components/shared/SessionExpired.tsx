'use client'
import { useTranslations } from 'next-intl';


export function SessionExpired() {


  const t = useTranslations('common');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-2xl">
        <h2 className="text-2xl font-bold mb-4">{t('sessionExpired')}</h2>
        <p>{t('pleaseLoginAgain')}</p>
      </div>
    </div>
  )
}
