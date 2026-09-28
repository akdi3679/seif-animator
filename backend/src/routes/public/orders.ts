import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../../lib/supabase.js';
import { createNotification } from '../../lib/notification.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { encrypt } from '../../lib/encryption.js';
import { randomBytes } from 'crypto';
import { queueBackup } from '../../services/backup-service.js';

const router = Router();
const orderLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 5, keyPrefix: 'ratelimit:order' });

const orderSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string(),
  address: z.string().min(5),
  notes: z.string().optional(),
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number(),
    quantity: z.number().int().min(1),
  })),
  total: z.number(),
});

router.post('/', orderLimiter, async (req, res, next) => {
  try {
    const { name, email, phone, address, notes, items, total } = orderSchema.parse(req.body);
    const orderRef = `ORD-${Date.now()}-${randomBytes(2).toString('hex')}`; // simple reference, can be improved
    const encryptedPhone = phone ? encrypt(phone) : null;

   const { data: order, error } = await supabase
  .from('Order')
  .insert({
    order_reference: orderRef,
    total_amount: total,
    customer_name: name,
     contact_email: email,          // ← fixed
    contact_phone: encryptedPhone,  
    shipping_address: address,
    notes,
    status: 'pending',
  })
  .select('id')
  .single();

   if (error) throw error;
  createNotification('order', { reference: order.id });
   

    const orderItems = items.map(item => ({
      order_id: order.id,
      product_id: item.id,
      product_name: item.name,
      quantity: item.quantity,
      unit_price: item.price,
      total_price: item.price * item.quantity,
    }));
    const { error: itemsError } = await supabase.from('OrderItem').insert(orderItems);
    if (itemsError) throw itemsError;
queueBackup('order', 'insert', order.id)
    res.status(201).json({ success: true, orderId: order.id, reference: orderRef });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    next(error);
  }
});

export default router;