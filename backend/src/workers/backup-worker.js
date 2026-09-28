import { Worker } from 'bullmq';
import { backupQueue, redisConnection } from '../lib/queue.js';
import { runDailyBackup, isBackupConfigured } from '../services/backup-service.js';

let started = false;
export function startBackupWorker() {
  if (started || !isBackupConfigured()) return;
  started = true;

  new Worker('backup', async () => {
    await runDailyBackup();
  }, { connection: redisConnection, concurrency: 1 });

  // once per day at 04:00
  backupQueue.add('sync', {}, { repeat: { pattern: '0 4 * * *' } }).catch(() => {});
  console.log('[BACKUP] worker scheduled — daily at 04:00');
}