'use client';
import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { usePublicGETSWR } from '@/lib/api/hooks';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/admin/RefreshButton';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { RetryableError } from '@/components/shared/RetryableError';
import { toast } from 'sonner';
import { adminAPI } from '@/lib/api/client';
import { RateLimitError } from '@/lib/api/types';
import ScheduleEditor from '@/components/admin/ScheduleEditor';

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

const DEFAULT_SCHEDULE: ScheduleDay[] = Array.from({ length: 7 }, (_, i) => ({
  day_number: i + 1,
  day_name_fr: '',
  day_name_ar: '',
  work_parts_count: 0,
  part1_start: null,
  part1_end: null,
  part2_start: null,
  part2_end: null,
  part3_start: null,
  part3_end: null,
}));

function buildSummary(days: ScheduleDay[]): string | null {
  const activeDays = days.filter(d => d.work_parts_count > 0);
  if (activeDays.length === 0) return null;

  const first = activeDays[0].day_name_fr;
  const last = activeDays[activeDays.length - 1].day_name_fr;

  let earliestStart: string | null = null;
  let latestEnd: string | null = null;

  for (const day of activeDays) {
    for (const time of [day.part1_start, day.part2_start, day.part3_start]) {
      if (time && (!earliestStart || time < earliestStart)) earliestStart = time;
    }
    for (const time of [day.part1_end, day.part2_end, day.part3_end]) {
      if (time && (!latestEnd || time > latestEnd)) latestEnd = time;
    }
  }

  if (!earliestStart || !latestEnd) return null;
  return `${first} – ${last} ${earliestStart.replace(':', 'h')}‑${latestEnd.replace(':', 'h')}`;
}

export default function ScheduleTab() {
  const t = useTranslations('admin.contact');

  const {
    data: scheduleData,
    mutate: mutateSchedule,
    isValidating: scheduleValidating,
    error: scheduleError,
    retry: scheduleRetry,
    isRetrying: scheduleIsRetrying,
  } = usePublicGETSWR<ScheduleDay[]>('/admin-schedule');

  const [scheduleDays, setScheduleDays] = useState<ScheduleDay[]>(DEFAULT_SCHEDULE);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scheduleErrors, setScheduleErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (scheduleData && Array.isArray(scheduleData)) setReady(true);
  }, [scheduleData]);

  useEffect(() => {
    if (scheduleData && Array.isArray(scheduleData)) {
      const merged = DEFAULT_SCHEDULE.map(defaultDay => {
        const fetched = scheduleData.find(d => d.day_number === defaultDay.day_number);
        return fetched ? { ...defaultDay, ...fetched, day_number: defaultDay.day_number } : defaultDay;
      });
      setScheduleDays(merged);
    }
  }, [scheduleData]);

  const validateSchedule = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    for (const day of scheduleDays) {
      if (day.work_parts_count > 0) {
        if (!day.part1_start || !day.part1_end || day.part1_start >= day.part1_end)
          errs[`day${day.day_number}`] = 'Part 1 invalide';
      }
      if (day.work_parts_count > 1) {
        if (!day.part2_start || !day.part2_end || day.part2_start >= day.part2_end || day.part2_start <= (day.part1_end || ''))
          errs[`day${day.day_number}`] = 'Part 2 invalide';
      }
      if (day.work_parts_count > 2) {
        if (!day.part3_start || !day.part3_end || day.part3_start >= day.part3_end || day.part3_start <= (day.part2_end || ''))
          errs[`day${day.day_number}`] = 'Part 3 invalide';
      }
    }
    setScheduleErrors(errs);
    return Object.keys(errs).length === 0;
  }, [scheduleDays]);

  const handleSave = async () => {
  if (!validateSchedule()) return;
  setSaving(true);
  try {
    // Keep all day fields, but force time fields to null where appropriate
    const payload = scheduleDays.map(d => ({
      ...d,
      part1_start: d.part1_start || null,
      part1_end: d.part1_end || null,
      part2_start: d.part2_start || null,
      part2_end: d.part2_end || null,
      part3_start: d.part3_start || null,
      part3_end: d.part3_end || null,
    }));
    await adminAPI('/schedule', { method: 'PUT', body: JSON.stringify({ schedule: payload }) });
    mutateSchedule(payload, false);  // now contains day names
    toast.success(t('saved'));
    } catch (err: any) {
      if (err instanceof RateLimitError) toast.error(t('rateLimit', { seconds: err.retryAfter }));
      else toast.error(err.message || t('error'));
    }
    setSaving(false);
  };

  const handleRefresh = () => mutateSchedule();

  if (scheduleError && !scheduleData) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{t('scheduleTitle')}</h2>
          <RefreshButton onRefresh={handleRefresh} loading={false} />
        </div>
        <RetryableError error={scheduleError} onRetry={scheduleRetry} isRetrying={scheduleIsRetrying} />
      </div>
    );
  }

  if (!ready) return <LoadingSpinner />;

  const summary = buildSummary(scheduleDays);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('scheduleTitle')}</h2>
        <RefreshButton onRefresh={handleRefresh} loading={scheduleValidating} />
      </div>

      {summary && (
        <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700">
          <span className="font-semibold">{t('summary')} :</span> {summary}
        </div>
      )}

      <ScheduleEditor days={scheduleDays} onChange={setScheduleDays} errors={scheduleErrors} />

      <Button onClick={handleSave} disabled={saving}>
        {saving ? t('saving') : t('save')}
      </Button>
    </div>
  );
}