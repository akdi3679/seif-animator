// app/admin/layout.tsx
import { ErrorHandler } from '@/components/providers/ErrorHandler';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { LockScreen } from '@/components/admin/LockScreen';
import { LockScreenProvider } from '@/components/providers/LockScreenProvider';
import { AdminTopBar } from '@/components/admin/AdminTopBar';
import AdminI18nProvider from './AdminI18nProvider';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { NotificationsProvider } from '@/components/providers/NotificationsProvider';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (

    <AdminI18nProvider>
              <SessionProvider>
  <NotificationsProvider>
      <ErrorHandler>
        <LockScreenProvider>
          <div className="min-h-screen bg-gray-50 flex">
            <LockScreen />
            <AdminSidebar />
            <main className="flex-1 flex flex-col min-w-0">
              <AdminTopBar />
              <div className="p-8 flex-1 overflow-x-auto">
                {children}
              </div>
            </main>
          </div>
        </LockScreenProvider>
      </ErrorHandler>
        </NotificationsProvider>
              </SessionProvider>

    </AdminI18nProvider>

  );
}