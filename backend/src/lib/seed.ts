import { supabase } from './supabase.js';
import { encrypt } from './encryption.js';
import { hashPassword } from '../services/auth-service.js'; 

// ════════════ 1. AdminSchedule — 7 days, Sunday = 1 ════════════
const SCHEDULE_DAYS = [
  { day_number: 1, day_name_fr: 'Dimanche', day_name_ar: 'الأحد' },
  { day_number: 2, day_name_fr: 'Lundi',    day_name_ar: 'الاثنين' },
  { day_number: 3, day_name_fr: 'Mardi',    day_name_ar: 'الثلاثاء' },
  { day_number: 4, day_name_fr: 'Mercredi', day_name_ar: 'الأربعاء' },
  { day_number: 5, day_name_fr: 'Jeudi',    day_name_ar: 'الخميس' },
  { day_number: 6, day_name_fr: 'Vendredi', day_name_ar: 'الجمعة' },
  { day_number: 7, day_name_fr: 'Samedi',   day_name_ar: 'السبت' },
];
async function seedAdminSchedule() {
  for (const d of SCHEDULE_DAYS) {
    const { data } = await supabase.from('AdminSchedule').select('id').eq('day_number', d.day_number).maybeSingle();
    if (!data) await supabase.from('AdminSchedule').insert({
      ...d, work_parts_count: 0,
      part1_start: null, part1_end: null, part2_start: null, part2_end: null, part3_start: null, part3_end: null,
    });
  }
  console.log('✅ AdminSchedule');
}

// ════════════ 2. AdminSettings ════════════
async function seedAdminSettings() {
  const { data } = await supabase.from('AdminSettings').select('id').limit(1).maybeSingle();
  if (!data) await supabase.from('AdminSettings').insert({ lock_enabled: false });
  console.log('✅ AdminSettings');
}

// ════════════ 3. ContactSubject — "Autre" (active) ════════════
async function seedContactSubject() {
  const { data } = await supabase.from('ContactSubject').select('id').eq('is_other', true).maybeSingle();
  if (!data) await supabase.from('ContactSubject').insert({
    title_fr: 'Autre', title_ar: 'أخرى', order_index: 99, is_other: true, is_active: true,
  });
  console.log('✅ ContactSubject');
}

// ════════════ 4. ContactInfo ════════════
async function seedContactInfo() {
  const { data } = await supabase.from('ContactInfo').select('id').limit(1).maybeSingle();
  if (!data) await supabase.from('ContactInfo').insert({
    address: '', email: '', phone: '', latitude: null, longitude: null, map_zoom: 12, social_links: [],
  });
  console.log('✅ ContactInfo');
}

// ════════════ 5. CronSetting — cal-sync ════════════
async function seedCronSetting() {
  const { data } = await supabase.from('CronSetting').select('name').eq('name', 'cal-sync').maybeSingle();
  if (!data) await supabase.from('CronSetting').insert({ name: 'cal-sync', enabled: false });
  console.log('✅ CronSetting');
}

// ════════════ 6. FeatureFlags — all enabled ════════════
const FLAGS = ['bookingpanel', 'brands', 'challenge', 'events', 'faq', 'goals', 'products', 'reviews'];
async function seedFeatureFlags() {
  for (const f of FLAGS) {
    const { data } = await supabase.from('FeatureFlag').select('feature_name').eq('feature_name', f).maybeSingle();
    if (!data) await supabase.from('FeatureFlag').insert({ feature_name: f, is_enabled: true });
  }
  console.log('✅ FeatureFlags');
}

