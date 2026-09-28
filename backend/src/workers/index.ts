// backend/src/workers/index.ts
import './email-worker.js'
import './telegram-worker.js'

import { startBackupWorker } from './backup-worker.js'

startBackupWorker()          // ← this line is required

console.log('✅ All workers started')