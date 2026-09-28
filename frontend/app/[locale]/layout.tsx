import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Toaster } from 'sonner';
import { TailscaleGateProvider } from '@/components/providers/TailscaleGateProvider';
import { getSiteData } from '@/lib/getSiteData';
import { VisitorGeo } from '@/components/shared/VisitorGeo';
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { name, slogan, favicon } = await getSiteData(locale);
  return {
    title: { default: name, template: `${name} | %s` },
    description: slogan,
    icons: { icon: favicon },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'fr' && locale !== 'ar') notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
        <TailscaleGateProvider>
          <VisitorGeo />
          {children}
          <Toaster richColors position="top-right" />
        </TailscaleGateProvider>
    </NextIntlClientProvider>
  );
}