// ════════════ 7. GalleryCategory — all + latest (no image) ════════════
async function seedGalleryCategories() {
  const rows = [
    { name_fr: 'Tout',    name_ar: 'الكل',    slug: 'all',    order_index: 0, description_fr: '', description_ar: '' },
    { name_fr: 'Récents', name_ar: 'الأحدث', slug: 'latest', order_index: 1, description_fr: '', description_ar: '' },
  ];
  for (const r of rows) {
    const { data } = await supabase.from('GalleryCategory').select('id').eq('slug', r.slug).maybeSingle();
    if (!data) await supabase.from('GalleryCategory').insert({ ...r, is_active: true, image_url: null, image_public_id: null });
  }
  console.log('✅ GalleryCategory');
}

// ════════════ 8. ProductCategory — 6 standard (incl. packages) ════════════
const PRODUCT_CATS = [
  { name_fr: 'Tout',        name_ar: 'الكل',           slug: 'all',         order_index: 0, description_fr: '', description_ar: '' },
  { name_fr: 'Top ventes',  name_ar: 'الأكثر مبيعاً',   slug: 'top-selling', order_index: 1, description_fr: '', description_ar: '' },
  { name_fr: 'Nouveautés',  name_ar: 'الجديد',         slug: 'new',         order_index: 2, description_fr: 'Nouveautés fraîchement arrivées', description_ar: 'وصل حديثاً' },
  { name_fr: 'Recommandés', name_ar: 'موصى به',        slug: 'recommended', order_index: 3, description_fr: 'Nos recommandations spéciales', description_ar: 'توصياتنا المميزة' },
  { name_fr: 'Promos',      name_ar: 'خصومات',         slug: 'discount',    order_index: 4, description_fr: 'Produits en promotion', description_ar: 'تخفيضات' },
  { name_fr: 'Packs',       name_ar: 'حزم',            slug: 'packages',    order_index: 5, description_fr: '', description_ar: '' },
];
async function seedProductCategories() {
  for (const c of PRODUCT_CATS) {
    const { data } = await supabase.from('ProductCategory').select('id').eq('slug', c.slug).maybeSingle();
    if (!data) await supabase.from('ProductCategory').insert({
      ...c, parent_id: null, image_url: null, image_public_id: null, is_active: true,
    });
  }
  console.log('✅ ProductCategory');
}

// ════════════ 9. SecretCode — lock_delete (encrypted, from env) ════════════
async function seedSecretCode() {
  const raw = process.env.DEFAULT_DELETE_CODE;
  if (!raw) { console.warn('⚠️  DEFAULT_DELETE_CODE not set — skipping lock_delete seed'); return; }
  const { data } = await supabase.from('SecretCode').select('purpose').eq('purpose', 'lock_delete').maybeSingle();
  if (!data) await supabase.from('SecretCode').insert({ purpose: 'lock_delete', code: encrypt(raw) });
  console.log('✅ SecretCode');
}

// ════════════ 10. ServiceType — "Autre" ════════════
async function seedServiceType() {
  const { data } = await supabase.from('ServiceType').select('id').eq('is_other', true).maybeSingle();
  if (!data) await supabase.from('ServiceType').insert({
    name_fr: 'Autre', name_ar: 'أخرى', calcom_slug: 'other', is_other: true, is_active: true,
    duration_minutes: 60, order: 0, requires_confirmation: false,
  });
  console.log('✅ ServiceType');
}

// ════════════ 11. SiteData ════════════
async function seedSiteData() {
  const { data } = await supabase.from('SiteData').select('id').limit(1).maybeSingle();
  if (!data) await supabase.from('SiteData').insert({
    name_fr: 'Kafela', name_ar: 'كافيلا', slogans_fr: [], slogans_ar: [],
    logo_url: null, favicon_url: null, logo_public_id: null, favicon_public_id: null,
  });
  console.log('✅ SiteData');
}

