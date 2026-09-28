// components/admin/BookingStatusBadge.tsx
'use client'

interface Props {
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED'
}

export function BookingStatusBadge({ status }: Props) {
  const styles = {
    PENDING: 'bg-yellow-100 text-yellow-700',
    CONFIRMED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-gray-100 text-gray-700'
  }

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}