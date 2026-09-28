'use client';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Copy, Hash, ClipboardCheck, Info } from 'lucide-react';
import { toast } from 'sonner';

export function BookingDetailsDialog({ booking, open, onOpenChange, onDelete }: any) {
  const t = useTranslations('admin.bookings');
  if (!booking) return null;

  const statusVariant: any =
    booking.status === 'confirmed' ? 'success' :
    booking.status === 'pending' ? 'warning' :
    booking.status === 'cancelled' ? 'destructive' : 'secondary';

  const CopyableValue = ({ value, label }: { value: string; label: string }) => (
    <div className="flex items-center gap-2 group">
      <span className="text-gray-700">{value || '—'}</span>
      {value && (
        <button
          onClick={() => { navigator.clipboard.writeText(value); toast.success(`${label} copié`); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-600"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Hash className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold m-0">
                {t('details')} #{booking.booking_id || booking.id?.slice(0, 8)}
              </DialogTitle>
              <p className="text-xs text-gray-500">
                {new Date(booking.desired_date).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
              </p>
            </div>
          </div>
          <Badge variant={statusVariant} className="capitalize px-3 py-1 text-sm">{booking.status}</Badge>
        </div>

        <div className="px-6 py-6 space-y-6">
          <section className="bg-gray-50 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Client</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nom</label>
                <CopyableValue value={booking.contact_name} label="Nom" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Email</label>
                <CopyableValue value={booking.contact_email} label="Email" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Téléphone</label>
                <CopyableValue value={booking.contact_phone} label="Téléphone" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Lieu</label>
                <CopyableValue value={booking.location} label="Lieu" />
              </div>
            </div>
          </section>

          <section className="bg-gray-50 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4" /> Détails de la réservation
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Type</label>
                <p className="text-gray-700 text-sm">{booking.type || '—'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Service</label>
                <p className="text-gray-700 text-sm">{booking.service_type || '—'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Service Personnalisé</label>
                <p className="text-gray-700 text-sm">{booking.custom_service || '—'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Nom de l'événement</label>
                <p className="text-gray-700 text-sm">{booking.event_name || '—'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Durée</label>
                <p className="text-gray-700 text-sm">{booking.duration_minutes} min</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Enfants</label>
                <p className="text-gray-700 text-sm">{booking.children_count}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Prix</label>
                <p className="text-gray-700 text-sm font-medium">{booking.total_price ? `${booking.total_price} TND` : '—'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Paiement</label>
                <p className="text-gray-700 text-sm capitalize">{booking.payment_status || '—'}</p>
              </div>
            </div>
          </section>

          <section className="bg-gray-50 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Info className="w-4 h-4" /> Informations supplémentaires
            </h3>
            <div className="space-y-3">
              {booking.description && (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Description</label>
                  <p className="text-gray-700 text-sm">{booking.description}</p>
                </div>
              )}
              {booking.calcom_uri && (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Cal.com URI</label>
                  <p className="text-gray-700 text-sm font-mono">{booking.calcom_uri}</p>
                </div>
              )}
              {booking.cancellation_reason && (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Raison d'annulation</label>
                  <p className="text-gray-700 text-sm">{booking.cancellation_reason}</p>
                </div>
              )}
              {booking.reschedule_reason && (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Raison de report</label>
                  <p className="text-gray-700 text-sm">{booking.reschedule_reason}</p>
                </div>
              )}
              {booking.notes && (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Notes</label>
                  <p className="text-gray-700 text-sm">{booking.notes}</p>
                </div>
              )}
              {booking.image_url && (
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Image</label>
                  <img src={booking.image_url} alt="Booking" className="w-32 h-32 object-cover rounded-xl mt-1" />
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 bg-white border-t px-6 py-4 flex justify-end rounded-b-xl">
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 className="w-4 h-4 mr-2" /> {t('delete')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}