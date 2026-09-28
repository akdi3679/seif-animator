import cron from 'node-cron';
import { v2 as cloudinary } from 'cloudinary';
import { supabase } from './supabase.js';
import redis from './redis.js';
import { deleteCloudinaryImage } from './cloudinary.js';
import { syncCalEventTypes } from '../services/cal-sync.service.js';
import { logFinancialEvent } from './financial-events.js';
import { rejectIfLocked } from './fiscal-lock.js';
import { queueBackup } from '../services/backup-service.js';

export interface CronDefinition {
  name: string;
  label: string;
  description: string;
  schedule: string;
  cronExpr: string;
  alwaysOn: boolean;          // ← featureFlag removed entirely
  run: () => Promise<void>;
}


// ── Helpers ──────────────────────────────────────────────
function monthDiff(from: Date, to: Date): number {
  let m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) m--;
  return m;
}
function addMonthsSafe(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(d.getMonth() + months);
  if (out.getMonth() !== (((d.getMonth() + months) % 12 + 12) % 12)) out.setDate(0);
  return out;
}

// ── Job implementations ──────────────────────────────────
async function runCalSync() {
  console.log('⏰ Running scheduled sync of Cal.com event types');
  await syncCalEventTypes();
}

async function runAbandonedImageCleanup() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const result = await cloudinary.api.resources_by_tag('booking-pending', { context: true, max_results: 500 });
  const toDelete = result.resources
    .filter((r: any) => new Date(r.created_at) < new Date(oneHourAgo))
    .map((r: any) => r.public_id);
  if (toDelete.length > 0) {
    await cloudinary.api.delete_resources(toDelete);
    console.log(`🧹 Cleaned up ${toDelete.length} abandoned booking images`);
  }
}

async function runEventCleanup() {
  const { error } = await supabase.from('Event').delete().lt('autoDeleteDate', new Date().toISOString());
  if (error) console.error('Event cleanup error:', error);
}

async function runSoftDeletePurge() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // ── Bookings (backed up) ──
  const { data: oldBookings } = await supabase
    .from('Booking').select('id, image_public_id')
    .not('deleted_at', 'is', null).lt('deleted_at', thirtyDaysAgo);
  if (oldBookings?.length) {
    for (const b of oldBookings) if (b.image_public_id) await deleteCloudinaryImage(b.image_public_id);
    await supabase.from('Booking').delete().in('id', oldBookings.map(b => b.id));
    for (const b of oldBookings) queueBackup('booking', 'delete', b.id);
  }

  // ── Message / Order / NewsletterSubscriber (backed up) ──
  const purgeTables = [
    { table: 'Message', entity: 'message' },
    { table: 'Order', entity: 'order' },
    { table: 'NewsletterSubscriber', entity: 'newsletter' },
  ];
  for (const { table, entity } of purgeTables) {
    const { data: old } = await supabase
      .from(table).select('id')
      .not('deleted_at', 'is', null).lt('deleted_at', thirtyDaysAgo);
    if (old?.length) {
      const ids = old.map(r => r.id);
      await supabase.from(table).delete().in('id', ids);
      for (const id of ids) queueBackup(entity, 'delete', id);
    }
  }

  // ── Products (NOT backed up — just clean images + rows) ──
  const { data: oldProducts } = await supabase
    .from('Product').select('id, image_public_id')
    .not('deleted_at', 'is', null).lt('deleted_at', thirtyDaysAgo);
  if (oldProducts?.length) {
    for (const p of oldProducts) if (p.image_public_id) await deleteCloudinaryImage(p.image_public_id);
    await supabase.from('Product').delete().in('id', oldProducts.map(p => p.id));
  }
}

async function runAuditCleanup() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('AuditLog').delete().lt('createdAt', cutoff);
}

async function runWorkerSalary() {
  const now = new Date();
  const { data: activeWorkers } = await supabase
    .from('Worker').select('id, firstName, lastName, salary, "joinedAt"').eq('isActive', true);
  for (const w of activeWorkers ?? []) {
    if (!w.joinedAt) continue;
    const joined = new Date(w.joinedAt);
    const months = monthDiff(joined, now);
    if (months <= 0) continue;
    for (let i = 0; i < months; i++) {
      const eventDate = addMonthsSafe(joined, i + 1);
      const monthStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
      const monthEnd = new Date(eventDate.getFullYear(), eventDate.getMonth() + 1, 1);
      const { data: posted } = await supabase.rpc('financial_event_exists_in_month', {
        p_source: 'worker', p_source_id: w.id,
        p_month_start: monthStart.toISOString(), p_month_end: monthEnd.toISOString(),
      });
      if (posted) continue;
      try { rejectIfLocked(eventDate, 'salary'); }
      catch (err: any) {
        if (err.statusCode === 423) { console.error(`[CRON] Salary skipped for ${w.firstName} ${w.lastName} (${w.id}) — fiscally locked ${eventDate.toISOString()}. Will retry.`); continue; }
        throw err;
      }
      await logFinancialEvent({
        source: 'worker', sourceId: w.id, field: 'salary', oldValue: 0, newValue: -Number(w.salary),
        description: `Salaire mensuel – ${w.firstName} ${w.lastName} (${w.salary} TND) – ${eventDate.toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}`,
      });
    }
  }
}