// ════════════ 12. SiteImages — exact set ════════════
const SITE_IMAGES = [
  { name: 'hero_fallback_1',  image_url: 'https://images.unsplash.com/photo-1519340241574-2dec65d0d0a5?w=800', alt_fr: 'Enfant nageant',           alt_ar: 'طفل يسبح' },
  { name: 'middle_1',         image_url: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600', alt_fr: 'Enfants qui jouent',        alt_ar: 'أطفال يلعبون' },
  { name: 'middle_2',         image_url: 'https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=600', alt_fr: 'Enfants lisent',            alt_ar: 'أطفال يقرؤون' },
  { name: 'booking',          image_url: 'https://res.cloudinary.com/du0frvxjo/image/upload/v1785689373/admin/xm9kvecarumfookojsx8.jpg', alt_fr: 'Illustration réservation', alt_ar: 'رسم توضيحي للحجز', image_public_id: 'admin/xm9kvecarumfookojsx8' },
  { name: 'hero_fallback_2',  image_url: 'https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=400', alt_fr: 'Enfant jouant aux échecs',  alt_ar: 'طفل يلعب شطرنج' },
  { name: 'middle_3',         image_url: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600', alt_fr: 'Activité créative',         alt_ar: 'نشاط إبداعي' },
  { name: 'middle_purple_bg', image_url: null, alt_fr: 'Fond violet', alt_ar: 'خلفية بنفسجية' },
];
async function seedSiteImages() {
  for (const img of SITE_IMAGES) {
    const { data } = await supabase.from('SiteImages').select('name').eq('name', img.name).maybeSingle();
    if (!data) await supabase.from('SiteImages').insert(img);
  }
  console.log('✅ SiteImages');
}

// ════════════ 13. TermsContent — privacy / conditions / terms ════════════
const TERMS = [
  { tab: 'privacy',
    content_fr: "<h2>Politique de confidentialité</h2><p>Kafela respecte votre vie privée. Nous collectons uniquement les données nécessaires au traitement de vos réservations et ne les partageons jamais avec des tiers.</p><h2>Cookies</h2><p>Notre site utilise des cookies pour améliorer votre expérience. Vous pouvez les désactiver dans les paramètres de votre navigateur.</p>",
    content_ar: "<h2>سياسة الخصوصية</h2><p>كافيلا تحترم خصوصيتك. نجمع فقط البيانات الضرورية لمعالجة حجوزاتك ولا نشاركها أبدًا مع أطراف ثالثة.</p><h2>ملفات تعريف الارتباط</h2><p>يستخدم موقعنا ملفات تعريف الارتباط لتحسين تجربتك. يمكنك تعطيلها في إعدادات متصفحك.</p>" },
  { tab: 'conditions',
    content_fr: "<h2>Conditions générales</h2><p>Les inscriptions sont définitives après paiement. En cas d'annulation plus de 24h à l'avance, un remboursement intégral est proposé. Au‑delà, des frais peuvent s'appliquer.</p><h2>Responsabilité</h2><p>Kafela décline toute responsabilité en cas de perte ou de vol d'objets personnels pendant les activités.</p>",
    content_ar: "<h2>الأحكام العامة</h2><p>التسجيلات نهائية بعد الدفع. في حالة الإلغاء قبل أكثر من 24 ساعة، يتم استرداد المبلغ بالكامل. بعد ذلك، قد تُطبق رسوم.</p><h2>المسؤولية</h2><p>كافيلا غير مسؤولة عن فقدان أو سرقة الممتلكات الشخصية أثناء الأنشطة.</p>" },
  { tab: 'terms',
    content_fr: "<h2>Conditions d'utilisation</h2><p>Bienvenue chez Kafela. En utilisant notre site, vous acceptez les présentes conditions. Nous nous réservons le droit de les modifier à tout moment.</p><h2>Services</h2><p>Nous proposons des activités parascolaires encadrées par des professionnels. Les descriptions et prix sont indicatifs et peuvent changer sans préavis.</p>",
    content_ar: "<h1>شروط الاستخدام</h1><h2>مرحبًا بكم في كافيلا. باستخدام موقعنا، فإنكم توافقون على هذه الشروط. نحتفظ بالحق في تعديلها في أي وقت.</h2><h1>الخدمات</h1><h2>نقدم أنشطة بعد المدرسة يشرف عليها محترفون. الأوصاف والأسعار استرشادية وقد تتغير دون إشعار.</h2>" },
];
async function seedTermsContent() {
  for (const t of TERMS) {
    const { data } = await supabase.from('TermsContent').select('id').eq('tab', t.tab).maybeSingle();
    if (!data) await supabase.from('TermsContent').insert(t);
  }
  console.log('✅ TermsContent');
}

// ════════════ 14. Challenge ════════════
async function seedChallenge() {
  const { data } = await supabase.from('Challenge').select('id').limit(1).maybeSingle();
  if (!data) await supabase.from('Challenge').insert({ title_fr: '', title_ar: '', html_code: '', is_active: false });
  console.log('✅ Challenge');
}

// ════════════ 15. AboutContent ════════════
async function seedAboutContent() {
  const { data } = await supabase.from('AboutContent').select('id').limit(1).maybeSingle();
  if (!data) await supabase.from('AboutContent').insert({
    content_fr: '', content_ar: '', summary_fr: '', summary_ar: '', image_url: null, image_public_id: null,
  });
  console.log('✅ AboutContent');
}

// ════════════ 16. Default admin user ════════════
async function seedDefaultAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) { console.warn('⚠️  ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping admin seed'); return; }

  const { data: admins } = await supabase.from('User').select('id').eq('role', 'ADMIN').limit(1);
  if (admins && admins.length > 0) { console.log('✅ Admin already exists'); return; }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  const { data: existing } = await supabase.from('User').select('id').eq('email', email).maybeSingle();
  if (existing) {
    await supabase.from('User').update({ role: 'ADMIN', passwordHash, updatedAt: now, passwordChangedAt: now }).eq('email', email);
    console.log(`✅ Upgraded ${email} to ADMIN`);
  } else {
    await supabase.from('User').insert({
      email, passwordHash, role: 'ADMIN', twoFactorEnabled: false, fullName: 'Administrator',
      createdAt: now, updatedAt: now, passwordChangedAt: now,
    });
    console.log(`✅ Default admin created: ${email}`);
  }
}

