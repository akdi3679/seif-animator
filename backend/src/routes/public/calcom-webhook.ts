import { Request, Response } from 'express';
import crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { z } from 'zod';
import redis from '../../lib/redis.js';
import { supabase } from '../../lib/supabase.js';
import { imageUploadQueue } from '../../lib/queue.js';
import { sendTelegram } from '../../services/notification-service.js';
import { encrypt } from '../../lib/encryption.js';
import { createNotification } from '../../lib/notification.js';
import { queueBackup } from '../../services/backup-service.js';

const LOCK_TTL = 30; // seconds

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function generateBookingReference(): string {
  return `BK-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
}

// --- Zod schema for payload validation ---
const webhookPayloadSchema = z.object({
  triggerEvent: z.string(),
  payload: z.object({
    uid: z.string().optional(),
    bookingId: z.number().optional(),
    startTime: z.string().datetime().optional(),
    length: z.number().optional(),
    rescheduleId: z.number().optional(),
    rescheduleUid: z.string().optional(),
    cancellationReason: z.string().optional(),
    rescheduleReason: z.string().optional(),
    platformRescheduleUrl: z.string().optional(),
    rejectionReason: z.string().optional(),
    attendees: z.array(z.object({ email: z.string() })).optional(),
    responses: z.object({ email: z.object({ value: z.string() }) }).optional(),
    location: z.any().optional(),
    utm_campaign: z.string().optional(),
    metadata: z.record(z.any()).optional(),
    requiresConfirmation: z.boolean().optional(),
    amount: z.number().optional(),
    currency: z.string().optional(),
    status: z.string().optional(),
  }),
});



// --- Helper: update booking by booking_id or calcom_uri ---
async function updateBooking(updateData: any, bookingId?: number, calcomUri?: string) {
  let result = null;
  if (bookingId) {
    result = await supabase.from('Booking').update(updateData).eq('booking_id', bookingId);
    if (result.error) console.error('[WEBHOOK] Update by booking_id error:', result.error);
    else if (result.count) console.log(`[WEBHOOK] Updated ${result.count} row(s) by booking_id ${bookingId}`);
  }
  if ((!result || !result.count) && calcomUri) {
    result = await supabase.from('Booking').update(updateData).eq('calcom_uri', calcomUri);
    if (result.error) console.error('[WEBHOOK] Update by calcom_uri error:', result.error);
    else if (result.count) console.log(`[WEBHOOK] Updated ${result.count} row(s) by calcom_uri ${calcomUri}`);
  }
  return (result?.count ?? 0) > 0;
}

export async function handleCalcomWebhook(req: Request, res: Response) {
  // 1. Get raw body and signature
  const rawBody = (req as any).rawBody;
  const signature = req.headers['x-cal-signature-256'] as string;
  const secret = process.env.CALCOM_WEBHOOK_SECRET;

  // 2. Verify signature if secret is configured
  if (secret && rawBody) {
    if (!signature) {
      console.error('[WEBHOOK] Missing signature header');
      return res.status(401).json({ error: 'Missing signature' });
    }
       const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    
    // FIX: Check length first to prevent RangeError crash in timingSafeEqual
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      console.error('[WEBHOOK] Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }

  // 3. Validate payload structure using Zod
  const validation = webhookPayloadSchema.safeParse(req.body);
  if (!validation.success) {
    console.error('[WEBHOOK] Invalid payload structure:', validation.error);
    return res.status(400).json({ error: 'Invalid payload', details: validation.error.issues });
  }

  const { triggerEvent, payload } = validation.data;
  const logMeta = {
    event: triggerEvent,
    bookingId: payload.bookingId,
    calcomUri: payload.uid,
  };
  console.log('[WEBHOOK] Processing', JSON.stringify(logMeta));

  // 4. Idempotency: prevent duplicate processing (24h TTL)
  const idempotencyKey = payload.bookingId || payload.uid;
  if (idempotencyKey) {
    const processed = await redis.get(`webhook_processed:${idempotencyKey}`);
    if (processed) {
      console.log(`[WEBHOOK] Duplicate webhook for ${idempotencyKey}, skipping`);
      return res.status(200).json({ success: true, alreadyProcessed: true });
    }
    await redis.setex(`webhook_processed:${idempotencyKey}`, 86400, '1');
  }

  try {
    const calcomUri = payload.uid;
    const bookingId = payload.bookingId;

    // --- BOOKING_CANCELLED ---
    if (triggerEvent === 'BOOKING_CANCELLED') {
      const cancellationReason = payload.cancellationReason || '';
      const rescheduleReason = payload.rescheduleReason || '';
      const platformRescheduleUrl = payload.platformRescheduleUrl || '';
      const isReschedule = !!(rescheduleReason || platformRescheduleUrl);

      const updateData: any = {
        status: isReschedule ? 'rescheduled' : 'cancelled',
        cancellation_reason: cancellationReason,
      };
      if (isReschedule && rescheduleReason) updateData.reschedule_reason = rescheduleReason;

      await updateBooking(updateData, bookingId, calcomUri);

      if (isReschedule && platformRescheduleUrl) {
        const match = platformRescheduleUrl.match(/\/booking\/([^/?]+)/);
        if (match) {
          const newBookingUid = match[1];
          await redis.setex(`reschedule_map:${newBookingUid}`, 300, bookingId?.toString() || '');
          console.log(`[WEBHOOK] Mapped new UID ${newBookingUid} -> old booking ${bookingId}`);
        }
      }
      console.log('[WEBHOOK] Success', JSON.stringify({ ...logMeta, status: 'done' }));
      return res.status(200).json({ success: true });
    }

    // --- BOOKING_RESCHEDULED ---
    if (triggerEvent === 'BOOKING_RESCHEDULED') {
      const oldBookingId = payload.rescheduleId;
      const oldCalcomUri = payload.rescheduleUid;

      if (!oldBookingId && !oldCalcomUri) {
        console.error('[WEBHOOK] No old booking identifier found');
        return res.status(400).json({ error: 'Missing original booking reference' });
      }

      let originalBooking = null;
      if (oldBookingId) {
        const { data } = await supabase
          .from('Booking')
          .select('id, booking_id, calcom_uri')
          .eq('booking_id', oldBookingId)
          .maybeSingle();
        originalBooking = data;
      }
      if (!originalBooking && oldCalcomUri) {
        const { data } = await supabase
          .from('Booking')
          .select('id, booking_id, calcom_uri')
          .eq('calcom_uri', oldCalcomUri)
          .maybeSingle();
        originalBooking = data;
      }

      if (!originalBooking) {
        console.warn('[WEBHOOK] Original booking not found for reschedule');
        console.log('[WEBHOOK] Success', JSON.stringify({ ...logMeta, status: 'skipped_original_not_found' }));
        return res.status(200).json({ success: true });
      }

      const newStartTime = payload.startTime;
      const duration = payload.length || 60;
      const rescheduleReason = payload.rescheduleReason || '';

      let newLocation = '';
      if (payload.location) {
        if (typeof payload.location === 'string') newLocation = payload.location;
        else if (payload.location.value) newLocation = payload.location.value;
        else if (payload.location.link) newLocation = payload.location.link;
        else if (payload.location.type) newLocation = payload.location.type;
      }
        if (!newStartTime) { /* handle error */ return res.status(400).json({ error: 'Missing start time' }); }

      const updateData: any = {
        desired_date: new Date(newStartTime).toISOString(),
        duration_minutes: duration,
        status: 'rescheduled',
      };
      if (newLocation) updateData.location = newLocation;
      if (rescheduleReason) updateData.reschedule_reason = rescheduleReason;
      if (payload.uid) updateData.calcom_uri = payload.uid;

      const { error } = await supabase
        .from('Booking')
        .update(updateData)
        .eq('id', originalBooking.id);

      if (error) {
        console.error('[WEBHOOK] Reschedule update error:', error);
        console.log('[WEBHOOK] Failure', JSON.stringify({ ...logMeta, error: 'Operation failed' }));
        return res.status(500).json({ error: 'Update failed' });
      }

      console.log('[WEBHOOK] Success', JSON.stringify({ ...logMeta, status: 'rescheduled' }));
      return res.status(200).json({ success: true });
    }

    // --- BOOKING_REJECTED ---
    if (triggerEvent === 'BOOKING_REJECTED') {
      const rejectionReason = payload.rejectionReason || '';
      const updateData: any = { status: 'rejected' };
      if (rejectionReason) updateData.cancellation_reason = rejectionReason;
      await updateBooking(updateData, bookingId, calcomUri);
      console.log('[WEBHOOK] Success', JSON.stringify({ ...logMeta, status: 'rejected' }));
      return res.status(200).json({ success: true });
    }

    // --- PAYMENT_CREATED / PAYMENT_UPDATED ---
    if (triggerEvent === 'PAYMENT_CREATED' || triggerEvent === 'PAYMENT_UPDATED') {
      const amount = payload.amount;
      const currency = payload.currency;
      const paymentStatus = payload.status; // 'success', 'pending', 'failed'

      if (!bookingId) {
        console.error('[WEBHOOK] Missing bookingId for payment');
        return res.status(400).json({ error: 'Missing bookingId' });
      }

      const updateData: any = {
        payment_status: paymentStatus === 'success' ? 'paid' : paymentStatus,
      };
      if (amount) updateData.payment_amount = amount;
      if (currency) updateData.payment_currency = currency;

      const { error } = await supabase
        .from('Booking')
        .update(updateData)
        .eq('booking_id', bookingId);

      if (error) {
        console.error('[WEBHOOK] Payment update error:', error);
        console.log('[WEBHOOK] Failure', JSON.stringify({ ...logMeta, error: 'Operation failed' }));
        return res.status(500).json({ error: 'Payment update failed' });
      }

      console.log('[WEBHOOK] Success', JSON.stringify({ ...logMeta, status: 'payment_updated' }));
      return res.status(200).json({ success: true });
    }

    // --- BOOKING_REQUESTED / BOOKING_CREATED ---
    if (triggerEvent === 'BOOKING_REQUESTED' || triggerEvent === 'BOOKING_CREATED') {
      const lockKey = `lock:booking:${calcomUri}`;
      const lockAcquired = await redis.setnx(lockKey, '1');
      if (!lockAcquired) {
        console.log('[WEBHOOK] Another instance processing, skipping');
        return res.status(200).json({ message: 'Already processing' });
      }
      await redis.expire(lockKey, LOCK_TTL);

      try {
        // Check if booking already exists
        const { data: existing } = await supabase
          .from('Booking')
          .select('id, status')
          .eq('calcom_uri', calcomUri)
          .maybeSingle();

        if (existing && triggerEvent === 'BOOKING_CREATED' && existing.status === 'pending') {
          const { error } = await supabase
            .from('Booking')
            .update({ status: 'approved' })
            .eq('calcom_uri', calcomUri);
          if (error) {
            console.error('[WEBHOOK] Approval update error:', error);
            console.log('[WEBHOOK] Failure', JSON.stringify({ ...logMeta, error: 'Operation failed' }));
            return res.status(500).json({ error: 'Approval failed' });
          }
          console.log('[WEBHOOK] Success', JSON.stringify({ ...logMeta, status: 'approved_from_pending' }));
          return res.status(200).json({ success: true });
        }

        if (existing) {
          console.log('[WEBHOOK] Booking already exists, skipping');
          console.log('[WEBHOOK] Success', JSON.stringify({ ...logMeta, status: 'already_exists' }));
          return res.status(200).json({ success: true, alreadyExists: true });
        }

        // No existing booking – create new
        const email = payload.attendees?.[0]?.email || payload.responses?.email?.value;
        if (!email) throw new Error('Missing email');

        let dataStr = await redis.get(`pending:email:${email}`);
        let preBooking = null;
        if (!dataStr) {
          const token = payload.utm_campaign || payload.metadata?.utm_campaign;
          if (token) dataStr = await redis.get(`prebooking:${token}`);
        }
        if (!dataStr) throw new Error('Pre‑booking data not found');

        preBooking = JSON.parse(dataStr);

        let location = '';
        if (payload.location) {
          if (typeof payload.location === 'string') location = payload.location;
          else if (payload.location.link) location = payload.location.link;
          else if (payload.location.type) location = payload.location.type;
        }

let imageUrl = preBooking.imageUrl || '';
if (!payload.startTime) return res.status(400).json({ error: 'Missing start time' });

        const startTime = new Date(payload.startTime);
        const duration = payload.length || 60;
        const bookingReference = generateBookingReference();
        const status = (triggerEvent === 'BOOKING_REQUESTED' && payload.requiresConfirmation) ? 'pending' : 'approved';
const encryptedPhone = preBooking.phone ? encrypt(preBooking.phone) : null;

        const { data: booking, error: insertError } = await supabase
  .from('Booking')
  .upsert({
    type: preBooking.type,
    service_type: preBooking.serviceType,
    custom_service: preBooking.customService,
    desired_date: startTime.toISOString(),
    duration_minutes: duration,
    children_count: preBooking.childrenCount,
    contact_name: preBooking.name,
    contact_email: preBooking.email,
    contact_phone: encryptedPhone,
    notes: preBooking.notes,
    event_name: preBooking.eventName,
    description: preBooking.description,
    image_url: imageUrl,
    location: location,
    booking_id: payload.bookingId,
    token: preBooking.token,
    calcom_uri: calcomUri,
    booking_reference: bookingReference,
    status: status,
  }, { onConflict: 'calcom_uri' })
  .select()
  .single();


        if (insertError) {
          if (insertError.code === '23505') {
            console.log('[WEBHOOK] Duplicate key, likely already created by another event');
            console.log('[WEBHOOK] Success', JSON.stringify({ ...logMeta, status: 'duplicate_key' }));
            return res.status(200).json({ success: true, alreadyExists: true });
          }
          throw insertError;
        }
        queueBackup('booking', 'insert', booking.id)
createNotification('booking', { reference: booking.id });
        console.log(`[WEBHOOK] ✅ Booking created (${status}):`, booking.id);
        // Remove the "booking-pending" tag now that the booking is confirmed
if (preBooking.imagePublicId) {
  await cloudinary.uploader.explicit(preBooking.imagePublicId, {
    type: 'upload',
    remove_all_tags: true,      // clears all tags, including "booking-pending"
  }).catch(err => console.error('[WEBHOOK] Tag removal failed:', err));
}

const chatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
if (chatId) {
  const telegramMessage = 
    `🎉 *New Booking Received*\n` +
    `🆔 Ref: ${booking.booking_reference}\n` +
    `📅 Date: ${startTime.toLocaleString()}\n` +
    `⏱️ Duration: ${duration} min\n` +
    `👤 Contact: ${preBooking.name} (${preBooking.email})\n` +
    `📞 Phone: ${preBooking.phone || '—'}\n` +
    `🧒 Children: ${preBooking.childrenCount}\n` +
    `📍 Location: ${location || 'Not specified'}\n` +
    `📝 Status: ${status}\n` +
    `🔗 Cal.com UID: ${calcomUri}`;
  
  sendTelegram(chatId, telegramMessage, 'Markdown').catch(err =>
    console.error('Telegram booking notify failed:', err)
  );
}
        await redis.publish(`booking:status:${preBooking.token}`, 'created');
        await redis.setex(`completed:${preBooking.token}`, 60, '1');
        await redis.del(`prebooking:${preBooking.token}`);
        await redis.del(`pending:email:${email}`);

        console.log('[WEBHOOK] Success', JSON.stringify({ ...logMeta, status: 'created', bookingId: booking.id }));
        return res.status(200).json({ success: true, bookingId: booking.id });
      } finally {
        await redis.del(lockKey);
      }
    }

    // Ignore other events
    console.log('[WEBHOOK] Ignored event:', triggerEvent);
    console.log('[WEBHOOK] Success', JSON.stringify({ ...logMeta, status: 'ignored' }));
    return res.status(200).json({ message: 'Ignored' });
  } catch (err) {
    console.error('[WEBHOOK] Error:', err);
    console.log('[WEBHOOK] Failure', JSON.stringify({ ...logMeta, error: (err as Error).message }));
    return res.status(500).json({ error: 'Internal server error' });
  }
}