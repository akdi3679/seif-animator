import { Router } from 'express'
import redis from '../../lib/redis.js'

const router = Router()

router.get('/', async (req, res) => {
  const token = req.query.token as string
  if (!token) return res.status(400).json({ error: 'Missing token' })

  const dataStr = await redis.get(`prebooking:${token}`)
  if (!dataStr) return res.status(404).json({ error: 'Not found' })

  const data = JSON.parse(dataStr)
  // Remove internal fields before sending to client
  const { token: _, ...safeData } = data
  res.json(safeData)
})

export default router