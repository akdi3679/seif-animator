'use client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminGETSWR } from '@/lib/api/hooks';
import { DashboardStats } from '@/components/admin/DashboardStats';
import { BookingsTable } from '@/components/admin/BookingsTable';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { useTranslations } from 'next-intl';
import { CloudSun, MapPin, Clock,Copy,  Loader2, RefreshCw } from 'lucide-react';
import { useWeather } from '@/components/providers/AdminWeatherProvider';
import { MiniWalletChart } from '@/components/admin/MiniWalletChart';
import dynamic from 'next/dynamic';
import { toast } from 'sonner'; 
const VisitorGlobe = dynamic(
  () => import('@/components/admin/VisitorGlobe').then(mod => mod.VisitorGlobe),
  { ssr: false }
);
interface DashboardData {
  totalBookings: number;
  todayBookings: number;
  activeEvents: number;
  totalProducts: number;
  totalOrders: number;
  totalGalleryItems: number;
  unreadMessages: number;
  recentBookings: any[];
  recentMessages: any[];
}

interface SystemHealth {
  timestamp: string;
  system: { healthy: boolean; cpu: number; memory: number; eventLoopDelay: number };
  services: { redis: string; supabase: string; smtp: boolean; telegram: boolean; exportEncryption: boolean; cloudinary: string };
  usage?: {
    databaseSizeBytes: number;
    cloudinaryImageCount: number;
    cloudinaryStorageBytes: number;
  };
  backup: {
    configured: boolean;
    connected: boolean;
  };
}
interface VisitorData {
  totalVisits: number;
  last24hVisits: number;
  locations?: { lat: number; lon: number; city: string; country: string; visit_count: number }[];
  recentVisitors?: { ip: string; country: string; city: string; visited_at: string }[];
}

interface DailyPoint {
  date: string;
  balance: number;
  income: number;
  expense: number;
}

interface AuditLog {
  id: string;
  action: string;
  resource: string;
  ipAddress: string;
  createdAt: string;
}

export default function DashboardClient() {
  const t = useTranslations('admin');
  const { weather, loading, timezone, refreshWeather } = useWeather();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('greeting.morning');
    if (hour < 18) return t('greeting.afternoon');
    return t('greeting.evening');
  };
const { data: meData } = useAdminGETSWR<{ user: { fullName: string } }>('/auth/me', {
  dedupingInterval: 60_000,
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
});
  const now = new Date();
  const timeString = timezone
    ? new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: timezone })
    : new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const dateString = now.toLocaleDateString('fr-FR', { dateStyle: 'full' });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black">
  {getGreeting()}{meData?.user?.fullName ? `, ${meData.user.fullName}` : ''}
