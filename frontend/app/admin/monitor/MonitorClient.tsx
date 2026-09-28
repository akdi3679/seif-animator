'use client';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslations } from 'next-intl';
import { AuditLogsTab } from '@/components/admin/AuditLogsTab';
import { SessionsTab } from '@/components/admin/SessionsTab';
import { NotificationsTab } from '@/components/admin/NotificationsTab';
import { VisitorsTab } from '@/components/admin/VisitorsTab';
export default function MonitorClient() {
  const t = useTranslations('admin.monitor');
  const [activeTab, setActiveTab] = useState('audit');

  // Lift cache state so it survives tab switches
  const [pageCache, setPageCache] = useState<Map<string, { items: any[]; total: number }>>(new Map());
  const [fullCache, setFullCache] = useState<Record<string, { data: any[]; fetchedAt: number }>>({});

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="audit">{t('auditLogsTab')}</TabsTrigger>
          <TabsTrigger value="sessions">{t('sessionsTab')}</TabsTrigger>
          <TabsTrigger value="notifications">{t('notificationsTab')}</TabsTrigger>
          <TabsTrigger value="visitors">{t('visitorsTab')}</TabsTrigger>
        </TabsList>
        <TabsContent value="audit">
          <AuditLogsTab
            pageCache={pageCache}
            setPageCache={setPageCache}
            fullCache={fullCache}
            setFullCache={setFullCache}
          />
        </TabsContent>
        <TabsContent value="sessions"><SessionsTab /></TabsContent>
        <TabsContent value="notifications"><NotificationsTab /></TabsContent>
<TabsContent value="visitors">
  <VisitorsTab
    pageCache={pageCache}
    setPageCache={setPageCache}
    fullCache={fullCache}
    setFullCache={setFullCache}
  />
</TabsContent>
      </Tabs>
    </div>
  );
}