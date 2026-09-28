import { Router } from 'express'
import { supabase } from '../../lib/supabase.js'

const router = Router()

// GET /api/public/bookings – view own bookings by email (optional)
router.get('/', async (req, res, next) => {
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=30')
  try {
    const email = req.query.email as string
    if (!email) return res.status(400).json({ error: 'Email required' })

    const { data: bookings, error } = await supabase
      .from('Booking')
      .select('id, status, desired_date, service_type, booking_reference, children_count, event_name, location, total_price')
      .eq('contact_email', email)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ bookings })
  } catch (error) {
    next(error)
  }
})

export default router