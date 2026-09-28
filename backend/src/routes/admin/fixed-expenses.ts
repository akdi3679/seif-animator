import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { logFinancialEvent } from '../../lib/financial-events.js';
import { z } from 'zod';
import { rejectIfLocked } from '../../lib/fiscal-lock.js';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:expenses' });
router.use(limiter);

const expenseSchema = z.object({
  name: z.string().min(1, 'Name required'),
  amount: z.number(), // will be positive or negative
  category: z.string().min(1, 'Category required'),
  isActive: z.boolean().optional().default(true),
});

// LIST
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const { data, error, count } = await supabase
    .from('FixedExpense')
    .select('*', { count: 'exact' })
    .order('createdAt', { ascending: false });

  if (error) return res.status(500).json({ error: 'Operation failed' });
  await logAudit({ userId: req.user.id, action: 'LIST', resource: 'FixedExpense', req, success: true, metadata: { count } });
  res.json({ items: data, total: count });
});

// CREATE
router.post('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { data, error } = await supabase.from('FixedExpense').insert(parsed.data).select().single();
  if (error) return res.status(400).json({ error: error.message });

  // Log financial event (amount can be positive or negative)
  await logFinancialEvent({
    source: 'expense',
    sourceId: data.id,
    field: 'amount',
    oldValue: 0,
    newValue: Number(data.amount),
    description: `Charge fixe – ${data.name} ajoutée (${data.amount} TND)`,
  });

  logAudit({ userId: req.user.id, action: 'CREATE', resource: 'FixedExpense', resourceId: data.id, req, success: true });
  res.status(201).json(data);
});

// UPDATE
router.put('/:id', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

const { data: oldExpense } = await supabase.from('FixedExpense').select('name, amount, createdAt').eq('id', req.params.id).single();
if (Number(oldExpense.amount) !== Number(parsed.data.amount)) {
  rejectIfLocked(oldExpense.createdAt, 'amount');
}
  const { data, error } = await supabase.from('FixedExpense').update(parsed.data).eq('id', req.params.id).select().maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Not found' });

  // Log financial event if amount changed
  if (Number(oldExpense.amount) !== Number(parsed.data.amount)) {
    await logFinancialEvent({
      source: 'expense',
      sourceId: req.params.id,
      field: 'amount',
      oldValue: Number(oldExpense.amount),
      newValue: Number(parsed.data.amount),
      description: `Charge fixe – ${oldExpense.name} modifiée de ${oldExpense.amount} à ${parsed.data.amount} TND`,
    });
  }

  logAudit({ userId: req.user.id, action: 'UPDATE', resource: 'FixedExpense', resourceId: req.params.id, req, success: true });
  res.json(data);
});

// DELETE
router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { data: oldExpense } = await supabase.from('FixedExpense').select('name, amount').eq('id', req.params.id).single();
const { data: expenseToDelete } = await supabase
  .from('FixedExpense')
  .select('createdAt')
  .eq('id', req.params.id)
  .single();

if (expenseToDelete) {
  rejectIfLocked(expenseToDelete.createdAt);
}
  const { error } = await supabase.from('FixedExpense').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: 'Operation failed' });

  // Log financial event to reverse the expense
  if (oldExpense) {
    await logFinancialEvent({
      source: 'expense',
      sourceId: req.params.id,
      field: 'amount',
      oldValue: Number(oldExpense.amount),
      newValue: 0,
      description: `Charge fixe – ${oldExpense.name} supprimée, valeur retirée`,
    });
  }

  logAudit({ userId: req.user.id, action: 'DELETE', resource: 'FixedExpense', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

export default router;