import { Router } from 'express';
import { getTailscalePeers, isTailscaleIP } from '../../lib/tailscale.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    let { clientIP } = req.body;
    if (!clientIP) return res.json({ allowed: false });

    // Strip IPv6-mapped prefix if present
    if (clientIP.startsWith('::ffff:')) {
      clientIP = clientIP.split('::ffff:')[1];
    }

    if (!isTailscaleIP(clientIP)) {
      return res.json({ allowed: false });
    }
console.log(clientIP)
    const peers = await getTailscalePeers();
    const allowed = peers.includes(clientIP);
    res.json({ allowed });
  } catch (error) {
    console.error('[tailscale-verify] Error:', error);
    res.json({ allowed: false });
  }
});

export default router;