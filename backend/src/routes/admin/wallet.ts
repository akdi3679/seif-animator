import { Router } from 'express';
import { authenticate, requireAdmin, csrfProtection } from '../../middleware/auth.js';
import { verifyDeleteCode } from '../../middleware/delete-code.js';
import { createRateLimiter } from '../../middleware/rate-limit.js';
import { supabase } from '../../lib/supabase.js';
import { logAudit } from '../../lib/audit.js';
import { logFinancialEvent } from '../../lib/financial-events.js';
import { rejectIfLocked } from '../../lib/fiscal-lock.js';
import { z } from 'zod';

const router = Router();
const limiter = createRateLimiter({ windowMs: 60_000, max: 30, keyPrefix: 'ratelimit:admin:wallet' });
router.use(limiter);

// ── GET /wallet ────────────────────────────────────────────────
// Always returns { balance, totalIncome, monthlyExpense, events, bounds }
// bounds = { minDate, maxDate } of ALL events in DB (for period selector)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  const { start, end } = req.query;

  let startDate: string;
  let endDate: string;
  let bounds: { minDate: string; maxDate: string } | null = null;

  if (start && end) {
    // Explicit range (week / month / year selected)
    const s = new Date(start as string);
    const e = new Date(end as string);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      return res.status(400).json({ error: 'Invalid date range' });
    }
    startDate = s.toISOString();
    endDate = e.toISOString();

    // Still fetch bounds so the frontend period selector always knows
    // the full available range without a second round-trip.
    const { data: b } = await supabase.rpc('get_wallet_bounds');
    if (b?.hasData) {
      bounds = { minDate: b.minDate, maxDate: b.maxDate };
    }
  } else {
    // "all" — resolve REAL bounds, not 1970
    const { data: b, error: boundsErr } = await supabase.rpc('get_wallet_bounds');

    if (boundsErr) {
      console.error('[WALLET] get_wallet_bounds failed:', boundsErr);
      return res.status(500).json({ error: 'Failed to fetch wallet bounds' });
    }

    if (!b?.hasData) {
      // Zero events in the entire system
      await logAudit({ userId: req.user.id, action: 'VIEW', resource: 'Wallet', req, success: true });
      return res.json({ balance: 0, totalIncome: 0, monthlyExpense: 0, events: [], bounds: null });
    }

    startDate = b.minDate;
    endDate = b.maxDate;
    bounds = { minDate: b.minDate, maxDate: b.maxDate };
  }

  const { data, error } = await supabase.rpc('get_wallet_data', {
    p_start: startDate,
    p_end: endDate,
  });

  if (error) {
    console.error('[WALLET] get_wallet_data failed:', error);
    return res.status(500).json({ error: 'Failed to fetch wallet data' });
  }

  await logAudit({ userId: req.user.id, action: 'VIEW', resource: 'Wallet', req, success: true });

  res.json({ ...data, bounds });
});

// ── GET /wallet/last-week (mini chart) ─────────────────────────
router.get('/last-week', authenticate, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const { data: events, error } = await supabase
      .from('FinancialEvent')
      .select('change, createdAt')
      .gte('createdAt', sevenDaysAgo.toISOString())
      .order('createdAt', { ascending: true });

    if (error) return res.status(500).json({ error: 'Operation failed' });

    const { data: priorEvents } = await supabase
      .from('FinancialEvent')
      .select('change')
      .lt('createdAt', sevenDaysAgo.toISOString());

    const priorBalance = priorEvents?.reduce((sum, e) => sum + Number(e.change), 0) ?? 0;

    // 1. Create the 7 daily buckets (no balance yet — just income/expense)
    const dailyMap: Record<string, { date: string; income: number; expense: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dailyMap[key] = { date: key, income: 0, expense: 0 };
    }

    // 2. Aggregate each event into its day
    for (const event of events ?? []) {
      const key = new Date(event.createdAt).toISOString().split('T')[0];
      if (dailyMap[key]) {
        if (Number(event.change) > 0) dailyMap[key].income += Number(event.change);
        else dailyMap[key].expense += Math.abs(Number(event.change));
      }
    }

    // 3. Walk the days in order, carrying the balance forward.
    //    Every day after an entry keeps the new level — no dip-and-recover.
    let runningBalance = priorBalance;
    const days = Object.values(dailyMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(day => {
        runningBalance += day.income - day.expense;
        return { date: day.date, balance: runningBalance, income: day.income, expense: day.expense };
      });

    // Overall (all-time) summary for the cards
    const { data: summary } = await supabase.rpc('get_wallet_summary');

    res.json({
      days,
      balance: Number(summary?.balance ?? 0),
      totalIncome: Number(summary?.totalIncome ?? 0),
      totalExpense: Number(summary?.totalExpense ?? 0),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch wallet data' });
  }
});
// ── POST /wallet/entry ─────────────────────────────────────────
router.post('/entry', authenticate, requireAdmin, csrfProtection, verifyDeleteCode, async (req, res) => {
  const schema = z.object({
    amount: z.coerce.number().refine(val => val !== 0, 'Amount cannot be zero'),
    description: z.string().min(1, 'Description required'),
    date: z.string().datetime().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

  const eventDate = parsed.data.date ? new Date(parsed.data.date) : new Date();

  try {
    rejectIfLocked(eventDate, 'manual');
  } catch (err: any) {
    if (err.statusCode === 423) return res.status(423).json({ error: 'Fiscal period is locked' });
    throw err;
  }

  try {
    await logFinancialEvent({
      source: 'manual',
      sourceId: null,
      field: 'manual',
      oldValue: 0,
      newValue: Number(parsed.data.amount),
      description: `Entrée manuelle – ${parsed.data.description} (${parsed.data.amount} TND)`,
    });
  } catch (err: any) {
    console.error('[WALLET] logFinancialEvent failed:', err);
    return res.status(500).json({ error: 'Failed to log financial event' });
  }

  logAudit({ userId: req.user.id, action: 'MANUAL_ENTRY', resource: 'Wallet', req, success: true });
  res.status(201).json({ success: true });
});

export default router;