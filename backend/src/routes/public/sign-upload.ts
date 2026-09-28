import { Router } from 'express'
import crypto from 'crypto'

const router = Router()

router.post('/', async (_req, res) => {
  const timestamp = Math.round(Date.now() / 1000)
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME!
  const apiKey = process.env.CLOUDINARY_API_KEY!
  const apiSecret = process.env.CLOUDINARY_API_SECRET!
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET!

  // Cloudinary requires SHA-1, not SHA-256
  const signature = crypto
    .createHash('sha1')
    .update(`timestamp=${timestamp}&upload_preset=${uploadPreset}${apiSecret}`)
    .digest('hex')

  // Must include uploadPreset — frontend needs it
  res.json({ signature, timestamp, cloudName, apiKey, uploadPreset })
})

export default router
