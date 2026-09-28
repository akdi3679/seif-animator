'use client';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslations } from 'next-intl';
import BrandsTab from '@/components/admin/BrandsTab';
import ChallengeTab from '@/components/admin/ChallengeTab';
import HeroSlidesTab from '@/components/admin/HeroSlidesTab';
import ReviewsTab from '@/components/admin/ReviewsTab';

export default function HomePageClient() {
  const t = useTranslations('admin.home');
  const [activeTab, setActiveTab] = useState('brands');

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="brands">{t('brandsTab')}</TabsTrigger>
          <TabsTrigger value="challenge">{t('challengeTab')}</TabsTrigger>
          <TabsTrigger value="hero">{t('heroTab')}</TabsTrigger>
          <TabsTrigger value="reviews">{t('reviewsTab')}</TabsTrigger>
        </TabsList>
        <TabsContent value="brands"><BrandsTab /></TabsContent>
        <TabsContent value="challenge"><ChallengeTab /></TabsContent>
        <TabsContent value="hero"><HeroSlidesTab /></TabsContent>
        <TabsContent value="reviews"><ReviewsTab /></TabsContent>
      </Tabs>
    </div>
  );
}