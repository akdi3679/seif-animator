'use client';
import { useTranslations } from 'next-intl';
import { useAdminGETSWR } from '@/lib/api/hooks';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { Loader2 } from 'lucide-react';

// Professional UI Badges instead of emojis
const TrueBadge = () => (
  <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
    Yes
  </span>
);

const FalseBadge = () => (
  <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/20">
    No
  </span>
);

const OtherBadge = () => (
  <span className="inline-flex items-center rounded-md bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-600/20">
    Other
  </span>
);

export default function ServiceTypesTab() {
  const t = useTranslations('admin.serviceTypes');
  const { data, mutate, isValidating, error } = useAdminGETSWR<any[]>('/service-types');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('title')}</h2>
        <RefreshButton onRefresh={() => mutate()} loading={isValidating} />
      </div>

      <div className="bg-white rounded-2xl border shadow-sm">
        {error ? (
          <div className="p-10 text-center text-red-500">Error loading service types.</div>
        ) : !data ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : data.length === 0 ? (
          <p className="text-center text-gray-500 py-10">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] border-collapse">
              <thead className="bg-gray-50 text-left text-sm text-gray-500 border-b">
                <tr>
                  <th className="p-4 font-medium">Name (FR)</th>
                  <th className="p-4 font-medium">Slug</th>
                  <th className="p-4 font-medium">Calcom Title</th>
                  <th className="p-4 font-medium">Calcom Desc</th>
                  <th className="p-4 font-medium">Duration</th>
                  <th className="p-4 font-medium">Price</th>
                  <th className="p-4 font-medium">Currency</th>
                  <th className="p-4 font-medium">Confirmation</th>
                  <th className="p-4 font-medium">Category</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item: any) => (
                  <tr 
                    key={item.id} 
                    className={`border-b last:border-0 hover:bg-gray-50 transition-colors ${item.is_other ? 'bg-orange-50/50' : ''}`}
                  >
                    <td className="p-4 text-sm text-gray-900 font-medium">
                      {item.name_fr}
                    </td>
                    <td className="p-4 text-xs font-mono text-gray-600">
                      {item.calcom_slug}
                    </td>
                    <td className="p-4 text-sm text-gray-600">
                      {item.calcom_title || '—'}
                    </td>
                    <td className="p-4 text-sm text-gray-600 max-w-xs truncate">
                      {item.calcom_description || '—'}
                    </td>
                    <td className="p-4 text-sm text-gray-900 whitespace-nowrap">
                      {item.duration_minutes} min
                    </td>
                    <td className="p-4 text-sm text-gray-900 whitespace-nowrap font-medium">
                      {item.price || '—'}
                    </td>
                    <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                      {item.currency || '—'}
                    </td>
                    <td className="p-4">
                      {item.requires_confirmation ? <TrueBadge /> : <FalseBadge />}
                    </td>
                    
                    <td className="p-4">
                      {item.is_other ? <OtherBadge /> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}