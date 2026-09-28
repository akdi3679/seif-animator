import { NetworkStatusProvider } from '@/components/providers/NetworkStatusProvider';
import { ErrorHandler } from '@/components/providers/ErrorHandler';
import { Navbar } from '@/components/public/Navbar';
import { Suspense } from 'react';
import { FloatingPanelProvider } from '@/components/providers/FloatingPanelProvider';
import { ProductCacheProvider } from '@/components/providers/ProductCacheProvider';
import { ServiceTypesProvider } from '@/components/providers/ServiceTypesProvider';
import { SiteDataProvider } from '@/components/providers/SiteDataProvider';
import { FaviconUpdater } from '@/components/shared/FaviconUpdater';
import { EventsProvider } from '@/components/providers/EventsProvider';
import { SiteImagesProvider } from '@/components/providers/SiteImagesProvider';
import { ContactInfoProvider } from '@/components/providers/ContactInfoProvider';
import { FeatureFlagsProvider } from '@/components/providers/FeatureFlagsProvider';
import { getFeatureFlags } from '@/lib/getFeatureFlags';
import { Footer } from '@/components/public/Footer';
import EventsPanelWrapper from '@/components/public/EventsPanelWrapper';
import BookPanel from '@/components/public/BookPanel';
import FeatureGate from '@/components/shared/FeatureGate';
import { CartSidebar } from '@/components/public/CartSidebar';
import { CookieConsentProvider } from '@/components/providers/CookieConsentProvider';
import { CartProvider } from '@/components/providers/CartProvider';
import { FloatingNavbar } from '@/components/public/FloatingNavbar';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const flags = await getFeatureFlags();

  return (
    <NetworkStatusProvider>
      <ErrorHandler>
        <FeatureFlagsProvider initialFlags={flags}>
          <FloatingPanelProvider>
            <CookieConsentProvider>
              <CartProvider>
                <ServiceTypesProvider>
                  <SiteDataProvider>   {/* locale removed – uses useParams internally */}
                    <FaviconUpdater />
                    <EventsProvider>
                      <SiteImagesProvider>
                        <ContactInfoProvider>
                          <ProductCacheProvider>
                            <Navbar />
                            <main className="pt-16">{children}</main>
                            <Suspense fallback={null}>
                              <FeatureGate flag="events"><EventsPanelWrapper /></FeatureGate>
                            </Suspense>
                            <Suspense fallback={null}>
                              <FeatureGate flag="bookingpanel"><BookPanel /></FeatureGate>
                            </Suspense>
                            <CartSidebar />
                            <FloatingNavbar />
                            <Footer />
                          </ProductCacheProvider>
                        </ContactInfoProvider>
                      </SiteImagesProvider>
                    </EventsProvider>
                  </SiteDataProvider>
                </ServiceTypesProvider>
              </CartProvider>
            </CookieConsentProvider>
          </FloatingPanelProvider>
        </FeatureFlagsProvider>
      </ErrorHandler>
    </NetworkStatusProvider>
  );
}