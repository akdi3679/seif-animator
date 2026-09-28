import { Router } from 'express'
import { supabase } from '../../lib/supabase.js'
import { isFeatureEnabled } from '../../lib/feature-flags.js';

const router = Router()

// GET /api/public/events
router.get('/', async (_req, res) => {
   if (!(await isFeatureEnabled('events'))) {
    return res.status(404).json({ error: 'Feature disabled' });
  } 
  // Allow caching for 1 minute (public)
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

  const { data, error } = await supabase
    .from('Event')
    .select('id, titleFr, titleAr, descriptionFr, descriptionAr, date, endDate, location, imageUrl, auto_display')
    .is('deletedAt', null)
    .gte('endDate', new Date().toISOString())   // only future events
    .order('date', { ascending: true });

  if (error) {
    console.error('GET /api/public/events error:', error);
    return res.status(500).json({ error: 'Failed to fetch events' });
  }

  res.json({ events: data });
});


// GET /api/public/events/:id
router.get('/:id', async (req, res, next) => {
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=30')
  try {
    const { data: event, error } = await supabase
      .from('Event')
      .select('id, titleFr, titleAr, descriptionFr, descriptionAr, date, endDate, location, imageUrl')
      .eq('id', req.params.id)
      .is('deletedAt', null)
      .single()

    if (error || !event) {
      res.status(404).json({ error: 'Event not found' })
      return
    }

    res.json({ event })
  } catch (error) {
    next(error)
  }
})

export default router