async function runFixedExpense() {
  const now = new Date();
  const { data: activeExpenses } = await supabase
    .from('FixedExpense').select('id, name, amount, "createdAt"').eq('isActive', true);
  for (const e of activeExpenses ?? []) {
    if (!e.createdAt) continue;
    const created = new Date(e.createdAt);
    const months = monthDiff(created, now);
    if (months <= 0) continue;
    for (let i = 0; i < months; i++) {
      const eventDate = addMonthsSafe(created, i + 1);
      const monthStart = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
      const monthEnd = new Date(eventDate.getFullYear(), eventDate.getMonth() + 1, 1);
      const { data: posted } = await supabase.rpc('financial_event_exists_in_month', {
        p_source: 'expense', p_source_id: e.id,
        p_month_start: monthStart.toISOString(), p_month_end: monthEnd.toISOString(),
      });
      if (posted) continue;
      try { rejectIfLocked(eventDate, 'expense'); }
      catch (err: any) {
        if (err.statusCode === 423) { console.error(`[CRON] Expense skipped for "${e.name}" (${e.id}) — fiscally locked ${eventDate.toISOString()}. Will retry.`); continue; }
        throw err;
      }
      await logFinancialEvent({
        source: 'expense', sourceId: e.id, field: 'amount', oldValue: 0, newValue: -Number(e.amount),
        description: `Charge fixe mensuelle – ${e.name} (${e.amount} TND) – ${eventDate.toLocaleString('fr-FR', { month: 'long', year: 'numeric' })}`,
      });
    }
  }
}

async function runVisitorSync() {
  const count = parseInt((await redis.get('visitor:count:total')) || '0');
  if (count > 0) {
    await redis.del('visitor:count:total');
    await supabase.rpc('increment_visitors', { count });
  }
}

// ── THE SINGLE SOURCE OF TRUTH ───────────────────────────
export const CRON_DEFINITIONS: CronDefinition[] = [
  { name: 'cal-sync', label: 'Cal.com Event Sync', description: 'Syncs event types from Cal.com', schedule: 'Every 5 min', cronExpr: '*/5 * * * *', alwaysOn: false, run: runCalSync },
  { name: 'abandoned-image-cleanup', label: 'Abandoned Image Cleanup', description: 'Deletes booking images left pending for over 1 hour (Cloudinary)', schedule: 'Hourly', cronExpr: '0 * * * *', alwaysOn: true, run: runAbandonedImageCleanup },
  { name: 'event-cleanup', label: 'Event Auto-Delete', description: 'Removes past events whose autoDeleteDate has passed', schedule: 'Daily 00:00', cronExpr: '0 0 * * *', alwaysOn: true, run: runEventCleanup },
  { name: 'soft-delete-purge', label: 'Soft-Delete Purge (30 days)', description: 'Permanently deletes soft-deleted bookings, messages, orders, products + their images', schedule: 'Daily 03:00', cronExpr: '0 3 * * *', alwaysOn: true, run: runSoftDeletePurge },
  { name: 'audit-cleanup', label: 'Audit Log Cleanup (30 days)', description: 'Deletes audit log entries older than 30 days', schedule: 'Daily 03:00', cronExpr: '0 3 * * *', alwaysOn: true, run: runAuditCleanup },
  { name: 'worker-salary', label: 'Worker Salary Charge', description: 'Posts monthly salary expenses for active workers (idempotent, respects fiscal lock)', schedule: 'Daily 03:00', cronExpr: '0 3 * * *', alwaysOn: true, run: runWorkerSalary },
  { name: 'fixed-expense', label: 'Fixed Expense Charge', description: 'Posts monthly fixed-expense charges (idempotent, respects fiscal lock)', schedule: 'Daily 03:00', cronExpr: '0 3 * * *', alwaysOn: true, run: runFixedExpense },
  { name: 'visitor-sync', label: 'Visitor Counter Sync', description: 'Flushes the Redis visitor count to the database', schedule: 'Every 5 min', cronExpr: '*/5 * * * *', alwaysOn: true, run: runVisitorSync },
];
// ── Called once from server.ts to schedule everything ────
export function registerCrons() {
  for (const def of CRON_DEFINITIONS) {
    cron.schedule(def.cronExpr, async () => {
      try {
        if (!def.alwaysOn) {
          // Toggleable cron → state lives in the NEW CronSetting table
          const { data } = await supabase
            .from('CronSetting')
            .select('enabled')
            .eq('name', def.name)
            .maybeSingle();
          if (!data?.enabled) {
            console.log(`⏭️  ${def.name} skipped – disabled`);
            return;
          }
        }
        await def.run();
      } catch (err) {
        console.error(`❌ Cron ${def.name} failed:`, err);
      }
    });
  }
  console.log(`✅ Registered ${CRON_DEFINITIONS.length} cron jobs`);
}