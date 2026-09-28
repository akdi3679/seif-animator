'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DataTab } from '@/components/admin/DataTab';

interface AuditLogsTabProps {
  pageCache: Map<string, { items: any[]; total: number }>;
  setPageCache: React.Dispatch<React.SetStateAction<Map<string, { items: any[]; total: number }>>>;
  fullCache: Record<string, { data: any[]; fetchedAt: number }>;
  setFullCache: React.Dispatch<React.SetStateAction<Record<string, { data: any[]; fetchedAt: number }>>>;
}

export function AuditLogsTab({ pageCache, setPageCache, fullCache, setFullCache }: AuditLogsTabProps) {
  const t = useTranslations('admin.monitor');

  // We can still pass success / date filters if needed later – for now just plain endpoint
  const endpoint = '/monitor/audit-logs';

  return (
    <DataTab
      endpoint={endpoint}
      tabKey="auditLogs"
      pageCache={pageCache}
      setPageCache={setPageCache}
      fullCache={fullCache}
      setFullCache={setFullCache}
    />
  );
}