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
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:tools' });
router.use(limiter);

const toolSchema = z.object({
  name: z.string().min(1, 'Name required'),
  description: z.string().min(1, 'Description required'),
  quantity: z.coerce.number().int().positive('Quantity must be positive'),
  usageDate: z.string().min(1, 'Usage date required'),
  state: z.string().min(1, 'State required'),
  notes: z.string().optional().default(''),
  price: z.coerce.number().min(0).optional().default(0),
});

// LIST
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const { data, error, count } = await supabase
    .from('Tool')
    .select('*', { count: 'exact' })
    .order('createdAt', { ascending: false });

  if (error) return res.status(500).json({ error: 'Operation failed' });
  await logAudit({ userId: req.user.id, action: 'LIST', resource: 'Tool', req, success: true, metadata: { count } });
  res.json({ items: data, total: count });
});

// CREATE
router.post('/', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = toolSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { data, error } = await supabase.from('Tool').insert(parsed.data).select().single();
  if (error) return res.status(400).json({ error: error.message });

  // Log financial event if price > 0
  if (Number(parsed.data.price) > 0) {
    await logFinancialEvent({
      source: 'tool',
      sourceId: data.id,
      field: 'price',
      oldValue: 0,
      newValue: -Number(parsed.data.price),
      description: `Outil – ${data.name} acheté pour ${parsed.data.price} TND`,
    });
  }

  logAudit({ userId: req.user.id, action: 'CREATE', resource: 'Tool', resourceId: data.id, req, success: true });
  res.status(201).json(data);
});

// UPDATE
router.put('/:id', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = toolSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  // Fetch old tool (include createdAt for fiscal lock)
  const { data: oldTool } = await supabase
    .from('Tool')
    .select('name, price, createdAt')
    .eq('id', req.params.id)
    .single();

  // Fiscal lock – BEFORE any update
  if (oldTool && Number(oldTool.price) !== Number(parsed.data.price)) {
    rejectIfLocked(oldTool.createdAt, 'price');
  }

  // Now update
  const { data, error } = await supabase.from('Tool').update(parsed.data).eq('id', req.params.id).select().maybeSingle();
  if (error || !data) return res.status(404).json({ error: 'Not found' });

  // Log financial event if price changed
  if (oldTool && Number(oldTool.price) !== Number(parsed.data.price)) {
    await logFinancialEvent({
      source: 'tool',
      sourceId: req.params.id,
      field: 'price',
     oldValue: -Number(oldTool.price),
    newValue: -Number(parsed.data.price),
      description: `Outil – ${oldTool.name} prix modifié de ${oldTool.price} à ${parsed.data.price} TND`,
    });
  }

  logAudit({ userId: req.user.id, action: 'UPDATE', resource: 'Tool', resourceId: req.params.id, req, success: true });
  res.json(data);
});
// DELETE
router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { data: oldTool } = await supabase.from('Tool').select('name, price').eq('id', req.params.id).single();
const { data: toolToDelete } = await supabase
  .from('Tool')
  .select('createdAt')
  .eq('id', req.params.id)
  .single();

if (toolToDelete) {
  rejectIfLocked(toolToDelete.createdAt);
}
  const { error } = await supabase.from('Tool').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: 'Operation failed' });

  // Log financial event if price was > 0
  if (oldTool && Number(oldTool.price) > 0) {
    await logFinancialEvent({
      source: 'tool',
      sourceId: req.params.id,
      field: 'price',
      oldValue: -Number(oldTool.price),
      newValue: 0,
      description: `Outil – ${oldTool.name} supprimé, prix retiré`,
    });
  }

  logAudit({ userId: req.user.id, action: 'DELETE', resource: 'Tool', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

export default router;