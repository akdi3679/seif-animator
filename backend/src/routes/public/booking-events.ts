import { Router } from 'express'
import redis from '../../lib/redis.js' // main client (already configured)

const router = Router()

router.get('/', async (req, res) => {
  const token = req.query.token as string
  if (!token) return res.status(400).json({ error: 'Missing token' })

  // Check existence using main client
  const exists = await redis.exists(`prebooking:${token}`)
  if (!exists) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write(`data: expired\n\n`)
    res.end()
    return
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
  const keepAlive = setInterval(() => res.write(':keepalive\n\n'), 15000)

  // Create a duplicate client (shares config, separate connection)
  const subscriber = redis.duplicate()
  // Wait for the duplicate to be ready
  await new Promise<void>((resolve, reject) => {
    subscriber.once('ready', () => resolve())
    subscriber.once('error', reject)
  })

  const channel = `booking:status:${token}`
  await subscriber.subscribe(channel)
  subscriber.on('message', (ch, message) => {
    if (ch === channel) {
      res.write(`data: ${message}\n\n`)
    }
  })

  req.on('close', async () => {
    clearInterval(keepAlive)
    await subscriber.unsubscribe(channel)
    await subscriber.quit()
  })
})

export default router