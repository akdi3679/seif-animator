'use client';
import { VisitorWorldMap } from './VisitorWorldMap';
import { DataTab } from '@/components/admin/DataTab';
import { useAdminGETSWR } from '@/lib/api/hooks';

interface Props {
  pageCache: Map<string, { items: any[]; total: number }>;
  setPageCache: React.Dispatch<React.SetStateAction<Map<string, { items: any[]; total: number }>>>;
  fullCache: Record<string, { data: any[]; fetchedAt: number }>;
  setFullCache: React.Dispatch<React.SetStateAction<Record<string, { data: any[]; fetchedAt: number }>>>;
}

export function VisitorsTab({ pageCache, setPageCache, fullCache, setFullCache }: Props) {
  // SWR for the map data – we only need the mutate function to refresh
  const { mutate: refreshMap } = useAdminGETSWR('/monitor/visitors/map-data');

  return (
    <div className="space-y-6">
      <VisitorWorldMap />
      <DataTab
        endpoint="/monitor/visitors"
        tabKey="visitors"
        pageCache={pageCache}
        setPageCache={setPageCache}
        fullCache={fullCache}
        setFullCache={setFullCache}
        onRefresh={() => refreshMap()}
      />
    </div>
  );
}