</h2>
          <div className="flex items-center gap-3 text-gray-500 mt-1">
            <Clock className="w-4 h-4" />
            <span>{dateString} – {timeString}</span>
            {weather?.city && (
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" /> {weather.city}{weather.country ? `, ${weather.country}` : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm border">
          {loading ? (
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          ) : weather?.temp !== undefined ? (
            <>
              <CloudSun className="w-8 h-8 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{weather.temp}°C</p>
                {weather.desc && <p className="text-sm text-gray-500">{weather.desc}</p>}
              </div>
            </>
          ) : (
            <CloudSun className="w-8 h-8 text-gray-300" />
          )}
          <button
            onClick={refreshWeather}
            disabled={loading}
            className={`ml-2 text-gray-400 hover:text-gray-600 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Rafraîchir la météo"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
          <TabsTrigger value="health">{t('tabs.health')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-8">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="health">
          <HealthTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab() {
  const t = useTranslations('admin');

  const {
    data: visitors,
    error: visitorsError,
    refresh: refreshVisitors,
    isValidating: visitorsValidating,
  } = useAdminGETSWR<VisitorData>('/dashboard/visitors');

  const {
    data: stats,
    error: statsError,
    refresh: refreshStats,
    isValidating: statsValidating,
  } = useAdminGETSWR<DashboardData>('/dashboard/stats');

  const {
    data: walletData,
    error: walletError,
    refresh: refreshWallet,
    isValidating: walletValidating,
  } = useAdminGETSWR<DailyPoint[]>('/wallet/last-week');

  const handleOverviewRefresh = () => {
    refreshStats();
    refreshVisitors();
    refreshWallet();
  };

  const isInitialLoading =
    (!stats && !statsError) || (!visitors && !visitorsError) || (!walletData && !walletError);

  if (isInitialLoading) return <LoadingSpinner />;
  if (statsError) return <RetryableError error={statsError} onRetry={handleOverviewRefresh} isRetrying={statsValidating} />;
  if (visitorsError) return <RetryableError error={visitorsError} onRetry={handleOverviewRefresh} isRetrying={visitorsValidating} />;

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <RefreshButton onRefresh={handleOverviewRefresh} loading={statsValidating || visitorsValidating || walletValidating} />
      </div>

      {/* Full‑width wallet chart */}
     
<MiniWalletChart
  data={walletData}
  loading={walletValidating && !walletData}
  error={walletError}
  onRetry={refreshWallet}
  isRetrying={walletValidating}
/>
      <DashboardStats
        totalBookings={stats?.totalBookings || 0}
        todayBookings={stats?.todayBookings || 0}
        activeEvents={stats?.activeEvents || 0}
        totalProducts={stats?.totalProducts || 0}
        totalOrders={stats?.totalOrders || 0}
        totalGalleryItems={stats?.totalGalleryItems || 0}
        unreadMessages={stats?.unreadMessages || 0}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <div className="bg-white rounded-2xl shadow-sm border p-6">
  <h3 className="text-xl font-bold mb-4">{t('recentBookings')}</h3>
  {!stats?.recentBookings || stats.recentBookings.length === 0 ? (
    <p className="text-gray-500 text-center py-4">{t('noData')}</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-sm">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="p-2">{t('name')}</th>
            <th className="p-2">{t('email')}</th>
            <th className="p-2">{t('phone')}</th>
            <th className="p-2">{t('date')}</th>
            <th className="p-2">{t('service')}</th>
            <th className="p-2">{t('status')}</th>
            <th className="p-2">{t('price')}</th>
          </tr>
        </thead>
        <tbody>
          {stats.recentBookings.map((b: any) => (
            <tr key={b.id} className="border-t">
              <td className="p-2">{b.contact_name}</td>
              <td className="p-2">
                <div className="flex items-center gap-1">
                  <a href={`mailto:${b.contact_email}`} className="truncate text-primary hover:underline">{b.contact_email}</a>
                  <button onClick={() => { navigator.clipboard.writeText(b.contact_email); toast.success(t('copiedEmail')); }} className="text-gray-400 hover:text-gray-600 shrink-0">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
              <td className="p-2">
                {b.contact_phone ? (
                  <div className="flex items-center gap-1">
                    <span className="truncate">{b.contact_phone}</span>
                    <button onClick={() => { navigator.clipboard.writeText(b.contact_phone); toast.success(t('copiedPhone')); }} className="text-gray-400 hover:text-gray-600 shrink-0">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : '—'}
              </td>
              <td className="p-2 whitespace-nowrap">{new Date(b.desired_date).toLocaleDateString('fr-FR')}</td>
              <td className="p-2">{b.service_type}</td>
              <td className="p-2">
                <span className={`px-2 py-1 rounded-full text-xs whitespace-nowrap ${
                  b.status === 'confirmed' || b.status === 'approved' ? 'bg-green-100 text-green-700' :
                  b.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                  b.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
                }`}>{b.status}</span>
              </td>
              <td className="p-2 whitespace-nowrap">{b.total_price ? `${b.total_price} TND` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>
      <div className="bg-white rounded-2xl shadow-sm border p-6">
  <h3 className="text-xl font-bold mb-4">{t('recentMessages')}</h3>
  {!stats?.recentMessages || stats.recentMessages.length === 0 ? (
    <p className="text-gray-500 text-center py-4">{t('noData')}</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-sm">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="p-2">{t('name')}</th>
            <th className="p-2">{t('email')}</th>
            <th className="p-2">{t('phone')}</th>
            <th className="p-2">{t('subject')}</th>
            <th className="p-2">{t('message')}</th>
            <th className="p-2">{t('status')}</th>
            <th className="p-2">{t('date')}</th>
          </tr>
        </thead>
        <tbody>
          {stats.recentMessages.map((msg: any) => (
            <tr key={msg.id} className="border-t">
              <td className="p-2">{msg.name}</td>
              <td className="p-2">
                <div className="flex items-center gap-1">
                  <a href={`mailto:${msg.email}`} className="truncate text-primary hover:underline">{msg.email}</a>
                  <button onClick={() => { navigator.clipboard.writeText(msg.email); toast.success(t('copiedEmail')); }} className="text-gray-400 hover:text-gray-600 shrink-0">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
              <td className="p-2">
                {msg.phone ? (
                  <div className="flex items-center gap-1">
                    <span className="truncate">{msg.phone}</span>
                    <button onClick={() => { navigator.clipboard.writeText(msg.phone); toast.success(t('copiedPhone')); }} className="text-gray-400 hover:text-gray-600 shrink-0">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : '—'}
              </td>
              <td className="p-2">{msg.subjectName || '—'}</td>
              <td className="p-2 relative">
                <span className="block truncate max-w-[200px]" title={msg.message}>
                  {msg.message}
                </span>
              </td>
              <td className="p-2">
                <span className={`px-2 py-1 rounded-full text-xs whitespace-nowrap ${
                  msg.status === 'NEW' ? 'bg-blue-100 text-blue-700' :
                  msg.status === 'READ' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-green-100 text-green-700'
                }`}>{msg.status}</span>
              </td>
              <td className="p-2 whitespace-nowrap">{new Date(msg.createdAt).toLocaleDateString('fr-FR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>
      </div>

     
      <VisitorGlobe
  data={visitors}
  loading={false}
  error={visitorsError}
  onRetry={() => refreshVisitors()}
  isRetrying={visitorsValidating}
/>
    </div>
  );
}

function HealthTab() {
  const t = useTranslations('admin');
  const {
    data: health,
    error: healthError,
    refresh: refreshHealth,
    retry: retryHealth,
    isRetrying: healthRetrying,
    isValidating: healthValidating,
  } = useAdminGETSWR<SystemHealth>('/systeme-health');

  const {
    data: auditData,
    error: auditError,
    refresh: refreshAudit,
    isValidating: auditValidating,
  } = useAdminGETSWR<{ items: AuditLog[]; total: number }>('/monitor/audit-logs?limit=5');

  const handleRefresh = () => {
    refreshHealth();
    refreshAudit();
  };

  const isLoading = (!health && !healthError) || (!auditData && !auditError);
  if (isLoading) return <LoadingSpinner />;
  if (healthError) return <RetryableError error={healthError} onRetry={handleRefresh} isRetrying={healthRetrying} />;

  // Helpers for formatting bytes
  const formatBytes = (v: number) => {
    if (v < 1024) return `${v} B`;
    if (v < 1048576) return `${(v / 1024).toFixed(1)} KB`;
    return `${(v / 1048576).toFixed(1)} MB`;
  };

  const supabaseDbSize = health?.usage?.databaseSizeBytes || 0;
  const cloudinaryImgCount = health?.usage?.cloudinaryImageCount || 0;
  const cloudinaryImgLimit = health?.usage?.cloudinaryImageLimitCount || 0;
  const cloudinaryStorage = health?.usage?.cloudinaryStorageBytes || 0;
  const cloudinaryStorageLimit = health?.usage?.cloudinaryStorageLimitBytes || 0;

  return (
    <>
      <div className="flex justify-end mb-4">
        <RefreshButton onRefresh={handleRefresh} loading={healthValidating || auditValidating} />
      </div>

      {/* Service status + capacity in same grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <MetricCard label="CPU" value={health?.system.cpu || 0} unit="%" />
        <MetricCard label="RAM" value={health?.system.memory || 0} unit="%" />
        <MetricCard label="Event Loop" value={health?.system.eventLoopDelay || 0} unit="ms" />

        <ServiceStatus name="Redis" status={health?.services.redis || 'disconnected'} />

        {/* Supabase card with DB size */}
        <ServiceStatus
          name="Supabase"
          status={health?.services.supabase || 'disconnected'}
          subtitle={`DB: ${formatBytes(supabaseDbSize)}`}
        />

        {/* Cloudinary card with image count + storage */}
        <ServiceStatus
          name="Cloudinary"
          status={health?.services.cloudinary || 'disconnected'}
          subtitle={
            `Images: ${cloudinaryImgCount}${cloudinaryImgLimit ? ` / ${cloudinaryImgLimit}` : ''} | ` +
            `Storage: ${formatBytes(cloudinaryStorage)}${cloudinaryStorageLimit ? ` / ${formatBytes(cloudinaryStorageLimit)}` : ''}`
          }
        />

        <ServiceStatus name="SMTP" status={health?.services.smtp ? 'configured' : 'missing'} />
        <ServiceStatus name="Telegram" status={health?.services.telegram ? 'configured' : 'missing'} />

        {/* Backup: shown as configured if Supabase keys are present in backend env */}
       <ServiceStatus
  name="Backup"
  status={
    !health?.backup?.configured
      ? t('backupNotConfigured')
      : health.backup.connected
        ? t('backupConnected')
        : t('backupUnreachable')
  }
/>

      </div>

      {/* Last 5 audit logs */}
    <div className="bg-white rounded-2xl border shadow-sm p-6">
  <h3 className="font-bold text-lg mb-4">{t('recentAuditLogs')}</h3>
  {auditError ? (
    <RetryableError error={auditError} onRetry={refreshAudit} isRetrying={auditValidating} />
  ) : !auditData?.items?.length ? (
    <p className="text-gray-500 text-center py-4">{t('noData')}</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-sm">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="p-2">{t('action')}</th>
            <th className="p-2">{t('resource')}</th>
            <th className="p-2">{t('ipAddress')}</th>
            <th className="p-2">{t('date')}</th>
          </tr>
        </thead>
        <tbody>
          {auditData.items.map((log) => (
            <tr key={log.id} className="border-t">
              <td className="p-2 font-medium">{log.action}</td>
              <td className="p-2">{log.resource}</td>
              <td className="p-2 text-gray-400">{log.ipAddress}</td>
              <td className="p-2 text-gray-500 whitespace-nowrap">
                {new Date(log.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>
    </>
  );
}

function ProgressBar({ label, used, total, unit }: { label: string; used: number; total?: number; unit?: string }) {
  const percent = total && total > 0 ? Math.min(100, Math.round((used / total) * 100)) : null;
  const formatValue = (v: number) => {
    if (unit === 'bytes') {
      if (v < 1024) return `${v} B`;
      if (v < 1048576) return `${(v / 1024).toFixed(1)} KB`;
      return `${(v / 1048576).toFixed(1)} MB`;
    }
    return v.toString();
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{formatValue(used)}{total ? ` / ${formatValue(total)}` : ''}</span>
      </div>
      {percent !== null && (
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="bg-primary h-2 rounded-full" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold">
        {value.toFixed(1)}<span className="text-gray-400 text-lg">{unit}</span>
      </p>
    </div>
  );
}

function ServiceStatus({ name, status, subtitle }: { name: string; status: string; subtitle?: string }) {
  const ok = status === 'connected' || status === 'configured';
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border">
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
        <div>
          <p className="font-semibold">{name}</p>
          <p className="text-sm text-gray-500 capitalize">{status}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}