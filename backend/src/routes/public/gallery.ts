import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';
import { isFeatureEnabled } from '../../lib/feature-flags.js';

const router = Router();




// ── GET /api/public/gallery/combined – paginated items + categories + counts ──
router.get('/combined', async (req, res) => {
  if (!(await isFeatureEnabled('gallery'))) return res.status(404).json({ error: 'Feature disabled' });

  res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');

  
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  // 1) Fetch all active categories (top‑level + children)
  const { data: categories, error: catError } = await supabase
    .from('GalleryCategory')
    .select('id, name_fr, name_ar, slug, parent_id')
    .eq('is_active', true)
    .order('order_index');

  if (catError) return res.status(500).json({ error: 'cat Operation failed' });

  // 2) Total number of active media items
  const { count: total, error: countError } = await supabase
    .from('GalleryItem')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  if (countError) return res.status(500).json({ error: 'count Operation failed' });

  // 3) Paginated media items
  const { data: items, error: itemError } = await supabase
    .from('GalleryItem')
    .select('id, title_fr, title_ar, media_url, media_type, is_gif, category_id, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (itemError) return res.status(500).json({ error: 'item Operation failed' });

  // 4) Per‑category item counts – only direct children, no recursion
  const categoryCounts: Record<string, number> = {};
  for (const cat of categories ?? []) {
    // Get the IDs of the immediate children of this category
    const childIds = (categories ?? [])
      .filter(c => c.parent_id === cat.id)
      .map(c => c.id);

    // Combine the category’s own ID with its children’s IDs
    const allIds = [cat.id, ...childIds];

    const { count } = await supabase
      .from('GalleryItem')
      .select('*', { count: 'exact', head: true })
      .in('category_id', allIds)
      .eq('is_active', true);

    categoryCounts[cat.slug] = count ?? 0;
  }

  // “All” category count = total items
  if (categories?.find(c => c.slug === 'all')) {
    categoryCounts['all'] = total ?? 0;
  }

  // “Latest” category count = items created in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: latestCount } = await supabase
    .from('GalleryItem')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', thirtyDaysAgo)
    .eq('is_active', true);

  if (categories?.find(c => c.slug === 'latest')) {
    categoryCounts['latest'] = latestCount ?? 0;
  }

  res.json({
    categories: categories ?? [],
    items: items ?? [],
    total: total ?? 0,
    categoryCounts,
    hasMore: offset + limit < (total ?? 0),
  });
});

// ── GET /api/public/gallery/categories – used by homepage section ──
router.get('/categories', async (_req, res) => {
  if (!(await isFeatureEnabled('gallery'))) return res.status(404).json({ error: 'Feature disabled' });
    res.set('Cache-Control', 'public, max-age=300');
  const { data, error } = await supabase
    .from('GalleryCategory')
    .select('id, name_fr, name_ar, slug, parent_id')
    .eq('is_active', true)
    .is('parent_id', null)
    .order('order_index');
  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json(data);
});

// ── GET /api/public/gallery/items – used by homepage section (limit 6) ──
router.get('/items', async (req, res) => {
  if (!(await isFeatureEnabled('gallery'))) return res.status(404).json({ error: 'Feature disabled' });
  res.set('Cache-Control', 'public, max-age=300');
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const { data, error } = await supabase
    .from('GalleryItem')
    .select('id, title_fr, title_ar, media_url, media_type, is_gif, category_id')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: 'Operation failed' });
  res.json({ items: data });
});

export default router;