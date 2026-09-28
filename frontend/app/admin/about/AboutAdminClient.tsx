'use client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslations } from 'next-intl';
import { PageTab } from '@/components/admin/PageTab';
import { GoalsTab } from '@/components/admin/GoalsTab';
import { KeyFiguresTab } from '@/components/admin/KeyFiguresTab';
import { WhyChooseUsTab } from '@/components/admin/WhyChooseUsTab';

export default function AboutAdminClient() {
  const t = useTranslations('admin.about');
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
      <h1 className="text-4xl font-black text-dark mb-8">{t('title')}</h1>
      <Tabs defaultValue="page" className="w-full">
        <TabsList>
          <TabsTrigger value="page">{t('tabs.page')}</TabsTrigger>
          <TabsTrigger value="goals">{t('tabs.goals')}</TabsTrigger>
          <TabsTrigger value="keyFigures">{t('tabs.keyFigures')}</TabsTrigger>
          <TabsTrigger value="whyChooseUs">{t('tabs.whyChooseUs')}</TabsTrigger>
        </TabsList>
        <TabsContent value="page"><PageTab /></TabsContent>
        <TabsContent value="goals"><GoalsTab /></TabsContent>
        <TabsContent value="keyFigures"><KeyFiguresTab /></TabsContent>
        <TabsContent value="whyChooseUs"><WhyChooseUsTab /></TabsContent>
      </Tabs>
    </div>
  );
}