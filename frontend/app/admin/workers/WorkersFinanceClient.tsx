'use client';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslations } from 'next-intl';
import { WorkersTab } from '@/components/admin/WorkersTab';
import { ToolsTab } from '@/components/admin/ToolsTab';
import { FixedExpensesTab } from '@/components/admin/FixedExpensesTab';
import { WalletTab } from '@/components/admin/WalletTab';

export default function WorkersFinanceClient() {
  const t = useTranslations('admin.workers');
  const [activeTab, setActiveTab] = useState('workers');

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="workers">{t('workersTab')}</TabsTrigger>
          <TabsTrigger value="tools">{t('toolsTab')}</TabsTrigger>
          <TabsTrigger value="expenses">{t('expensesTab')}</TabsTrigger>
          <TabsTrigger value="wallet">{t('walletTab')}</TabsTrigger>
        </TabsList>
        <TabsContent value="workers"><WorkersTab /></TabsContent>
        <TabsContent value="tools"><ToolsTab /></TabsContent>
        <TabsContent value="expenses"><FixedExpensesTab /></TabsContent>
        <TabsContent value="wallet"><WalletTab /></TabsContent>
      </Tabs>
    </div>
  );
}