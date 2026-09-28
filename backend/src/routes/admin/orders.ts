import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { z } from 'zod';
import { queueBackup } from '../../services/backup-service.js';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:orders' });
router.use(limiter);

const statusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'shipped', 'cancelled']),
});


// ── GET list with filters, search, trash ──
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const { search, status, dateFrom, dateTo, limit = 20, offset = 0, deleted } = req.query;

  let query = supabase
    .from('Order')
    .select(
      'id, order_reference, customer_name, contact_email, total_amount, status, created_at, shipping_address, notes',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  if (deleted === 'true') {
    query = query.not('deleted_at', 'is', null);
  } else {
    query = query.is('deleted_at', null);
  }

  if (status && ['pending', 'confirmed', 'shipped', 'cancelled'].includes(status)) {
    query = query.eq('status', status);
  }

  if (dateFrom) query = query.gte('created_at', new Date(dateFrom).toISOString());
  if (dateTo) query = query.lte('created_at', new Date(dateTo).toISOString());

 if (search) {
  const term = `%${search}%`;
  query = query.or(
    `customer_name.ilike.${term},` +
    `contact_email.ilike.${term},` +
    `order_reference.ilike.${term},` +
    `status.ilike.${term},` +
    `shipping_address.ilike.${term},` +
    `notes.ilike.${term}`
  );
}
  query = query.range(Number(offset), Number(offset) + Number(limit) - 1);

  const { data: orders, error, count } = await query;
  if (error) {
    // Log failed list attempt
    await logAudit({
      userId: req.user!.id,
      action: 'LIST',
      resource: 'Order',
      req,
      success: false,
      metadata: { error: error.message },
    });
    return res.status(500).json({ error: 'Operation failed' });
  }

  const orderIds = orders?.map(o => o.id) ?? [];
  const { data: items } = await supabase
    .from('OrderItem')
    .select('order_id, product_name')
    .in('order_id', orderIds);

  const itemsMap = {};
  items?.forEach(item => {
    if (!itemsMap[item.order_id]) itemsMap[item.order_id] = [];
    itemsMap[item.order_id].push(item.product_name);
  });

  const result = orders?.map(o => ({
    ...o,
    OrderItem: (itemsMap[o.id] || []).map(n => ({ product_name: n })),
  })) ?? [];

  // Log successful list (no resourceId for list)
  await logAudit({
    userId: req.user!.id,
    action: 'LIST',
    resource: 'Order',
    req,
    success: true,
    metadata: { count },
  });

  res.json({ orders: result, total: count });
});

// ── GET single order detail ──────────────
router.get('/:id', authenticate, requireAdmin, async (req, res) => {
  const { data: order, error } = await supabase
    .from('Order')
    .select('id, order_reference, customer_name, contact_email, contact_phone, shipping_address, notes, total_amount, status, created_at')
    .eq('id', req.params.id)
    .single();

  if (error || !order) {
    await logAudit({
      userId: req.user!.id,
      action: 'VIEW',
      resource: 'Order',
      resourceId: req.params.id,
      req,
      success: false,
      metadata: { error: error?.message || 'Not found' },
    });
    return res.status(404).json({ error: 'Not found' });
  }

  if (order.contact_phone) {
    try {
      const { decrypt } = await import('../../lib/encryption.js');
      order.contact_phone = decrypt(order.contact_phone);
    } catch {}
  }

  const { data: items } = await supabase
    .from('OrderItem')
    .select('id, product_name, quantity, unit_price, total_price, product_id')
    .eq('order_id', req.params.id);

  const productIds = items?.map(i => i.product_id) ?? [];
  const { data: products } = await supabase
    .from('Product')
    .select('id, stock_quantity')
    .in('id', productIds);

  const stockMap = {};
  products?.forEach(p => { stockMap[p.id] = p.stock_quantity; });

  const itemsWithStock = items?.map(item => ({
    ...item,
    stock_quantity: stockMap[item.product_id] ?? 0,
  })) ?? [];

  // Log successful view
  await logAudit({
    userId: req.user!.id,
    action: 'VIEW',
    resource: 'Order',
    resourceId: req.params.id,
    req,
    success: true,
  });

  res.json({ ...order, OrderItem: itemsWithStock });
});

