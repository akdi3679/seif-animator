'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Clock, Loader2, Thermometer, Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { adminAPI } from '@/lib/api/client';
import { useWeather } from '@/components/providers/AdminWeatherProvider';
import { useLockScreen } from '@/components/providers/LockScreenProvider';
import { TailscaleStatus } from './TailscaleStatus';
import { useAdminGETSWR } from '@/lib/api/hooks';

interface AdminUser {
  id: string; email: string; role: string; fullName: string;
  tailscaleIp?: string;                       // ← add
}
export function AdminTopBar() {
  const t = useTranslations('admin');
  const { weather, timezone } = useWeather();        // ✅ destructured
  const pathname = usePathname();
  const isDashboard = pathname === '/admin/dashboard' || pathname === '/admin/dashboard/';

  const [enableLoading, setEnableLoading] = useState(false);
  const [time, setTime] = useState(new Date());
  const { isEnabled, toggle, isLoading } = useLockScreen();
  const [lockCode, setLockCode] = useState('');
  const [lockError, setLockError] = useState('');
  const [lockSubmitting, setLockSubmitting] = useState(false);
  const [open, setOpen] = useState(false);


const { data: meData, isValidating: meValidating } = useAdminGETSWR<{ user: AdminUser }>('/auth/me', {
  dedupingInterval: 60_000, revalidateOnFocus: false, revalidateOnReconnect: false,
});
const user = meData?.user ?? null;
const ipLoading = !meData && meValidating;

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('greeting.morning');
    if (hour < 18) return t('greeting.afternoon');
    return t('greeting.evening');
  };

  // Time string respecting the provider's timezone
const timeString = timezone
  ? time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: timezone })
  : time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const handleDisable = async () => {
    setLockError('');
    setLockSubmitting(true);
    const result = await toggle(lockCode);
    if (result.success) {
      setOpen(false);
      setLockCode('');
    } else {
      setLockError(result.error || t('lockScreen.error'));
    }
    setLockSubmitting(false);
  };

  const handleEnable = async () => {
    setEnableLoading(true);
    setLockError('');
    await toggle(); // no code required
    setEnableLoading(false);
    setOpen(false);
  };

  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-6">
        {!isDashboard && (
          <>
            <h1 className="text-lg font-bold">
              {getGreeting()}, {user?.fullName || 'Admin'}
            </h1>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {timeString}
              </span>
              {weather?.temp !== undefined && (
                <span className="flex items-center gap-1">
                  <Thermometer className="w-4 h-4" />
                  {weather.temp}°C
                </span>
              )}
            </div>
          </>
        )}
      </div>
      {/* Right side: lock toggle + Tailscale */}
      <div className="flex items-center gap-3">
       <DropdownMenu open={open} onOpenChange={setOpen}>
  <DropdownMenuTrigger asChild>
    <button className="p-1 hover:bg-gray-100 rounded relative">
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
      ) : isEnabled ? (
        <Lock className="w-4 h-4 text-green-600" />
      ) : (
        <Unlock className="w-4 h-4 text-red-500" />
      )}
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="w-72 p-4 bg-white shadow-xl border border-gray-200 rounded-xl">
    {isEnabled ? (
      <div>
        <p className="font-medium text-sm mb-2">{t('lockToggle.disableTitle')}</p>
        <input
          type="password"
          value={lockCode}
          onChange={(e) => setLockCode(e.target.value)}
          placeholder={t('lockScreen.placeholder')}
          className="w-full border rounded px-3 py-2 text-sm mb-2"
          autoFocus
        />
        {lockError && <p className="text-red-500 text-xs mb-2">{lockError}</p>}
        <div className="flex justify-end">
          <Button size="sm" onClick={handleDisable} disabled={lockSubmitting}>
  {lockSubmitting ? (
    <>
      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
      {t('lockToggle.sending')}
    </>
  ) : (
    t('lockToggle.confirm')
  )}
</Button>
        </div>
      </div>
    ) : (
      <div>
        <p className="text-sm">{t('lockToggle.enablePrompt')}</p>
       <Button
  size="sm"
  onClick={handleEnable}
  disabled={enableLoading}
  className="mt-2"
>
  {enableLoading ? (
    <>
      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
      {t('lockToggle.sending')}
    </>
  ) : (
    t('lockToggle.enable')
  )}
</Button>
      </div>
    )}
  </DropdownMenuContent>
</DropdownMenu>
        <TailscaleStatus tailscaleIp={user?.tailscaleIp ?? null} ipLoading={ipLoading} />
      </div>
    </div>
  );
}