'use client';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslations } from 'next-intl';
import GalleryItemsTab from '@/components/admin/GalleryItemsTab';
import GalleryCategoriesTab from '@/components/admin/GalleryCategoriesTab';

export default function GalleryPageClient() {
  const t = useTranslations('admin.gallery');
  const [activeTab, setActiveTab] = useState('items');

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="items">{t('itemsTab')}</TabsTrigger>
          <TabsTrigger value="categories">{t('categoriesTab')}</TabsTrigger>
        </TabsList>
        <TabsContent value="items"><GalleryItemsTab /></TabsContent>
        <TabsContent value="categories"><GalleryCategoriesTab /></TabsContent>
      </Tabs>
    </div>
  );
}