import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { z } from 'zod';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:admin:upload' });
router.use(limiter);

const uploadSchema = z.object({
  // file is handled by multer, not Zod
  folder: z.string().optional(),
});

router.post('/image', authenticate, requireAdmin, csrfProtection, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const folder = parsed.data?.folder || 'admin';

  try {
    const result = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file!.buffer);
    });

    res.json({ url: result.secure_url, public_id: result.public_id });
  } catch (err: any) {
    console.error('Cloudinary upload failed:', err);
    res.status(500).json({ error: err.message || 'Upload failed' });
  }
});

export default router;