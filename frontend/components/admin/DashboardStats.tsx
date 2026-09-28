import { Calendar, Ticket, Package, MessageSquare, ShoppingCart, Image as ImageIcon } from 'lucide-react';

interface Props {
  totalBookings: number;
  todayBookings: number;
  activeEvents: number;
  totalProducts: number;
  totalOrders: number;
  totalGalleryItems: number;
  unreadMessages: number;
}

export function DashboardStats({
  totalBookings,
  todayBookings,
  activeEvents,
  totalProducts,
  totalOrders,
  totalGalleryItems,
  unreadMessages,
}: Props) {
  const stats = [
    { label: 'Bookings (total)', value: totalBookings, sub: `${todayBookings} today`, icon: Calendar, color: 'bg-blue-500' },
    { label: 'Active Events', value: activeEvents, icon: Ticket, color: 'bg-green-500' },
    { label: 'Products', value: totalProducts, icon: Package, color: 'bg-purple-500' },
    { label: 'Orders', value: totalOrders, icon: ShoppingCart, color: 'bg-yellow-500' },
    { label: 'Gallery Items', value: totalGalleryItems, icon: ImageIcon, color: 'bg-pink-500' },
    { label: 'Unread Messages', value: unreadMessages, icon: MessageSquare, color: 'bg-orange-500' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => (
        <div key={index} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center">
          <div className={`w-12 h-12 rounded-xl ${stat.color} bg-opacity-10 flex items-center justify-center mr-4`}>
         <stat.icon className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="text-2xl font-bold">{stat.value}</p>
            {stat.sub && <p className="text-xs text-gray-400">{stat.sub}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}