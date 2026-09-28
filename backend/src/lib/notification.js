import { supabase } from './supabase.js';

export const NOTIFICATION_TYPES = ['order', 'booking', 'contact', 'newsletter'];

export async function createNotification(type, { reference = null, title = null, message = null } = {}) {
  try {
    await supabase.from('Notification').insert({ type, reference, title, message, status: 'unread' });
  } catch (err) {
    console.error('[NOTIFICATION] create failed:', err);
  }
}

// Stock = pending orders whose items exceed available stock (computed, persists until resolved)
async function computeStockAlertCount() {
  const { data: orders } = await supabase
    .from('Order')
    .select('id, OrderItem(product_id, quantity)')
    .eq('status', 'pending');
  if (!orders?.length) return 0;

  const productIds = orders.flatMap(o => o.OrderItem?.map(i => i.product_id) ?? []);
  if (!productIds.length) return 0;

  const { data: products } = await supabase.from('Product').select('id, stock_quantity').in('id', productIds);
  const stockMap = {};
  products?.forEach(p => { stockMap[p.id] = p.stock_quantity; });

  return orders.filter(o => o.OrderItem?.some(i => i.quantity > (stockMap[i.product_id] ?? 0))).length;
}

export async function getNotificationSummary() {
  const counts = { order: 0, booking: 0, contact: 0, newsletter: 0, stock: 0 };

  const { data } = await supabase.from('Notification').select('type').eq('status', 'unread');
  data?.forEach(row => { if (counts[row.type] !== undefined) counts[row.type]++; });

  counts.stock = await computeStockAlertCount();
  return counts;
}

export async function markTypeRead(type) {
  if (!NOTIFICATION_TYPES.includes(type)) return; // stock is never "read"
  await supabase
    .from('Notification')
    .update({ status: 'read', readAt: new Date().toISOString() })
    .eq('type', type)
    .eq('status', 'unread'); // idempotent
}