'use client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslations } from 'next-intl';

import UserProfileTab from '@/components/admin/UserProfileTab';
import SystemSettingsTab from '@/components/admin/SystemSettingsTab';
import ContentSettingsTab from '@/components/admin/ContentSettingsTab';

export default function SettingsClient() {
  const t = useTranslations('admin.settings');
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
      <h1 className="text-4xl font-black text-dark mb-8">{t('title')}</h1>
      <Tabs defaultValue="user" className="w-full">
        <TabsList>
          <TabsTrigger value="user">{t('tabs.user')}</TabsTrigger>
          <TabsTrigger value="system">{t('tabs.system')}</TabsTrigger>
          <TabsTrigger value="content">{t('tabs.content')}</TabsTrigger>
        </TabsList>
        <TabsContent value="user"><UserProfileTab /></TabsContent>
        <TabsContent value="system"><SystemSettingsTab /></TabsContent>
        <TabsContent value="content"><ContentSettingsTab /></TabsContent>
        
      </Tabs>
    </div>
  );
}