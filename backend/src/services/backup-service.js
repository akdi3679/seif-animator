import { supabase } from '../lib/supabase.js';
import { backupSupabase, isBackupConfigured } from '../lib/backup-supabase.js';

const ENTITIES = {
  message:          { table: 'Message' },
  booking:          { table: 'Booking' },
  newsletter:       { table: 'NewsletterSubscriber' },
  gallery_item:     { table: 'GalleryItem' },
  gallery_category: { table: 'GalleryCategory' },
  order:            { table: 'Order' },
};
const FULL_TABLES = ['Message','Booking','NewsletterSubscriber','GalleryItem','GalleryCategory','Order','OrderItem','visitor_locations'];
const SYNC_ENTITIES = ['message','booking','newsletter','order','gallery_item','gallery_category','visitor_locations'];

// ── Called at every create/update/delete point ──
export async function queueBackup(entity, action, recordId) {
  try {
    await supabase.from('backup_outbox').insert({ entity, action, record_id: String(recordId), status: 'pending' });
  } catch (e) { console.error('[BACKUP] queue failed:', e); }
}

// ── Is the backup reachable? ──
export async function isBackupReachable() {
  if (!isBackupConfigured()) return false;
  try {
    const { error } = await backupSupabase.from('SiteData').select('id').limit(1);
    if (!error) return true;
    const m = (error.message || '').toLowerCase();
    return !['fetch', 'network', 'econn', 'timeout', 'abort'].some(k => m.includes(k));
  } catch { return false; }
}

// ── Does the backup need a full sync? (empty / wiped) ──
async function backupNeedsFullSync() {
  const { data, error } = await backupSupabase.from('backup_sync_state').select('entity').limit(1);
  if (error) return true;
  return !data || data.length === 0;
}

// ── Daily orchestration ──
export async function runDailyBackup() {
  if (!isBackupConfigured()) return console.log('[BACKUP] not configured — skipping');
  if (!(await isBackupReachable())) return console.log('[BACKUP] unreachable — will retry next run');

  if (await backupNeedsFullSync()) {
    console.log('[BACKUP] backup empty — full sync');
    await fullSyncAllTables();
    // full sync covers everything → clear pending outbox
    await supabase.from('backup_outbox')
      .update({ status: 'synced', synced_at: new Date().toISOString() })
      .eq('status', 'pending');
  } else {
    await processBackupOutbox();
  }

  await syncVisitorLocations();       // visitor goes with the backup
  await retryFailed();
  await writePerEntitySyncState();    // stamp BOTH main and backup
  console.log('[BACKUP] daily run complete');
}

// ── Sync one outbox job ──
async function syncOne(entity, action, recordId) {
  const cfg = ENTITIES[entity];
  if (!cfg) return;

  if (action === 'delete') {
    if (entity === 'order') await backupSupabase.from('OrderItem').delete().eq('order_id', recordId);
    await backupSupabase.from(cfg.table).delete().eq('id', recordId);
    return;
  }

  const { data: row, error } = await supabase.from(cfg.table).select('*').eq('id', recordId).maybeSingle();
  if (error) throw error;
  if (!row) return;

  const { error: upErr } = await backupSupabase.from(cfg.table).upsert(row, { onConflict: 'id' });
  if (upErr) throw upErr;

  if (entity === 'order') {
    const { data: items } = await supabase.from('OrderItem').select('*').eq('order_id', recordId);
    await backupSupabase.from('OrderItem').delete().eq('order_id', recordId);
    if (items?.length) await backupSupabase.from('OrderItem').upsert(items);
  }
}

// ── Process pending outbox (incremental) ──
export async function processBackupOutbox() {
  const { data: pending } = await supabase
    .from('backup_outbox').select('*').eq('status', 'pending')
    .order('created_at', { ascending: true }).limit(500);
  if (!pending?.length) return { processed: 0 };

  let processed = 0;
  for (const job of pending) {
    try {
      await syncOne(job.entity, job.action, job.record_id);
      await supabase.from('backup_outbox').update({ status: 'synced', synced_at: new Date().toISOString() }).eq('id', job.id);
      processed++;
    } catch (err) {
      const attempts = (job.attempts || 0) + 1;
      await supabase.from('backup_outbox').update({
        status: attempts >= 5 ? 'failed' : 'pending', attempts, error: err.message,
      }).eq('id', job.id);
    }
  }
  return { processed };
}

// ── Full sync of all tables (paginated) ──
async function fullSyncAllTables() {
  for (const table of FULL_TABLES) await fullSyncTable(table);
}
async function fullSyncTable(table) {
  let from = 0;
  while (true) {
    const { data } = await supabase.from(table).select('*').range(from, from + 499);
    if (!data?.length) break;
    const { error } = await backupSupabase.from(table).upsert(data, { onConflict: 'id' });
    if (error) { console.error(`[BACKUP] fullSync ${table}:`, error); return; }
    if (data.length < 500) break;
    from += 500;
  }
}

// ── visitor_locations batch (runs with the daily backup) ──
export async function syncVisitorLocations() {
  const { data } = await supabase.from('visitor_locations').select('*');
  if (data?.length) await backupSupabase.from('visitor_locations').upsert(data, { onConflict: 'id' });
}

// ── Retry failed jobs (older than 24h) ──
export async function retryFailed() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('backup_outbox').update({ status: 'pending', attempts: 0 })
    .eq('status', 'failed').lt('created_at', cutoff);
}

// ── Per-entity sync state → written to BOTH main and backup ──
async function writePerEntitySyncState() {
  const now = new Date().toISOString();
  for (const entity of SYNC_ENTITIES) {
    await supabase.from('backup_sync_state').upsert({ entity, last_synced_at: now }, { onConflict: 'entity' });
    await backupSupabase.from('backup_sync_state').upsert({ entity, last_synced_at: now }, { onConflict: 'entity' });
  }
}