// ── PUT update status – only confirmed affects stock ─
router.put('/:id/status', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const { data: order, error: fetchErr } = await supabase
    .from('Order')
    .select('id, status, OrderItem (product_id, quantity)')
    .eq('id', req.params.id)
    .single();

  if (fetchErr || !order) return res.status(404).json({ error: 'Not found' });
  const newStatus = parsed.data.status;
  const oldStatus = order.status;

  for (const item of order.OrderItem ?? []) {
  // DECREMENT only when entering CONFIRMED from PENDING or CANCELLED
  if (
    newStatus === 'confirmed' &&
    ['pending', 'cancelled'].includes(oldStatus)
  ) {
    const { data: ok } = await supabase.rpc('adjust_stock', {
      p_product_id: item.product_id,
      p_quantity: -item.quantity,
    });
    if (!ok) {
      return res.status(400).json({ error: `Stock insuffisant pour le produit ${item.product_id}` });
    }
  }

  // INCREMENT only when leaving CONFIRMED back to PENDING or CANCELLED
  // (NOT when moving to shipped – stock stays consumed)
  if (
    oldStatus === 'confirmed' &&
    ['pending', 'cancelled'].includes(newStatus)
  ) {
    await supabase.rpc('adjust_stock', {
      p_product_id: item.product_id,
      p_quantity: item.quantity,
    });
  }
}

  const { data: updated, error: updateErr } = await supabase
    .from('Order')
    .update({ status: newStatus, updated_at: new Date() })
    .eq('id', req.params.id)
    .select('id, status')
    .maybeSingle();

  if (updateErr || !updated) return res.status(500).json({ error: 'Operation failed' });
queueBackup('order', 'update', req.params.id);
  logAudit({
    userId: req.user!.id,
    action: 'UPDATE_STATUS',
    resource: 'Order',
    resourceId: req.params.id,
    req,
    success: true,
    metadata: { oldStatus, newStatus },
  });
  res.json({ success: true, id: updated.id, status: updated.status });
});

// ── SOFT DELETE (restock only if confirmed) ─
router.delete('/:id', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { data: order } = await supabase
    .from('Order')
    .select('id, status, OrderItem(product_id, quantity)')
    .eq('id', req.params.id)
    .is('deleted_at', null)
    .single();

  if (!order) return res.status(404).json({ error: 'Not found or already deleted' });

  if (order.status === 'confirmed') {
    for (const item of order.OrderItem ?? []) {
      await supabase.rpc('adjust_stock', {
        p_product_id: item.product_id,
        p_quantity: item.quantity,
      });
    }
  }

  const { data: deleted, error } = await supabase
    .from('Order')
    .update({ deleted_at: new Date() })
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle();

  if (error || !deleted) return res.status(500).json({ error: 'Operation failed' });
  queueBackup('order', 'update', req.params.id);   // soft delete → row still exists
  logAudit({ userId: req.user!.id, action: 'SOFT_DELETE', resource: 'Order', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

// ── RESTORE (decrement stock again if confirmed) ─
router.post('/:id/restore', authenticate, requireAdmin, csrfProtection, async (req, res) => {
  const { data: order } = await supabase
    .from('Order')
    .select('id, status, OrderItem(product_id, quantity)')
    .eq('id', req.params.id)
    .not('deleted_at', 'is', null)
    .maybeSingle();

  if (!order) return res.status(404).json({ error: 'Not found or not soft‑deleted' });
  if (order.status === 'confirmed') {
    for (const item of order.OrderItem ?? []) {
      const { data: ok } = await supabase.rpc('adjust_stock', {
        p_product_id: item.product_id,
        p_quantity: -item.quantity,
      });
      if (!ok) {
        return res.status(400).json({ error: `Stock insuffisant pour le produit ${item.product_id}` });
      }
    }
  }

  const { data: restored, error } = await supabase
    .from('Order')
    .update({ deleted_at: null })
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle();

  if (error || !restored) return res.status(500).json({ error: 'Operation failed' });
  queueBackup('order', 'update', req.params.id);
  logAudit({ userId: req.user!.id, action: 'RESTORE', resource: 'Order', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

// ── PERMANENT DELETE (no restock – soft delete already did it) ─
router.delete('/:id/permanent', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const { data: order } = await supabase
    .from('Order')
    .select('id')
    .eq('id', req.params.id)
    .not('deleted_at', 'is', null)
    .maybeSingle();

  if (!order) return res.status(404).json({ error: 'Not found or not soft‑deleted' });
  await supabase.from('OrderItem').delete().eq('order_id', req.params.id);
  const { error } = await supabase.from('Order').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: 'Operation failed' });
queueBackup('order', 'delete', req.params.id);
  logAudit({ userId: req.user!.id, action: 'PERMANENT_DELETE', resource: 'Order', resourceId: req.params.id, req, success: true });
  res.json({ success: true });
});

export default router; 