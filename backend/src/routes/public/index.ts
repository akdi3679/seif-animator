// backend/src/routes/public/index.ts
// Aggregate all public routes (Port 4000)
// Per documentation: backend/src/routes/public/index.ts

import { Router } from 'express'
import { createRateLimiter } from '../../middleware/rate-limit.js';

import bookingRoutes from './bookings.js'
import productRoutes from './products.js'
import categoriesRoutes from './categories.js'
import ordersRoutes from './orders.js'

import contactRoutes from './contact.js'
import eventRoutes from './events.js'
import servicesRouter from './services.js'
import serviceTypesRouter from './service-types.js'
import signUploadRouter from './sign-upload.js'
import bookingInitRouter from './booking-init.js'
import bookingStatusRouter from './booking-status.js'
import bookingEventsRouter from './booking-events.js'
import prebookingDataRouter from './prebooking-data.js'
import contactInfoRouter from './contact-info.js';
import adminScheduleRouter from './admin-schedule.js';
import heroRoutes from './hero.js';
import goalsRoutes from './goals.js';
import brandsRoutes from './brands.js';
import termsRoutes from './terms.js';
import newsletterRoutes from './newsletter.js';
import aboutRoutes from './about.js';
import featureflagsRoutes from './feature-flags.js';
import sitedataRoutes from './site-data.js';
import galleryRoutes from './gallery.js';
import tailscaleVerifyRoutes from './tailscale-verify.js';
import siteimagesRoutes from './site-images.js';
import faqRoutes from './faq.js';
import challengeRoutes from './challenge.js';
import whychooseusRoutes from './why-choose-us.js';
import contactSubjectsRouter from './contact-subjects.js';
import geoLookupRoutes from './geo-lookup.js';

const router = Router()
const globalGetLimiter = createRateLimiter({
  windowMs: 60 * 1000,      // 1 minute
  maxRequests: 100,
  keyPrefix: 'ratelimit:global-get',
});

router.use((req, res, next) => {
  if (req.method === 'GET') {
    return globalGetLimiter(req, res, next);
  }

  next();
});


router.use('/bookings', bookingRoutes)
router.use('/products', productRoutes)
router.use('/categories', categoriesRoutes)
router.use('/orders', ordersRoutes)
router.use('/gallery', galleryRoutes);
router.use('/contact', contactRoutes)
router.use('/events', eventRoutes)
router.use('/services', servicesRouter)
router.use('/service-types', serviceTypesRouter)
router.use('/booking-status', bookingStatusRouter)
router.use('/sign-upload', signUploadRouter)
router.use('/booking-init', bookingInitRouter)
router.use('/booking-events', bookingEventsRouter)
router.use('/prebooking-data', prebookingDataRouter)
router.use('/contact-info', contactInfoRouter);
router.use('/admin-schedule', adminScheduleRouter);
router.use('/hero', heroRoutes);
router.use('/goals', goalsRoutes);
router.use('/brands', brandsRoutes);
router.use('/terms', termsRoutes);
router.use('/newsletter', newsletterRoutes);
router.use('/about', aboutRoutes);
router.use('/feature-flags', featureflagsRoutes);
router.use('/site-data', sitedataRoutes);
router.use('/tailscale-verify', tailscaleVerifyRoutes);
router.use('/site-images', siteimagesRoutes);
router.use('/faq', faqRoutes);
router.use('/challenge', challengeRoutes);
router.use('/why-choose-us', whychooseusRoutes);
router.use('/contact-subjects', contactSubjectsRouter);
router.use('/geo-lookup', geoLookupRoutes);

export { router as publicRoutes }