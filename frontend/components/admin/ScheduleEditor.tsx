'use client';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';

interface ScheduleDay {
  day_number: number;
  day_name_fr: string;
  day_name_ar: string;
  work_parts_count: number;
  part1_start: string | null;
  part1_end: string | null;
  part2_start: string | null;
  part2_end: string | null;
  part3_start: string | null;
  part3_end: string | null;
}

interface Props {
  days: ScheduleDay[];
  onChange: (days: ScheduleDay[]) => void;
  errors: Record<string, string>;
}

export default function ScheduleEditor({ days, onChange, errors }: Props) {
  const t = useTranslations('admin.contact');

  const handleChange = (dayNumber: number, field: string, value: string) => {
    onChange(days.map(d => d.day_number === dayNumber ? { ...d, [field]: value } : d));
  };

  const handleWorkPartsCount = (dayNumber: number, count: number) => {
    onChange(days.map(d => d.day_number === dayNumber ? { ...d, work_parts_count: count } : d));
  };

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
      {days.map(day => (
        <div key={day.day_number} className={`flex items-center gap-2 text-sm p-2 rounded-lg ${day.work_parts_count === 0 ? 'bg-gray-200 opacity-60' : ''}`}>
          <span className="w-20 font-medium">{day.day_name_fr}</span>
          <select
            value={day.work_parts_count}
            onChange={(e) => handleWorkPartsCount(day.day_number, parseInt(e.target.value))}
            className="border rounded px-2 py-1 w-16 text-xs"
          >
            <option value={0}>Fermé</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
          {day.work_parts_count > 0 && (
            <>
              <Input type="time" value={day.part1_start || ''} onChange={e => handleChange(day.day_number, 'part1_start', e.target.value)} className="w-24 text-xs" />
              <span className="text-xs text-gray-400">à</span>
              <Input type="time" value={day.part1_end || ''} onChange={e => handleChange(day.day_number, 'part1_end', e.target.value)} className="w-24 text-xs" />
            </>
          )}
          {day.work_parts_count > 1 && (
            <>
              <Input type="time" value={day.part2_start || ''} onChange={e => handleChange(day.day_number, 'part2_start', e.target.value)} className="w-24 text-xs" />
              <span className="text-xs text-gray-400">à</span>
              <Input type="time" value={day.part2_end || ''} onChange={e => handleChange(day.day_number, 'part2_end', e.target.value)} className="w-24 text-xs" />
            </>
          )}
          {day.work_parts_count > 2 && (
            <>
              <Input type="time" value={day.part3_start || ''} onChange={e => handleChange(day.day_number, 'part3_start', e.target.value)} className="w-24 text-xs" />
              <span className="text-xs text-gray-400">à</span>
              <Input type="time" value={day.part3_end || ''} onChange={e => handleChange(day.day_number, 'part3_end', e.target.value)} className="w-24 text-xs" />
            </>
          )}
          {errors[`day${day.day_number}`] && <p className="text-red-500 text-xs">{errors[`day${day.day_number}`]}</p>}
        </div>
      ))}
    </div>
  );
}