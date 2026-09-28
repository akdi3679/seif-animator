'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation'; // FIX: import usePathname
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard, Calendar, Ticket, Package, MessageSquare,
  Settings, Info, ShoppingBag, Image as ImageIcon,
  FileText , HardDrive, Activity, Home, BookOpen,
  PanelLeftClose, PanelLeft, LogOut, UserCog, Hand , 
} from 'lucide-react';
import { TailscaleStatus } from './TailscaleStatus';
import { useSiteData } from '@/components/providers/SiteDataProvider';
import { logout } from '@/lib/api/client';
import { useNotifications } from '@/components/providers/NotificationsProvider';

export default function AdminSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const t = useTranslations('admin');
  const { name, logoUrl } = useSiteData();
  const { counts } = useNotifications();

  const pathname = usePathname(); // FIX: use Next.js pathname hook

  const items = [
    { href: '/admin/dashboard', labelKey: 'sidebar.dashboard', icon: LayoutDashboard },
    { href: '/admin/bookings', labelKey: 'sidebar.bookings', icon: Calendar },
    { href: '/admin/events', labelKey: 'sidebar.events', icon: Ticket },
    { href: '/admin/store', labelKey: 'sidebar.products', icon: Package },
    { href: '/admin/services', labelKey: 'sidebar.services', icon: Hand },
    { href: '/admin/gallery', labelKey: 'sidebar.gallery', icon: ImageIcon },
    { href: '/admin/contact', labelKey: 'sidebar.contact', icon: MessageSquare },
    { href: '/admin/about', labelKey: 'sidebar.about', icon: Info },
    { href: '/admin/home', labelKey: 'sidebar.home', icon: Home },
    { href: '/admin/terms', labelKey: 'sidebar.terms', icon: FileText },
    { href: '/admin/data', labelKey: 'sidebar.data', icon: HardDrive  },
    { href: '/admin/workers', labelKey: 'sidebar.workers', icon: UserCog },
    { href: '/admin/monitor', labelKey: 'sidebar.monitor', icon: Activity },
    { href: '/admin/settings', labelKey: 'sidebar.settings', icon: Settings },
  ];
const dotFor = (href) => {
  switch (href) {
    case '/admin/bookings': return { n: counts.booking, stock: false };
    case '/admin/contact':  return { n: counts.contact, stock: false };
    case '/admin/store':    return counts.stock > 0
        ? { n: counts.stock, stock: true }
        : { n: counts.order, stock: false };
    default: return { n: 0, stock: false };
  }
};
  return (
    <aside
      className={`bg-dark text-white transition-all duration-300 flex flex-col ${
        collapsed ? 'w-20' : 'w-64'
      } p-4 h-screen sticky top-0 overflow-y-auto flex-shrink-0`}
    >
      <div className="flex items-center justify-between mb-8">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            {logoUrl && <img src={logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-cover" />}
            <span className="text-xl font-black">{name || 'Kafela'}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center w-full">
            {logoUrl &&
              <img src={logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
            }
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="text-white/70 hover:text-white ml-auto">
          {collapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>
      </div>

      <nav className="flex-1 space-y-1">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
  key={item.href}
  href={item.href}
  className={`flex items-center gap-3 p-3 rounded-xl hover:bg-white/10 transition-colors ${
    isActive ? 'bg-white/20 font-semibold' : ''
  }`}
>
  <item.icon className="w-5 h-5 shrink-0" />
  {!collapsed && <span className="flex-1">{t(item.labelKey)}</span>}
  {dotFor(item.href).n > 0 && (
    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotFor(item.href).stock ? 'bg-orange-500' : 'bg-primary'}`} />
  )}
</Link>
          );
        })}
      </nav>

      <div className="pt-4 border-t border-white/10 space-y-2">
        <button
          onClick={logout}
          className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/10 transition-colors w-full text-left"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span>{t('sidebar.logout')}</span>}
        </button>
      </div>
    </aside>
  );
}