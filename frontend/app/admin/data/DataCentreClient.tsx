'use client';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslations } from 'next-intl';
import { DataTab } from '@/components/admin/DataTab';

export default function DataCentreClient() {
  const t = useTranslations('admin.data');
  const [activeTab, setActiveTab] = useState('bookings');

  // Page-level cache: key = endpoint + queryString, value = { items, total }
  const [pageCache, setPageCache] = useState<Map<string, { items: any[]; total: number }>>(new Map());

  // Full-data cache: key = endpoint, value = { data, fetchedAt }
  const [fullCache, setFullCache] = useState<Record<string, { data: any[]; fetchedAt: number }>>({});

  const tabs = [
    { value: 'bookings',   label: t('bookingsTab'),   endpoint: '/data/bookings' },
    { value: 'newsletter', label: t('newsletterTab'), endpoint: '/data/newsletter' },
    { value: 'messages',   label: t('messagesTab'),   endpoint: '/data/messages' },
    { value: 'cloudinary', label: t('cloudinaryTab'), endpoint: '/data/cloudinary-images' },
    { value: 'orders',     label: t('ordersTab'),     endpoint: '/data/orders' },
  ];

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          {tabs.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
          ))}
        </TabsList>
        {tabs.map(tab => (
          <TabsContent key={tab.value} value={tab.value}>
            <DataTab
              endpoint={tab.endpoint}
              tabKey={tab.value}
              pageCache={pageCache}
              setPageCache={setPageCache}
              fullCache={fullCache}
              setFullCache={setFullCache}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}