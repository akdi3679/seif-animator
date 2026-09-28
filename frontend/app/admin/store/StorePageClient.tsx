'use client';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslations } from 'next-intl';
import ProductsTab from '@/components/admin/ProductsTab';
import CategoriesTab from '@/components/admin/CategoriesTab';
import OrdersTab from '@/components/admin/OrdersTab';
import { useNotifications } from '@/components/providers/NotificationsProvider';

export default function StorePageClient() {
  const t = useTranslations('admin.store');
  const [activeTab, setActiveTab] = useState('products');
const { counts } = useNotifications();

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="products" className="relative">
  {t('productsTab')}
  {counts.stock > 0 && <span className="ml-2 w-2 h-2 rounded-full bg-orange-500 inline-block" />}
</TabsTrigger>

          <TabsTrigger value="categories">{t('categoriesTab')}</TabsTrigger>
         <TabsTrigger value="orders" className="relative">
  {t('ordersTab')}
  {counts.order > 0 && <span className="ml-2 w-2 h-2 rounded-full bg-primary inline-block" />}
</TabsTrigger>

        </TabsList>
        <TabsContent value="products"><ProductsTab /></TabsContent>
        <TabsContent value="categories"><CategoriesTab /></TabsContent>
        <TabsContent value="orders">
          <OrdersTab isActive={activeTab === 'orders'} />
        </TabsContent>
      </Tabs>
    </div>
  );
}