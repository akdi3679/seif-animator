'use client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslations } from 'next-intl';
import MessagesTab from '@/components/admin/MessagesTab';
import ContactInfoTab from '@/components/admin/ContactInfoTab';
import ContactSubjectsTab from '@/components/admin/ContactSubjectsTab';
import FaqTab from '@/components/admin/FaqTab';
import NewsletterTab from '@/components/admin/NewsletterTab';
import ScheduleTab from '@/components/admin/ScheduleTab';
import { useNotifications } from '@/components/providers/NotificationsProvider';

export default function ContactClient() {
  const t = useTranslations('admin.contact');
  const { counts } = useNotifications();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
      <h1 className="text-4xl font-black text-dark mb-8">{t('title')}</h1>
      <Tabs defaultValue="messages" className="w-full">
        <TabsList>
          <TabsTrigger value="messages">
  {t('tabs.messages')}
  {counts.contact > 0 && <span className="ml-2 w-2 h-2 rounded-full bg-primary inline-block" />}
</TabsTrigger>

          <TabsTrigger value="info">{t('tabs.info')}</TabsTrigger>
            <TabsTrigger value="schedule">{t('tabs.schedule')}</TabsTrigger>

          <TabsTrigger value="subjects">{t('tabs.subjects')}</TabsTrigger>
          <TabsTrigger value="faq">{t('tabs.faq')}</TabsTrigger>
          <TabsTrigger value="newsletter">
  {t('tabs.newsletter')}
  {counts.newsletter > 0 && <span className="ml-2 w-2 h-2 rounded-full bg-primary inline-block" />}
</TabsTrigger>

        </TabsList>
        <TabsContent value="messages"><MessagesTab /></TabsContent>

        <TabsContent value="info"><ContactInfoTab /></TabsContent>
<TabsContent value="schedule"><ScheduleTab /></TabsContent>

        <TabsContent value="subjects"><ContactSubjectsTab /></TabsContent>
        <TabsContent value="faq"><FaqTab /></TabsContent>
        <TabsContent value="newsletter"><NewsletterTab /></TabsContent>
      </Tabs>
    </div>
  );
}