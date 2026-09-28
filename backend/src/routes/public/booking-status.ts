import { Router } from 'express'
import redis from '../../lib/redis.js'

const router = Router()

router.get('/', async (req, res) => {
  const { token } = req.query
  if (!token) return res.status(400).json({ error: 'Missing token' })

  const completed = await redis.get(`completed:${token}`)
  if (completed) {
    return res.json({ status: 'completed' })
  }

  // optionally check if token exists and is still pending
  const preBooking = await redis.get(`prebooking:${token}`)
  if (!preBooking) {
    return res.json({ status: 'expired' })
  }

  return res.json({ status: 'pending' })
})

export default router