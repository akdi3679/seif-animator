import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { v2 as cloudinary } from 'cloudinary';

const router = Router();

router.delete('/:public_id', authenticate, requireAdmin, csrfProtection,  async (req, res) => {
  try {
    await cloudinary.uploader.destroy(req.params.public_id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Deletion failed' });
  }
});

export default router;