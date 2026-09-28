'use client';
import { Copy, Eye, Trash2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.substring(0, idx)}
      <mark className="bg-yellow-200">{text.substring(idx, idx + term.length)}</mark>
      {text.substring(idx + term.length)}
    </>
  );
}

function CopyCell({ value }: { value: string }) {
  if (!value) return <span>—</span>;
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="truncate">{value}</span>
      <button
        onClick={() => { navigator.clipboard.writeText(value); toast.success('Copié'); }}
        className="text-gray-400 hover:text-gray-600 shrink-0"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface Props {
  bookings: any[];
  onView: (booking: any) => void;
  onDelete: (booking: any) => void;
  searchTerm: string;
  startIndex?: number;          // ← add this
}


export function BookingsTable({
  bookings,
  onView,
  onDelete,
  searchTerm,
  startIndex = 0,               // ← default value
}: Props) {
  const t = useTranslations('admin.bookings');
const statusLabels: Record<string, string> = {
  pending: t('statusPending'),
  confirmed: t('statusConfirmed'),
  cancelled: t('statusCancelled'),
  rescheduled: t('statusRescheduled'),
  rejected: t('statusRejected'),
  approved: t('statusApproved'),
};

  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-x-auto">
      <table className="w-full min-w-[1200px]">
        <thead className="bg-gray-50 text-left text-gray-500 text-sm">
          <tr>
            <th className="p-4 w-[60px] text-center">#</th>

            <th className="p-4 w-[120px]">Date</th>
            <th className="p-4 w-[140px]">Client</th>
            <th className="p-4 w-[200px]">Email</th>
            <th className="p-4 w-[160px]">Téléphone</th>
            <th className="p-4 w-[120px]">Service</th>
            <th className="p-4 w-[80px]">Enfants</th>
            <th className="p-4 w-[100px]">Statut</th>
            <th className="p-4 w-[90px]">Prix</th>
            <th className="p-4 w-[80px] text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
         {bookings.map((b, idx) => (
    <tr key={b.id} className="border-t hover:bg-gray-50">
      <td className="p-4 text-center text-gray-400 text-sm">
        {startIndex + idx + 1}
      </td>
              <td className="p-4">{new Date(b.desired_date).toLocaleDateString('fr-FR')}</td>
              <td className="p-4"><Highlight text={b.contact_name || ''} term={searchTerm} /></td>
             <td className="p-4">
  <div className="flex items-center gap-2">
    <a
      href={`mailto:${b.contact_email}`}
      className="flex-1 truncate text-primary hover:underline"
    >
      <Highlight text={b.contact_email || ''} term={searchTerm} />
    </a>
    {b.contact_email && (
      <button
        onClick={() => { navigator.clipboard.writeText(b.contact_email); toast.success('Email copié'); }}
        className="text-gray-400 hover:text-gray-600 shrink-0"
        title="Copier l'email"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
</td>
             <td className="p-4">
  <div className="flex items-center justify-between gap-2">
    <span className="flex-1 truncate">
      <Highlight text={b.contact_phone || ''} term={searchTerm} />
    </span>
    {b.contact_phone && (
      <button
        onClick={() => { navigator.clipboard.writeText(b.contact_phone); toast.success('Téléphone copié'); }}
        className="text-gray-400 hover:text-gray-600 shrink-0"
        title="Copier le téléphone"
      >
        <Copy className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
</td>
              <td className="p-4"><Highlight text={b.service_type || b.event_name || ''} term={searchTerm} /></td>
              <td className="p-4">{b.children_count}</td>
              <td className="p-4">
               <span className={`px-2 py-1 rounded-full text-xs whitespace-nowrap ${
  b.status === 'confirmed' || b.status === 'approved' ? 'bg-green-100 text-green-700' :
  b.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
  b.status === 'cancelled' ? 'bg-red-100 text-red-700' :
  'bg-gray-100 text-gray-700'
}`}>
  {statusLabels[b.status] || b.status}
</span>
              </td>
              <td className="p-4">{b.total_price ? `${b.total_price} TND` : '—'}</td>
              <td className="p-4 text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => onView(b)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onDelete(b)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}