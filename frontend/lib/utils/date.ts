export function formatDate(date: string | Date, locale: string = 'fr'): string {
  const d = new Date(date)
  return d.toLocaleDateString(locale === 'ar' ? 'ar-TN' : 'fr-TN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

export function formatTime(date: string | Date, locale: string = 'fr'): string {
  const d = new Date(date)
  return d.toLocaleTimeString(locale === 'ar' ? 'ar-TN' : 'fr-TN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}
