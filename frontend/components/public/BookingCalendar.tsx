'use client'

import { useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { fr, ar } from 'date-fns/locale'
import 'react-day-picker/dist/style.css'

interface BookingCalendarProps {
  locale: string
  onDateSelect: (date: Date | undefined) => void
  selectedDate?: Date
  disabledDates?: Date[]
}

export function BookingCalendar({
  locale,
  onDateSelect,
  selectedDate,
  disabledDates,
}: BookingCalendarProps) {
  const [month, setMonth] = useState<Date>(new Date())

  // Map locale to date-fns locale
  const dateLocale = locale === 'ar' ? ar : fr

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-orange-200">
      <DayPicker
        mode="single"
        selected={selectedDate}
        onSelect={onDateSelect}
        month={month}
        onMonthChange={setMonth}
        disabled={disabledDates}
        locale={dateLocale}
        modifiersClassNames={{
          selected: 'bg-primary text-white rounded-full',
          today: 'font-bold text-primary border border-primary rounded-full',
        }}
        classNames={{
          day: 'w-10 h-10 hover:bg-orange-100 rounded-full transition-colors',
          caption: 'flex justify-between items-center mb-4 font-bold text-lg',
          nav: 'flex gap-2',
          nav_button: 'p-2 hover:bg-orange-100 rounded-full',
          head_cell: 'text-gray-500 font-normal text-sm',
          month: 'w-full',
        }}
      />
    </div>
  )
}