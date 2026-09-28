// src/routes/public/booking-init.ts
import { Router } from 'express'
import { z } from 'zod'
import { bookingCreateSchema } from '../../lib/validators/booking.js'
import { randomBytes } from 'crypto'
import { createRateLimiter } from '../../middleware/rate-limit.js';
import redis from '../../lib/redis.js'
import { encrypt } from '../../lib/encryption.js';

const router = Router()
const TTL_SECONDS = 1800 // 30 minutes
const bookingInitLimiter = createRateLimiter();

router.post('/', bookingInitLimiter, async (req, res, next) => {
  try {
    const validated = bookingCreateSchema.parse(req.body)
    let token = req.body.token
    let isNew = false

    if (!token) {
      token = randomBytes(32).toString('hex')
      isNew = true
    } else {
      // Verify token exists
      const existing = await redis.get(`prebooking:${token}`)
      if (!existing) {
        return res.status(404).json({ error: 'Token expired or invalid' })
      }
    }
const phoneToStore = validated.phone ? encrypt(validated.phone) : null;
const dataToStore = {
  ...validated,
  phone: phoneToStore,
  token,
  imageUrl: validated.imageUrl || '',
  imagePublicId: validated.imagePublicId || '',
  updatedAt: Date.now(),
};
    await redis.setex(`prebooking:${token}`, TTL_SECONDS, JSON.stringify(dataToStore))
    await redis.setex(`pending:email:${validated.email}`, TTL_SECONDS, JSON.stringify(dataToStore))

    console.log(`[DEBUG] ${isNew ? 'Created' : 'Updated'} prebooking with token ${token}`)
    res.json({ token, isNew })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message })
      return
    }
    next(error)
  }
})

export default router