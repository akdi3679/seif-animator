import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { rejectIfLocked } from '../../lib/fiscal-lock.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, max: 30, keyPrefix: 'ratelimit:admin:workers' });
router.use(limiter);

const workerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().min(1),
  role: z.string().min(1),
  phone: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  isActive: z.boolean().optional().default(true),
  salary: z.coerce.number().positive(),
  version: z.coerce.number().int().min(1).optional(),   // ← NEW
}).refine(data => data.email || data.phone, {
  message: 'At least email or phone is required',
  path: ['email'],
});

// LIST
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const { data, error, count } = await supabase
    .from('Worker')
    .select('*', { count: 'exact' })
    .order('createdAt', { ascending: false });

  if (error) return res.status(500).json({ error: 'Operation failed' });
  logAudit({ userId: req.user.id, action: 'LIST', resource: 'Worker', req, success: true, metadata: { count } });
  res.json({ items: data, total: count });
});

// CREATE
router.post('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = workerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { data, error } = await supabase.from('Worker').insert(parsed.data).select().single();
  if (error) return res.status(400).json({ error: error.message });

  logAudit({ userId: req.user.id, action: 'CREATE', resource: 'Worker', resourceId: data.id, req, success: true });
  res.status(201).json(data);
});

// UPDATE – atomic: worker update + salary wallet adjustment in ONE transaction
router.put('/:id', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = workerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  // 1. Fetch current state
  const { data: oldWorker, error: fetchErr } = await supabase
    .from('Worker')
    .select('salary, firstName, lastName, createdAt, version')   // ← + version
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !oldWorker) return res.status(404).json({ error: 'Not found' });

  const oldSalary = Number(oldWorker.salary);
  const newSalary = Number(parsed.data.salary);
  const salaryChanged = oldSalary !== newSalary;

  // Client's version = true session-level OCC.
  // Fallback to the fresh read only if an old client doesn't send it.
  const expectedVersion = parsed.data.version ?? oldWorker.version;

  // 2. Fiscal lock check (only when the salary actually changes)
  if (salaryChanged) {
    try {
      rejectIfLocked(oldWorker.createdAt, 'salary');
    } catch (err: any) {
      if (err.statusCode === 423) return res.status(423).json({ error: 'Fiscal period is locked' });
      throw err;
    }
  }

  // 3. Atomic update + financial event (single RPC, single transaction)
 const { data, error } = await supabase.rpc('atomic_update_worker_with_salary_event', {
    p_id: req.params.id,
    p_expected_version: expectedVersion,        // ← NEW
    p_expected_salary: oldSalary,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
    p_email: parsed.data.email || null,
    p_address: parsed.data.address,
    p_role: parsed.data.role,
    p_phone: parsed.data.phone,
    p_notes: parsed.data.notes,
    p_is_active: parsed.data.isActive,
    p_new_salary: newSalary,
    p_event_description: salaryChanged
      ? `${oldWorker.firstName} ${oldWorker.lastName} – Salaire modifié de ${oldSalary} à ${newSalary} TND`
      : '',
  });

  if (error) {
    if (error.message?.includes('WORKER_CONFLICT')) {
      return res.status(409).json({ error: 'Worker was modified by another user. Please refresh and try again.' });
    }
    console.error('[WORKERS] update failed:', error);
    return res.status(500).json({ error: 'Update failed' });
  }

  logAudit({ userId: req.user.id, action: 'UPDATE', resource: 'Worker', resourceId: req.params.id, req, success: true });
  res.json(data);
});

// DELETE – atomic: delete + salary removal event in ONE transaction
router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { data: oldWorker } = await supabase
    .from('Worker')
    .select('salary, firstName, lastName, createdAt')
    .eq('id', req.params.id)
    .single();

  if (!oldWorker) return res.status(404).json({ error: 'Not found' });

  try {
    rejectIfLocked(oldWorker.createdAt);
  } catch (err: any) {
    if (err.statusCode === 423) return res.status(423).json({ error: 'Fiscal period is locked' });
    throw err;
  }

  const { error } = await supabase.rpc('atomic_delete_worker_with_salary_event', {
    p_id: req.params.id,
    p_event_description: `${oldWorker.firstName} ${oldWorker.lastName} – Employé supprimé, salaire retiré`,
  });

  if (error) {
    if (error.message?.includes('WORKER_NOT_FOUND')) return res.status(404).json({ error: 'Not found' });
    console.error('[WORKERS] delete failed:', error);
    return res.status(400).json({ error: 'Operation failed' });
  }

  logAudit({ userId: req.user.id, action: 'DELETE', resource: 'Worker', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

export default router;