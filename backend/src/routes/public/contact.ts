// backend/src/routes/public/contact.ts
// Public contact form (Port 4000)
// Per documentation: backend/src/routes/public/contact.ts

import { Router } from 'express'
import { z } from 'zod'
import { contactSchema } from '../../lib/validators/contact.js'
import { createRateLimiter } from '../../middleware/rate-limit.js'
import { supabase } from '../../lib/supabase.js'
import { encrypt } from '../../lib/encryption.js'
import { createNotification } from '../../lib/notification.js';
import { sendTelegram } from '../../services/notification-service.js';
import { queueBackup } from '../../services/backup-service.js';

const router = Router()

const contactLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: 3, keyPrefix: 'ratelimit:contact' })

// POST /api/public/contact
router.post('/', contactLimiter, async (req, res, next) => {
  try {
    const validated = contactSchema.parse(req.body);
    const encryptedPhone = validated.phone ? encrypt(validated.phone) : null;
    
    const { data: message, error } = await supabase
      .from('Message')
      .insert({
        name: validated.name,
        email: validated.email,
        phone: encryptedPhone,
        message: validated.message,
        subject_id: validated.subjectId || null,
        custom_subject: validated.customSubject || null,
        status: 'NEW'
      })
      .select()
      .single();

       if (error) throw error;
       queueBackup('message', 'insert', message.id)
    createNotification('contact', { reference: message.id });
   

    // Fetch subject title if subjectId provided
    let subjectTitle = '';
    if (validated.subjectId) {
      const { data: subject } = await supabase
        .from('ContactSubject')
        .select('title_fr')
        .eq('id', validated.subjectId)
        .single();
      subjectTitle = subject?.title_fr || '';
    }

    // Send Telegram notification
    const chatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
    if (chatId) {
      const subjectLine = validated.customSubject
        ? `📌 *Sujet:* ${validated.customSubject}`
        : subjectTitle
          ? `📌 *Sujet:* ${subjectTitle}`
          : '';
    
      const telegramMsg = 
        `📬 *New Contact Message*\n` +
        (subjectLine ? `${subjectLine}\n` : '') +
        `👤 *Name:* ${validated.name}\n` +
        `📧 *Email:* ${validated.email}\n` +
        `${validated.phone ? `📞 *Phone:* ${validated.phone}\n` : ''}` +
        `💬 *Message:*\n${validated.message}`;

      sendTelegram(chatId, telegramMsg, 'Markdown').catch(err => 
        console.error('Telegram notify failed:', err)
      );
    }

    res.status(201).json({ success: true, messageId: message.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    next(error);
  }
});

export default router