// ════════════ 17. UserSettings — for the admin (runs AFTER admin exists) ════════════
async function seedUserSettings() {
  const { data: admin } = await supabase.from('User').select('id').eq('role', 'ADMIN').limit(1).maybeSingle();
  if (!admin) { console.warn('⚠️  No admin found — skipping UserSettings seed'); return; }

  const { data } = await supabase.from('UserSettings').select('id').eq('user_id', admin.id).maybeSingle();
  if (!data) await supabase.from('UserSettings').insert({ user_id: admin.id, weather_mode: 'ip', weather_geo: null });
  console.log('✅ UserSettings');
}
// ════════════ 18. WalletSummary — zero-balance singleton ════════════
async function seedWalletSummary() {
  const { data } = await supabase.from('WalletSummary').select('id').eq('id', 1).maybeSingle();
  if (!data) await supabase.from('WalletSummary').insert({ id: 1, balance: 0, totalIncome: 0 });
  console.log('✅ WalletSummary');
}
// ════════════ Run all 17 ════════════
export async function runSeeds() {
  await seedDefaultAdmin();      // must be first (UserSettings needs the admin id)
  await seedUserSettings();
  await seedAdminSettings();
  await seedWalletSummary();
  await seedAdminSchedule();
  await seedContactSubject();
  await seedContactInfo();
  await seedCronSetting();
  await seedFeatureFlags();
  await seedGalleryCategories();
  await seedProductCategories();
  await seedSecretCode();
  await seedServiceType();
  await seedSiteData();
  await seedSiteImages();
  await seedTermsContent();
  await seedChallenge();
  await seedAboutContent();
  console.log('🌱 All 17 seeds verified');
}