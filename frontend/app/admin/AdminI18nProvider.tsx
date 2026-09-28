'use client';
import { NextIntlClientProvider } from 'next-intl';
import { SiteDataProvider } from '@/components/providers/SiteDataProvider';
import frMessages from '@/public/locales/fr/common.json';
import { AdminWeatherProvider } from '@/components/providers/AdminWeatherProvider';

export default function AdminI18nProvider({ children }: { children: React.ReactNode }) {
  return (
   <NextIntlClientProvider locale="fr" messages={frMessages}>
  <SiteDataProvider locale="fr">
    <AdminWeatherProvider>
      {children}    
    </AdminWeatherProvider>
  </SiteDataProvider>
</NextIntlClientProvider>
  );
}