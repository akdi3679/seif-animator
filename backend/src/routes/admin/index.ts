// backend/src/routes/admin/index.ts
// Aggregate all admin routes (Port 4001, Tailscale-only)
// Per documentation: backend/src/routes/admin/index.ts

import { Router } from 'express'
import authRoutes from './auth.js'

import bookingRoutes from './bookings.js'
import eventRoutes from './events.js'
import productRoutes from './products.js'
import settingsRoutes from './settings.js'
import healthRouter from './health.js'
import servicesRouter from './services.js'
import dashboardRoutes from './dashboard.js';
import systemeHealthRoutes from './systeme-health.js';
import secretCodeRoutes from './secret-codes.js';
import adminSettingsRoutes from './settings.js';
import goalsAdminRoutes from './goals.js';
import keyFiguresAdminRoutes from './key-figures.js';
import whyChooseUsAdminRoutes from './why-choose-us.js';
import aboutAdminRoutes from './about.js';
import translateRoutes from './translate.js';
import cloudinaryRoutes from './cloudinary.js';
import uploadRoutes from './upload.js';
import serviceTypesRoutes from './service-types.js';
import contactInfoRoutes from './contact-info.js';
import contactSubjectsRoutes from './contact-subjects.js';
import faqRoutes from './faq.js';
import newsletterRoutes from './newsletter.js';
import messagesRoutes from './messages.js';
import cronRoutes from './cron.js';
import featureFlagsAdminRoutes from './feature-flags.js';
import siteDataRoutes from './site-data.js';
import scheduleRoutes from './schedule.js';
import termsRoutes from './terms.js';
import categoriesRoutes from './categories.js';
import ordersRoutes from './orders.js';
import galleryCategoriesRouter from './gallery-categories.js';
import galleryItemsRouter from './gallery-items.js';
import brandsRouter from './brands.js';
import challengesRouter from './challenges.js';
import heroRouter from './hero.js';
import dataRouter from './data.js';
import monitorRouter from './monitor.js';
import workersRouter from './workers.js';
import toolsRouter from './tools.js';
import fixedExpensesRouter from './fixed-expenses.js';
import walletRouter from './wallet.js';
import profileRoutes from './profile.js';
import siteImagesRoutes from './site-images.js';
import sensitiveConfigRoutes from './sensitive-config.js';
import notificationsRoutes from './notifications.js';

const router = Router()

router.use('/auth', authRoutes)
router.use('/dashboard', dashboardRoutes);
router.use('/systeme-health', systemeHealthRoutes);
router.use('/secret-codes', secretCodeRoutes);
router.use('/bookings', bookingRoutes)
router.use('/events', eventRoutes)
router.use('/products', productRoutes)
router.use('/settings', settingsRoutes)
router.use('/health', healthRouter)
router.use('/services', servicesRouter)
router.use('/settings', adminSettingsRoutes);
router.use('/goals', goalsAdminRoutes);
router.use('/key-figures', keyFiguresAdminRoutes);
router.use('/why-choose-us', whyChooseUsAdminRoutes);
router.use('/about', aboutAdminRoutes);
router.use('/translate', translateRoutes);
router.use('/cloudinary', cloudinaryRoutes);
router.use('/upload', uploadRoutes);
router.use('/service-types', serviceTypesRoutes);
router.use('/contact-info', contactInfoRoutes);
router.use('/contact-subjects', contactSubjectsRoutes);
router.use('/faq', faqRoutes);
router.use('/newsletter', newsletterRoutes);
router.use('/messages', messagesRoutes);
router.use('/cron', cronRoutes);
router.use('/feature-flags', featureFlagsAdminRoutes);
router.use('/site-data', siteDataRoutes);
router.use('/schedule', scheduleRoutes);
router.use('/terms', termsRoutes);
router.use('/categories', categoriesRoutes);
router.use('/orders', ordersRoutes);
router.use('/monitor', monitorRouter);
router.use('/brands', brandsRouter);
router.use('/challenges', challengesRouter);
router.use('/hero', heroRouter);
router.use('/data', dataRouter);
router.use('/workers', workersRouter);
router.use('/tools', toolsRouter);
router.use('/fixed-expenses', fixedExpensesRouter);
router.use('/wallet', walletRouter);
router.use('/gallery/categories', galleryCategoriesRouter);
router.use('/gallery/items', galleryItemsRouter);
router.use('/profile', profileRoutes);
router.use('/site-images', siteImagesRoutes);
router.use('/sensitive-config', sensitiveConfigRoutes);
router.use('/notifications', notificationsRoutes);
export { router as adminRoutes }