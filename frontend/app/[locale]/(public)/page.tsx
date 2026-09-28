// app/[locale]/(public)/page.tsx

import { getSiteData } from '@/lib/getSiteData';
import { Metadata } from 'next';

import { MiddleSection } from '@/components/public/MiddleSection'
import { FaqSection } from '@/components/public/FaqSection'
import { WhyChooseUsSection } from '@/components/public/WhyChooseUsSection'
import { CTASection } from '@/components/public/CTASection'
import { SociableKITReviews } from '@/components/public/SociableKITReviews';
import { HeroCarousel } from '@/components/public/HeroCarousel';
import { ServicesSection } from '@/components/public/ServicesSection';
import { GoalsSection } from '@/components/public/GoalsSection';
import { ApprovedBrands } from '@/components/public/ApprovedBrands';
import { BookingSection } from '@/components/public/BookingSection';
import { ContactSection } from '@/components/public/ContactSection';
import { AboutSection } from '@/components/public/AboutSection';
import { FeaturedProducts } from '@/components/public/FeaturedProducts';
import { GallerySection } from '@/components/public/GallerySection';
import FeatureGate from '@/components/shared/FeatureGate'; 
import { KeyFiguresSection } from '@/components/public/KeyFiguresSection';
import { ChallengeSection } from '@/components/public/ChallengeSection';
import { GoalsProvider } from '@/components/providers/GoalsProvider';



export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const { locale } = await params;
  const { name } = await getSiteData(locale);
  return {
    title: { absolute: name }, // shows only the site name
  };
}
export default function HomePage() {
  return (
    <>
      <HeroCarousel />
      <MiddleSection />        
      <AboutSection />
            <WhyChooseUsSection />    

      <ServicesSection />
     <FeatureGate flag="goals">
  <GoalsProvider>
    <KeyFiguresSection />
    <GoalsSection />
  </GoalsProvider>
</FeatureGate>

      <BookingSection />
      <FeatureGate flag="products"><FeaturedProducts /></FeatureGate>
      <FeatureGate flag="brands"><ApprovedBrands /></FeatureGate>
      <GallerySection /> 
      <FeatureGate flag="reviews"><SociableKITReviews /></FeatureGate>
      <ContactSection />

  <FeatureGate flag="faq">
    <FaqSection />
  </FeatureGate>
  <FeatureGate flag="challenge">
    <ChallengeSection />
  </FeatureGate>
      <CTASection />         

    </>
  )
}