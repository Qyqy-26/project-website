const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const cookieParser = require('cookie-parser');

const db = require('./lib/db');
const { APP, CATEGORIES, PACKAGES, TIME_SLOTS, PAYMENT_METHODS, PAYMENT_GROUP_LABEL, calcPricing } = require('./lib/constants');
const h = require('./lib/helpers');
const { hashPassword, verifyPassword } = require('./lib/security');
const { createSession, destroySession, loadUser, requireAuth, requireAdmin, requireGuest } = require('./lib/auth');
const ordersLib = require('./lib/orders');
const { createPaymentIntent, buildQrSvg, activeProvider } = require('./lib/payments');
const { streamInvoicePdf } = require('./lib/invoice');
const reports = require('./lib/reports');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'cendekia-dev-secret';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(express.static(path.join(__dirname, 'public'), { maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0 }));
app.use(express.urlencoded({ extended: true, limit: '120kb' }));
app.use(cookieParser(SESSION_SECRET));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(loadUser);

app.use((req, res, next) => {
  res.locals.app = APP;
  res.locals.categories = CATEGORIES;
  res.locals.packages = PACKAGES;
  res.locals.timeSlots = TIME_SLOTS;
  res.locals.statusMeta = h.statusMeta;
  res.locals.formatRupiah = h.formatRupiah;
  res.locals.formatNumber = h.formatNumber;
  res.locals.formatRupiahShort = h.formatRupiahShort;
  res.locals.formatDateID = h.formatDateID;
  res.locals.formatDateTimeID = h.formatDateTimeID;
  res.locals.categoryBy = h.categoryBy;
  res.locals.paymentMethodBy = h.paymentMethodBy;
  res.locals.modeLabel = h.modeLabel;
  res.locals.initials = h.initials;
  res.locals.parseHighlights = h.parseHighlights;
  res.locals.greeting = h.greeting;
  res.locals.sessionLabel = h.sessionLabel;
  res.locals.icon = h.icon;
  res.locals.todayISO = h.todayISO;
  res.locals.minBookingDate = h.addDays(h.todayISO(), 1);
  res.locals.reqPath = req.path;
  res.locals.currentYear = new Date().getFullYear();
  res.locals.flash = null;
  res.locals.activeProvider = activeProvider;
  res.locals.paymentGroupLabel = PAYMENT_GROUP_LABEL;

  const flash = req.signedCookies.flash;
  if (flash) {
    try {
      res.locals.flash = JSON.parse(flash);
    } catch {
      res.locals.flash = null;
    }
    res.clearCookie('flash', { path: '/' });
  }
  res.flash = (type, message) => {
    res.cookie('flash', JSON.stringify({ type, message }), {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 1000,
      path: '/',
    });
  };
  next();
});

db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());

const PROGRAM_SELECT = `
  SELECT p.*, t.name AS tutor_name, t.title AS tutor_title, t.accent AS tutor_accent,
         t.rating AS tutor_rating, t.students AS tutor_students, t.badge AS tutor_badge, t.bio AS tutor_bio
  FROM programs p
  LEFT JOIN tutors t ON t.id = p.tutor_id
`;

function safeNext(value, fallback) {
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) return value;
  return fallback;
}

function homeFor(user) {
  return user && user.role === 'admin' ? '/admin' : '/dashboard';
}

function canAccessOrder(user, order) {
  return Boolean(user && (user.role === 'admin' || order.user_id === user.id));
}

function nextOrderCode() {
  const now = new Date();
  const prefix = `K4-${String(now.getFullYear()).slice(2)}${h.pad2(now.getMonth() + 1)}${h.pad2(now.getDate())}-`;
  for (let i = 0; i < 8; i += 1) {
    const code = `${prefix}${String(crypto.randomInt(0, 10000)).padStart(4, '0')}`;
    const exists = db.prepare('SELECT 1 FROM orders WHERE code = ?').get(code);
    if (!exists) return code;
  }
  return `${prefix}${Date.now().toString().slice(-6)}`;
}

function nextInvoiceNo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = h.pad2(now.getMonth() + 1);
  const prefix = `INV/${y}/${m}/`;
  const row = db
    .prepare("SELECT MAX(CAST(substr(invoice_no, -4) AS INTEGER)) AS maxSeq FROM orders WHERE invoice_no LIKE ?")
    .get(`${prefix}%`);
  return `${prefix}${String((row.maxSeq || 0) + 1).padStart(4, '0')}`;
}

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return [h.toISODate(start), h.toISODate(end)];
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

function uniqueSlug(base, excludeId = null) {
  let slug = base || 'program';
  let n = 2;
  while (true) {
    const row = excludeId
      ? db.prepare('SELECT id FROM programs WHERE slug = ? AND id != ?').get(slug, excludeId)
      : db.prepare('SELECT id FROM programs WHERE slug = ?').get(slug);
    if (!row) return slug;
    slug = `${base}-${n}`;
    n += 1;
  }
}

/* ------------------------------- Publik ------------------------------- */

app.get('/', (req, res) => {
  const featured = db
    .prepare(`${PROGRAM_SELECT} WHERE p.active = 1 AND p.featured = 1 ORDER BY p.rating DESC LIMIT 3`)
    .all();
  const tutorList = db.prepare('SELECT * FROM tutors WHERE active = 1 ORDER BY rating DESC, students DESC LIMIT 4').all();
  const counts = db
    .prepare('SELECT category, COUNT(*) AS total FROM programs WHERE active = 1 GROUP BY category')
    .all();
  const categoryCount = Object.fromEntries(counts.map((row) => [row.category, row.total]));
  const totalStudents = db.prepare('SELECT COALESCE(SUM(students), 0) AS total FROM programs WHERE active = 1').get().total;
  const totalPrograms = db.prepare('SELECT COUNT(*) AS total FROM programs WHERE active = 1').get().total;
  const totalTutors = db.prepare('SELECT COUNT(*) AS total FROM tutors WHERE active = 1').get().total;
  const completedOrders = db.prepare("SELECT COUNT(*) AS total FROM orders WHERE status IN ('paid','completed')").get().total;

  res.render('public/home', {
    title: 'Les Privat & Kursus Online untuk Semua Usia',
    bodyClass: 'page-home',
    featured,
    tutorList,
    categoryCount,
    stats: {
      students: totalStudents,
      programs: totalPrograms,
      tutors: totalTutors,
      orders: completedOrders,
    },
  });
});

app.get('/program', (req, res) => {
  const { q = '', kategori = 'all', mode = 'all' } = req.query;
  const conditions = ['p.active = 1'];
  const params = [];
  if (CATEGORIES.some((c) => c.slug === kategori)) {
    conditions.push('p.category = ?');
    params.push(kategori);
  }
  if (mode === 'online' || mode === 'hybrid') {
    conditions.push('p.mode = ?');
    params.push(mode);
  }
  if (q.trim()) {
    conditions.push('(p.title LIKE ? OR p.description LIKE ? OR t.name LIKE ?)');
    const needle = `%${q.trim()}%`;
    params.push(needle, needle, needle);
  }
  const list = db
    .prepare(`${PROGRAM_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY p.featured DESC, p.rating DESC, p.students DESC`)
    .all(...params);
  const counts = db
    .prepare('SELECT category, COUNT(*) AS total FROM programs WHERE active = 1 GROUP BY category')
    .all();
  const categoryCount = Object.fromEntries(counts.map((row) => [row.category, row.total]));
  const grandTotal = counts.reduce((sum, row) => sum + row.total, 0);

  res.render('public/programs', {
    title: 'Katalog Program',
    bodyClass: 'page-catalog',
    programs: list,
    q,
    activeCategory: CATEGORIES.some((c) => c.slug === kategori) ? kategori : 'all',
    activeMode: mode === 'online' || mode === 'hybrid' ? mode : 'all',
    categoryCount,
    grandTotal,
  });
});

app.get('/program/:slug', (req, res, next) => {
  const program = db.prepare(`${PROGRAM_SELECT} WHERE p.slug = ? AND p.active = 1`).get(req.params.slug);
  if (!program) return next();
  const related = db
    .prepare(`${PROGRAM_SELECT} WHERE p.active = 1 AND p.category = ? AND p.id != ? ORDER BY p.rating DESC LIMIT 3`)
    .all(program.category, program.id);
  const pricing = Object.fromEntries(PACKAGES.map((pkg) => [pkg.sessions, calcPricing(program.price, pkg.sessions)]));
  res.render('public/program-detail', {
    title: program.title,
    bodyClass: 'page-program',
    program,
    related,
    pricing,
    highlights: h.parseHighlights(program.highlights),
  });
});

app.get('/tutor', (req, res) => {
  const tutors = db
    .prepare(
      `SELECT t.*, COUNT(p.id) AS program_count
       FROM tutors t LEFT JOIN programs p ON p.tutor_id = t.id AND p.active = 1
       WHERE t.active = 1 GROUP BY t.id ORDER BY t.rating DESC, t.students DESC`
    )
    .all();
  res.render('public/tutors', { title: 'Tutor Kami', bodyClass: 'page-tutors', tutors });
});

/* -------------------------------- Auth -------------------------------- */

app.get('/masuk', requireGuest, (req, res) => {
  res.render('auth/login', {
    title: 'Masuk',
    bodyClass: 'page-auth',
    next: safeNext(req.query.next, ''),
    email: '',
  });
});

app.post('/masuk', requireGuest, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const next = safeNext(req.body.next, '');
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
  if (!user || !verifyPassword(password, user.password)) {
    res.flash('error', 'Email atau kata sandi tidak cocok. Silakan coba lagi.');
    return res.redirect(`/masuk${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  }
  createSession(user.id, res);
  res.flash('success', `Selamat datang kembali, ${user.name.split(' ')[0]}!`);
  return res.redirect(next || homeFor(user));
});

app.get('/daftar', requireGuest, (req, res) => {
  res.render('auth/register', {
    title: 'Buat Akun',
    bodyClass: 'page-auth',
    next: safeNext(req.query.next, ''),
    values: { name: '', email: '', phone: '' },
  });
});

app.post('/daftar', requireGuest, (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();
  const password = String(req.body.password || '');
  const next = safeNext(req.body.next, '');
  const values = { name, email, phone };

  if (name.length < 2) {
    res.flash('error', 'Nama minimal 2 karakter.');
    return res.redirect('/daftar');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.flash('error', 'Format email belum valid.');
    return res.redirect('/daftar');
  }
  if (password.length < 6) {
    res.flash('error', 'Kata sandi minimal 6 karakter.');
    return res.redirect('/daftar');
  }
  const exists = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
  if (exists) {
    res.flash('error', 'Email tersebut sudah terdaftar. Silakan masuk.');
    return res.redirect('/masuk');
  }

  const result = db
    .prepare('INSERT INTO users (name, email, password, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, email, hashPassword(password), 'user', phone || null, new Date().toISOString());
  createSession(Number(result.lastInsertRowid), res);
  res.flash('success', 'Akun berhasil dibuat. Selamat belajar!');
  return res.redirect(next || '/dashboard');
});

app.post('/keluar', (req, res) => {
  destroySession(req, res);
  res.flash('success', 'Kamu sudah keluar dari akun.');
  res.redirect('/');
});

/* ------------------------------ Dashboard ----------------------------- */

app.get('/dashboard', requireAuth, (req, res) => {
  const stats = db
    .prepare(
      `SELECT
        COUNT(*) AS total_orders,
        COALESCE(SUM(CASE WHEN status IN ('paid','completed') THEN total ELSE 0 END), 0) AS spent,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) AS active
       FROM orders WHERE user_id = ?`
    )
    .get(req.user.id);
  const upcoming = ordersLib.getUpcomingSessions(req.user.id, 3);
  const pendingOrders = db
    .prepare(
      `SELECT o.*, p.title AS program_title, p.category
       FROM orders o JOIN programs p ON p.id = o.program_id
       WHERE o.user_id = ? AND o.status = 'pending' ORDER BY o.created_at DESC LIMIT 3`
    )
    .all(req.user.id);
  const recentOrders = db
    .prepare(
      `SELECT o.*, p.title AS program_title, p.category
       FROM orders o JOIN programs p ON p.id = o.program_id
       WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 5`
    )
    .all(req.user.id);
  const completedSessions = db
    .prepare(
      `SELECT COUNT(*) AS total FROM order_sessions s JOIN orders o ON o.id = s.order_id
       WHERE o.user_id = ? AND s.status = 'done'`
    )
    .get(req.user.id).total;
  const upcomingCount = db
    .prepare(
      `SELECT COUNT(*) AS total FROM order_sessions s JOIN orders o ON o.id = s.order_id
       WHERE o.user_id = ? AND s.status = 'scheduled' AND s.date >= date('now','localtime')`
    )
    .get(req.user.id).total;

  res.render('user/dashboard', {
    title: 'Ringkasan',
    bodyClass: 'page-dash',
    area: 'user',
    active: 'overview',
    stats,
    upcoming,
    pendingOrders,
    recentOrders,
    completedSessions,
    upcomingCount,
  });
});

app.get('/dashboard/pesanan', requireAuth, (req, res) => {
  const validStatuses = ['all', 'pending', 'paid', 'completed', 'cancelled'];
  const status = validStatuses.includes(req.query.status) ? req.query.status : 'all';
  const params = [req.user.id];
  let sql = `SELECT o.*, p.title AS program_title, p.category, p.mode, t.name AS tutor_name
             FROM orders o JOIN programs p ON p.id = o.program_id
             LEFT JOIN tutors t ON t.id = o.tutor_id
             WHERE o.user_id = ?`;
  if (status !== 'all') {
    sql += ' AND o.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY o.created_at DESC';
  const list = db.prepare(sql).all(...params);
  const counts = db
    .prepare(
      `SELECT status, COUNT(*) AS total FROM orders WHERE user_id = ? GROUP BY status`
    )
    .all(req.user.id);
  const countMap = { all: counts.reduce((sum, row) => sum + row.total, 0) };
  for (const row of counts) countMap[row.status] = row.total;

  res.render('user/orders', {
    title: 'Pesanan Saya',
    bodyClass: 'page-dash',
    area: 'user',
    active: 'orders',
    orders: list,
    status,
    countMap,
  });
});

app.get('/dashboard/pesanan/:code', requireAuth, (req, res, next) => {
  const order = ordersLib.getOrderByCode(req.params.code);
  if (!order || !canAccessOrder(req.user, order)) return next();
  const sessions = ordersLib.getOrderSessions(order.id);
  const payment = ordersLib.latestPaymentForOrder(order.id);
  res.render('user/order-detail', {
    title: `Pesanan ${order.code}`,
    bodyClass: 'page-dash',
    area: 'user',
    active: 'orders',
    order,
    sessions,
    payment,
    justCreated: req.query.created === '1',
  });
});

app.get('/dashboard/pesanan/:code/invoice', requireAuth, (req, res, next) => {
  const order = ordersLib.getOrderByCode(req.params.code);
  if (!order || !canAccessOrder(req.user, order)) return next();
  streamInvoicePdf(res, order, { download: req.query.download === '1' });
});

app.get('/dashboard/jadwal', requireAuth, (req, res) => {
  const upcoming = db
    .prepare(
      `SELECT s.*, o.code, o.status AS order_status, p.title AS program_title, p.category, p.mode, t.name AS tutor_name
       FROM order_sessions s
       JOIN orders o ON o.id = s.order_id
       JOIN programs p ON p.id = o.program_id
       LEFT JOIN tutors t ON t.id = o.tutor_id
       WHERE o.user_id = ? AND s.status = 'scheduled' AND s.date >= date('now','localtime')
       ORDER BY s.date ASC, s.time_slot ASC LIMIT 50`
    )
    .all(req.user.id);
  const past = db
    .prepare(
      `SELECT s.*, o.code, p.title AS program_title, p.category, t.name AS tutor_name
       FROM order_sessions s
       JOIN orders o ON o.id = s.order_id
       JOIN programs p ON p.id = o.program_id
       LEFT JOIN tutors t ON t.id = o.tutor_id
       WHERE o.user_id = ? AND (s.status = 'done' OR s.date < date('now','localtime'))
       ORDER BY s.date DESC LIMIT 20`
    )
    .all(req.user.id);
  res.render('user/schedule', {
    title: 'Jadwal Belajar',
    bodyClass: 'page-dash',
    area: 'user',
    active: 'schedule',
    upcoming,
    past,
  });
});

app.get('/dashboard/profil', requireAuth, (req, res) => {
  const stats = db
    .prepare(
      `SELECT COUNT(*) AS total_orders,
              COALESCE(SUM(CASE WHEN status IN ('paid','completed') THEN total ELSE 0 END), 0) AS spent
       FROM orders WHERE user_id = ?`
    )
    .get(req.user.id);
  res.render('user/profile', {
    title: 'Profil Saya',
    bodyClass: 'page-dash',
    area: 'user',
    active: 'profile',
    stats,
  });
});

app.post('/dashboard/profil', requireAuth, (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').trim();
  if (name.length < 2 || name.length > 80) {
    res.flash('error', 'Nama harus terdiri dari 2–80 karakter.');
    return res.redirect('/dashboard/profil');
  }
  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone || null, req.user.id);
  res.flash('success', 'Profil berhasil diperbarui.');
  res.redirect('/dashboard/profil');
});

app.post('/dashboard/profil/password', requireAuth, (req, res) => {
  const current = String(req.body.current_password || '');
  const next = String(req.body.new_password || '');
  if (next.length < 6) {
    res.flash('error', 'Kata sandi baru minimal 6 karakter.');
    return res.redirect('/dashboard/profil');
  }
  const row = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(current, row.password)) {
    res.flash('error', 'Kata sandi saat ini tidak cocok.');
    return res.redirect('/dashboard/profil');
  }
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashPassword(next), req.user.id);
  res.flash('success', 'Kata sandi berhasil diubah.');
  res.redirect('/dashboard/profil');
});

/* ---------------------------- Pemesanan user --------------------------- */

app.post('/pesan', requireAuth, (req, res) => {
  const program = db.prepare(`${PROGRAM_SELECT} WHERE p.slug = ? AND p.active = 1`).get(req.body.program_slug);
  if (!program) {
    res.flash('error', 'Program tidak ditemukan atau sudah tidak tersedia.');
    return res.redirect('/program');
  }
  const sessions = Number(req.body.sessions);
  const startDate = String(req.body.start_date || '');
  const timeSlot = String(req.body.time_slot || '');
  const notes = String(req.body.notes || '').trim().slice(0, 500);
  const pkg = PACKAGES.find((p) => p.sessions === sessions);

  if (!pkg) {
    res.flash('error', 'Paket sesi tidak valid.');
    return res.redirect(`/program/${program.slug}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate < h.todayISO()) {
    res.flash('error', 'Pilih tanggal mulai yang valid (hari ini atau setelahnya).');
    return res.redirect(`/program/${program.slug}`);
  }
  if (!TIME_SLOTS.includes(timeSlot)) {
    res.flash('error', 'Pilih jam belajar yang tersedia.');
    return res.redirect(`/program/${program.slug}`);
  }

  const pricing = calcPricing(program.price, sessions);
  const now = new Date().toISOString();
  const code = nextOrderCode();
  const invoiceNo = nextInvoiceNo();
  const result = db
    .prepare(
      `INSERT INTO orders (code, invoice_no, user_id, program_id, tutor_id, sessions, price, subtotal, discount, fee, total,
        status, method, payment_ref, start_date, time_slot, notes, paid_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, ?, NULL, ?, ?)`
    )
    .run(
      code,
      invoiceNo,
      req.user.id,
      program.id,
      program.tutor_id,
      pricing.sessions,
      program.price,
      pricing.subtotal,
      pricing.discount,
      pricing.fee,
      pricing.total,
      startDate,
      timeSlot,
      notes || null,
      now,
      now
    );

  res.flash('success', 'Pesanan berhasil dibuat. Selesaikan pembayaran untuk mengunci jadwal.');
  res.redirect(`/dashboard/pesanan/${code}?created=1`);
});

/* ------------------------------- Payment ------------------------------ */

app.get('/pembayaran/:code', requireAuth, async (req, res, next) => {
  const order = ordersLib.getOrderByCode(req.params.code);
  if (!order || !canAccessOrder(req.user, order)) return next();
  if (order.status === 'paid' || order.status === 'completed') {
    return res.redirect(`/pembayaran/${order.code}/sukses`);
  }
  const payment = ordersLib.latestPaymentForOrder(order.id);
  const activePayment = payment && payment.status === 'pending' ? payment : null;
  const qrSvg = activePayment && activePayment.method === 'qris' ? await buildQrSvg(activePayment.qr_payload) : null;
  res.render('user/payment', {
    title: 'Pembayaran',
    bodyClass: 'page-dash',
    area: 'user',
    active: 'orders',
    order,
    payment: activePayment,
    methods: PAYMENT_METHODS,
    qrSvg,
  });
});

app.post('/pembayaran/:code', requireAuth, async (req, res, next) => {
  const order = ordersLib.getOrderByCode(req.params.code);
  if (!order || !canAccessOrder(req.user, order)) return next();
  if (order.status !== 'pending') {
    res.flash('error', 'Pesanan ini tidak menunggu pembayaran.');
    return res.redirect(`/dashboard/pesanan/${order.code}`);
  }
  const methodId = String(req.body.method || '');
  if (!PAYMENT_METHODS.some((m) => m.id === methodId)) {
    res.flash('error', 'Pilih metode pembayaran yang tersedia.');
    return res.redirect(`/pembayaran/${order.code}`);
  }
  db.prepare("UPDATE payments SET status = 'expired' WHERE order_id = ? AND status = 'pending'").run(order.id);
  const intent = createPaymentIntent(order, methodId);
  db.prepare(
    `INSERT INTO payments (order_id, ref, provider, method, amount, status, va_number, qr_payload, created_at, paid_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL)`
  ).run(order.id, intent.ref, intent.provider, intent.method, intent.amount, intent.vaNumber, intent.qrPayload, new Date().toISOString());
  res.flash('success', 'Instruksi pembayaran berhasil dibuat.');
  res.redirect(`/pembayaran/${order.code}`);
});

app.post('/pembayaran/:code/simulasi', requireAuth, (req, res, next) => {
  const order = ordersLib.getOrderByCode(req.params.code);
  if (!order || !canAccessOrder(req.user, order)) return next();
  if (order.status !== 'pending') {
    return res.redirect(`/pembayaran/${order.code}`);
  }
  const payment = ordersLib.latestPaymentForOrder(order.id);
  if (!payment || payment.status !== 'pending') {
    res.flash('error', 'Belum ada instruksi pembayaran aktif.');
    return res.redirect(`/pembayaran/${order.code}`);
  }
  if (req.body.action === 'success') {
    const now = new Date().toISOString();
    db.prepare("UPDATE payments SET status = 'success', paid_at = ? WHERE id = ?").run(now, payment.id);
    ordersLib.markOrderPaid(order, payment.method, payment.ref);
    res.flash('success', 'Pembayaran berhasil diverifikasi. Jadwal belajar kamu sudah aktif.');
    return res.redirect(`/pembayaran/${order.code}/sukses`);
  }
  db.prepare("UPDATE payments SET status = 'failed' WHERE id = ?").run(payment.id);
  res.flash('error', 'Simulasi pembayaran gagal. Silakan buat instruksi baru.');
  return res.redirect(`/pembayaran/${order.code}`);
});

app.get('/pembayaran/:code/sukses', requireAuth, (req, res, next) => {
  const order = ordersLib.getOrderByCode(req.params.code);
  if (!order || !canAccessOrder(req.user, order)) return next();
  if (order.status !== 'paid' && order.status !== 'completed') {
    res.flash('error', 'Pembayaran pesanan ini belum terverifikasi.');
    return res.redirect(`/pembayaran/${order.code}`);
  }
  const sessions = ordersLib.getOrderSessions(order.id);
  res.render('user/payment-success', {
    title: 'Pembayaran Berhasil',
    bodyClass: 'page-dash',
    area: 'user',
    active: 'orders',
    order,
    sessions,
  });
});

/* -------------------------------- Admin ------------------------------- */

app.get('/admin', requireAdmin, (req, res) => {
  const [thisMonthStart, thisMonthEnd] = monthRange(0);
  const [lastMonthStart, lastMonthEnd] = monthRange(-1);
  const revenueThisMonth = db
    .prepare(
      `SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS count FROM orders
       WHERE status IN ('paid','completed') AND date(paid_at) BETWEEN date(?) AND date(?)`
    )
    .get(thisMonthStart, thisMonthEnd);
  const revenueLastMonth = db
    .prepare(
      `SELECT COALESCE(SUM(total),0) AS total FROM orders
       WHERE status IN ('paid','completed') AND date(paid_at) BETWEEN date(?) AND date(?)`
    )
    .get(lastMonthStart, lastMonthEnd);
  const ordersThisMonth = db
    .prepare('SELECT COUNT(*) AS total FROM orders WHERE date(created_at) BETWEEN date(?) AND date(?)')
    .get(thisMonthStart, thisMonthEnd);
  const pending = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total),0) AS total FROM orders WHERE status = 'pending'`
    )
    .get();
  const students = db.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'user'").get().total;
  const activeStudents = db
    .prepare(
      `SELECT COUNT(DISTINCT user_id) AS total FROM orders WHERE status IN ('paid','completed')`
    )
    .get().total;

  const monthlyRevenue = reports.getMonthlyRevenue(6);
  const maxRevenue = Math.max(...monthlyRevenue.map((m) => m.total), 1);
  monthlyRevenue.forEach((m) => {
    m.height = Math.max(4, Math.round((m.total / maxRevenue) * 100));
    m.isCurrent = m === monthlyRevenue[monthlyRevenue.length - 1];
  });

  const recentOrders = db
    .prepare(
      `SELECT o.*, p.title AS program_title, p.category, u.name AS user_name
       FROM orders o JOIN programs p ON p.id = o.program_id JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC LIMIT 8`
    )
    .all();

  const topPrograms = db
    .prepare(
      `SELECT p.title, p.category, COUNT(o.id) AS transactions, COALESCE(SUM(o.total),0) AS revenue
       FROM orders o JOIN programs p ON p.id = o.program_id
       WHERE o.status IN ('paid','completed')
       GROUP BY p.id ORDER BY revenue DESC LIMIT 5`
    )
    .all();
  const maxProgramRevenue = Math.max(...topPrograms.map((p) => p.revenue), 1);
  topPrograms.forEach((p) => {
    p.pct = Math.round((p.revenue / maxProgramRevenue) * 100);
  });

  const trend = revenueLastMonth.total
    ? Math.round(((revenueThisMonth.total - revenueLastMonth.total) / revenueLastMonth.total) * 1000) / 10
    : 100;

  res.render('admin/dashboard', {
    title: 'Dashboard Admin',
    bodyClass: 'page-admin',
    area: 'admin',
    active: 'dashboard',
    revenueThisMonth,
    revenueLastMonth,
    ordersThisMonth,
    pending,
    students,
    activeStudents,
    monthlyRevenue,
    recentOrders,
    topPrograms,
    trend,
  });
});

app.get('/admin/pesanan', requireAdmin, (req, res) => {
  const validStatuses = ['all', 'pending', 'paid', 'completed', 'cancelled'];
  const status = validStatuses.includes(req.query.status) ? req.query.status : 'all';
  const q = String(req.query.q || '').trim();
  const category = CATEGORIES.some((c) => c.slug === req.query.kategori) ? req.query.kategori : 'all';
  const conditions = [];
  const params = [];
  if (status !== 'all') {
    conditions.push('o.status = ?');
    params.push(status);
  }
  if (category !== 'all') {
    conditions.push('p.category = ?');
    params.push(category);
  }
  if (q) {
    conditions.push('(o.code LIKE ? OR o.invoice_no LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR p.title LIKE ?)');
    const needle = `%${q}%`;
    params.push(needle, needle, needle, needle, needle);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const list = db
    .prepare(
      `SELECT o.*, p.title AS program_title, p.category, u.name AS user_name, u.email AS user_email
       FROM orders o JOIN programs p ON p.id = o.program_id JOIN users u ON u.id = o.user_id
       ${where} ORDER BY o.created_at DESC LIMIT 150`
    )
    .all(...params);
  const counts = db.prepare('SELECT status, COUNT(*) AS total FROM orders GROUP BY status').all();
  const countMap = { all: counts.reduce((sum, row) => sum + row.total, 0) };
  for (const row of counts) countMap[row.status] = row.total;

  res.render('admin/orders', {
    title: 'Kelola Pesanan',
    bodyClass: 'page-admin',
    area: 'admin',
    active: 'orders',
    orders: list,
    status,
    q,
    category,
    countMap,
  });
});

app.get('/admin/pesanan/:code', requireAdmin, (req, res, next) => {
  const order = ordersLib.getOrderByCode(req.params.code);
  if (!order) return next();
  const sessions = ordersLib.getOrderSessions(order.id);
  const payments = db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC').all(order.id);
  const userStats = db
    .prepare(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(CASE WHEN status IN ('paid','completed') THEN total ELSE 0 END),0) AS spent
       FROM orders WHERE user_id = ?`
    )
    .get(order.user_id);
  res.render('admin/order-detail', {
    title: `Pesanan ${order.code}`,
    bodyClass: 'page-admin',
    area: 'admin',
    active: 'orders',
    order,
    sessions,
    payments,
    userStats,
  });
});

app.get('/admin/pesanan/:code/invoice', requireAdmin, (req, res, next) => {
  const order = ordersLib.getOrderByCode(req.params.code);
  if (!order) return next();
  streamInvoicePdf(res, order, { download: req.query.download === '1' });
});

app.post('/admin/pesanan/:code/status', requireAdmin, (req, res, next) => {
  const order = ordersLib.getOrderByCode(req.params.code);
  if (!order) return next();
  const action = String(req.body.action || '');

  if (action === 'paid') {
    if (order.status === 'cancelled' || order.status === 'completed') {
      res.flash('error', 'Status pesanan tidak dapat diubah menjadi lunas.');
      return res.redirect(`/admin/pesanan/${order.code}`);
    }
    const payment = ordersLib.latestPaymentForOrder(order.id);
    const method = payment ? payment.method : 'manual';
    const ref = payment ? payment.ref : `MANUAL-${order.code}`;
    const now = new Date().toISOString();
    if (payment) {
      db.prepare("UPDATE payments SET status = 'success', paid_at = COALESCE(paid_at, ?) WHERE id = ?").run(now, payment.id);
    } else {
      db.prepare(
        `INSERT INTO payments (order_id, ref, provider, method, amount, status, va_number, qr_payload, created_at, paid_at)
         VALUES (?, ?, 'manual', 'manual', ?, 'success', NULL, NULL, ?, ?)`
      ).run(order.id, ref, order.total, now, now);
    }
    ordersLib.markOrderPaid(order, method, ref);
    res.flash('success', `Pembayaran pesanan ${order.code} berhasil dikonfirmasi.`);
  } else if (action === 'completed') {
    if (order.status !== 'paid') {
      res.flash('error', 'Hanya pesanan yang sudah lunas yang bisa diselesaikan.');
      return res.redirect(`/admin/pesanan/${order.code}`);
    }
    ordersLib.completeOrder(order.id);
    res.flash('success', `Pesanan ${order.code} ditandai selesai.`);
  } else if (action === 'cancelled') {
    if (order.status === 'completed') {
      res.flash('error', 'Pesanan yang sudah selesai tidak dapat dibatalkan.');
      return res.redirect(`/admin/pesanan/${order.code}`);
    }
    ordersLib.cancelOrder(order.id);
    db.prepare("UPDATE payments SET status = 'expired' WHERE order_id = ? AND status = 'pending'").run(order.id);
    res.flash('success', `Pesanan ${order.code} dibatalkan.`);
  } else {
    res.flash('error', 'Aksi tidak dikenal.');
  }
  res.redirect(`/admin/pesanan/${order.code}`);
});

/* --------------------------- Admin: program --------------------------- */

app.get('/admin/program', requireAdmin, (req, res) => {
  const programs = db
    .prepare(
      `SELECT p.*, t.name AS tutor_name, COUNT(o.id) AS order_count
       FROM programs p LEFT JOIN tutors t ON t.id = p.tutor_id
       LEFT JOIN orders o ON o.program_id = p.id
       GROUP BY p.id ORDER BY p.active DESC, p.created_at DESC`
    )
    .all();
  res.render('admin/programs', {
    title: 'Kelola Program',
    bodyClass: 'page-admin',
    area: 'admin',
    active: 'programs',
    programs,
  });
});

function programFormData(body, id = null) {
  const highlights = String(body.highlights || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
  return {
    title: String(body.title || '').trim(),
    slug: uniqueSlug(slugify(body.title || ''), id),
    category: CATEGORIES.some((c) => c.slug === body.category) ? body.category : CATEGORIES[0].slug,
    level: String(body.level || 'Umum').trim(),
    mode: ['online', 'hybrid'].includes(body.mode) ? body.mode : 'online',
    description: String(body.description || '').trim(),
    highlights,
    price: Math.max(0, Number(body.price) || 0),
    duration: Math.max(30, Number(body.duration) || 90),
    tutor_id: Number(body.tutor_id) || null,
    featured: body.featured ? 1 : 0,
    active: body.active === undefined ? 1 : String(body.active) === '1' ? 1 : 0,
  };
}

function validateProgram(data) {
  if (data.title.length < 4) return 'Judul program minimal 4 karakter.';
  if (data.description.length < 20) return 'Deskripsi minimal 20 karakter.';
  if (data.price < 10000) return 'Harga per sesi minimal Rp 10.000.';
  if (!data.tutor_id) return 'Pilih tutor untuk program ini.';
  const tutor = db.prepare('SELECT id FROM tutors WHERE id = ?').get(data.tutor_id);
  if (!tutor) return 'Tutor tidak ditemukan.';
  return null;
}

app.get('/admin/program/baru', requireAdmin, (req, res) => {
  const tutors = db.prepare('SELECT * FROM tutors ORDER BY active DESC, name ASC').all();
  res.render('admin/program-form', {
    title: 'Tambah Program',
    bodyClass: 'page-admin',
    area: 'admin',
    active: 'programs',
    program: null,
    tutors,
    formAction: '/admin/program',
  });
});

app.post('/admin/program', requireAdmin, (req, res) => {
  const data = programFormData(req.body);
  const error = validateProgram(data);
  if (error) {
    res.flash('error', error);
    return res.redirect('/admin/program/baru');
  }
  db.prepare(
    `INSERT INTO programs (slug, title, category, level, mode, description, highlights, price, duration, tutor_id, rating, students, featured, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 5.0, 0, ?, ?, ?)`
  ).run(
    data.slug,
    data.title,
    data.category,
    data.level,
    data.mode,
    data.description,
    JSON.stringify(data.highlights),
    data.price,
    data.duration,
    data.tutor_id,
    data.featured,
    data.active,
    new Date().toISOString()
  );
  res.flash('success', 'Program baru berhasil ditambahkan.');
  res.redirect('/admin/program');
});

app.get('/admin/program/:id/edit', requireAdmin, (req, res, next) => {
  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(req.params.id);
  if (!program) return next();
  const tutors = db.prepare('SELECT * FROM tutors ORDER BY active DESC, name ASC').all();
  res.render('admin/program-form', {
    title: 'Edit Program',
    bodyClass: 'page-admin',
    area: 'admin',
    active: 'programs',
    program,
    tutors,
    formAction: `/admin/program/${program.id}`,
  });
});

app.post('/admin/program/:id', requireAdmin, (req, res, next) => {
  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(req.params.id);
  if (!program) return next();
  const data = programFormData(req.body, program.id);
  const error = validateProgram(data);
  if (error) {
    res.flash('error', error);
    return res.redirect(`/admin/program/${program.id}/edit`);
  }
  db.prepare(
    `UPDATE programs SET slug = ?, title = ?, category = ?, level = ?, mode = ?, description = ?, highlights = ?,
     price = ?, duration = ?, tutor_id = ?, featured = ?, active = ? WHERE id = ?`
  ).run(
    data.slug,
    data.title,
    data.category,
    data.level,
    data.mode,
    data.description,
    JSON.stringify(data.highlights),
    data.price,
    data.duration,
    data.tutor_id,
    data.featured,
    data.active,
    program.id
  );
  res.flash('success', 'Program berhasil diperbarui.');
  res.redirect('/admin/program');
});

app.post('/admin/program/:id/toggle', requireAdmin, (req, res, next) => {
  const program = db.prepare('SELECT * FROM programs WHERE id = ?').get(req.params.id);
  if (!program) return next();
  db.prepare('UPDATE programs SET active = ? WHERE id = ?').run(program.active ? 0 : 1, program.id);
  res.flash('success', `Program ${program.active ? 'dinonaktifkan' : 'diaktifkan'} kembali.`);
  res.redirect('/admin/program');
});

/* ---------------------------- Admin: tutor ---------------------------- */

app.get('/admin/tutor', requireAdmin, (req, res) => {
  const tutors = db
    .prepare(
      `SELECT t.*, COUNT(p.id) AS program_count
       FROM tutors t LEFT JOIN programs p ON p.tutor_id = t.id
       GROUP BY t.id ORDER BY t.active DESC, t.name ASC`
    )
    .all();
  res.render('admin/tutors', {
    title: 'Kelola Tutor',
    bodyClass: 'page-admin',
    area: 'admin',
    active: 'tutors',
    tutors,
  });
});

app.get('/admin/tutor/baru', requireAdmin, (req, res) => {
  res.render('admin/tutor-form', {
    title: 'Tambah Tutor',
    bodyClass: 'page-admin',
    area: 'admin',
    active: 'tutors',
    tutor: null,
    formAction: '/admin/tutor',
  });
});

app.post('/admin/tutor', requireAdmin, (req, res) => {
  const data = tutorFormData(req.body);
  const error = validateTutor(data);
  if (error) {
    res.flash('error', error);
    return res.redirect('/admin/tutor/baru');
  }
  db.prepare(
    `INSERT INTO tutors (name, title, expertise, bio, rating, students, badge, accent, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(data.name, data.title, data.expertise, data.bio, data.rating, data.students, data.badge, data.accent, new Date().toISOString());
  res.flash('success', 'Tutor baru berhasil ditambahkan.');
  res.redirect('/admin/tutor');
});

function tutorFormData(body) {
  const accents = ['sage', 'sky', 'amber', 'rose', 'violet'];
  return {
    name: String(body.name || '').trim(),
    title: String(body.title || '').trim(),
    expertise: String(body.expertise || '').trim(),
    bio: String(body.bio || '').trim(),
    rating: Math.min(5, Math.max(0, Number(body.rating) || 5)),
    students: Math.max(0, Number(body.students) || 0),
    badge: String(body.badge || '').trim(),
    accent: accents.includes(body.accent) ? body.accent : 'sage',
  };
}

function validateTutor(data) {
  if (data.name.length < 3) return 'Nama tutor minimal 3 karakter.';
  if (!data.title) return 'Jabatan tutor wajib diisi.';
  if (!data.expertise) return 'Bidang keahlian wajib diisi.';
  return null;
}

app.get('/admin/tutor/:id/edit', requireAdmin, (req, res, next) => {
  const tutor = db.prepare('SELECT * FROM tutors WHERE id = ?').get(req.params.id);
  if (!tutor) return next();
  res.render('admin/tutor-form', {
    title: 'Edit Tutor',
    bodyClass: 'page-admin',
    area: 'admin',
    active: 'tutors',
    tutor,
    formAction: `/admin/tutor/${tutor.id}`,
  });
});

app.post('/admin/tutor/:id', requireAdmin, (req, res, next) => {
  const tutor = db.prepare('SELECT * FROM tutors WHERE id = ?').get(req.params.id);
  if (!tutor) return next();
  const data = tutorFormData(req.body);
  const error = validateTutor(data);
  if (error) {
    res.flash('error', error);
    return res.redirect(`/admin/tutor/${tutor.id}/edit`);
  }
  db.prepare(
    'UPDATE tutors SET name = ?, title = ?, expertise = ?, bio = ?, rating = ?, students = ?, badge = ?, accent = ? WHERE id = ?'
  ).run(data.name, data.title, data.expertise, data.bio, data.rating, data.students, data.badge, data.accent, tutor.id);
  res.flash('success', 'Data tutor berhasil diperbarui.');
  res.redirect('/admin/tutor');
});

app.post('/admin/tutor/:id/toggle', requireAdmin, (req, res, next) => {
  const tutor = db.prepare('SELECT * FROM tutors WHERE id = ?').get(req.params.id);
  if (!tutor) return next();
  db.prepare('UPDATE tutors SET active = ? WHERE id = ?').run(tutor.active ? 0 : 1, tutor.id);
  res.flash('success', `Tutor ${tutor.active ? 'dinonaktifkan' : 'diaktifkan'} kembali.`);
  res.redirect('/admin/tutor');
});

/* --------------------------- Admin: pengguna -------------------------- */

app.get('/admin/pengguna', requireAdmin, (req, res) => {
  const q = String(req.query.q || '').trim();
  const params = [];
  let where = "WHERE u.role = 'user'";
  if (q) {
    where += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)';
    const needle = `%${q}%`;
    params.push(needle, needle, needle);
  }
  const users = db
    .prepare(
      `SELECT u.*, COUNT(o.id) AS order_count,
              COALESCE(SUM(CASE WHEN o.status IN ('paid','completed') THEN o.total ELSE 0 END),0) AS spent,
              MAX(o.created_at) AS last_order
       FROM users u LEFT JOIN orders o ON o.user_id = u.id
       ${where} GROUP BY u.id ORDER BY u.created_at DESC`
    )
    .all(...params);
  res.render('admin/users', {
    title: 'Pengguna',
    bodyClass: 'page-admin',
    area: 'admin',
    active: 'users',
    users,
    q,
  });
});

/* --------------------------- Admin: laporan --------------------------- */

app.get('/admin/laporan', requireAdmin, (req, res) => {
  const filters = reports.parseReportFilters(req.query);
  const data = reports.getReport(filters);
  const quickRanges = [
    { label: 'Bulan ini', from: h.firstOfMonth(0), to: h.lastOfMonth(0) },
    { label: '30 hari terakhir', from: h.addDays(h.todayISO(), -29), to: h.todayISO() },
    { label: '6 bulan terakhir', from: h.firstOfMonth(-5), to: h.lastOfMonth(0) },
    { label: 'Tahun ini', from: `${new Date().getFullYear()}-01-01`, to: `${new Date().getFullYear()}-12-31` },
  ].map((range) => ({
    ...range,
    active: range.from === filters.from && range.to === filters.to,
  }));
  const methodOptions = [
    ...PAYMENT_METHODS.map((m) => ({ id: m.id, label: PAYMENT_GROUP_LABEL[m.id] })),
    { id: 'manual', label: 'Transfer Manual' },
  ];
  const qs = new URLSearchParams(filters).toString();

  res.render('admin/report', {
    title: 'Laporan Keuangan',
    bodyClass: 'page-admin',
    area: 'admin',
    active: 'report',
    data,
    filters,
    quickRanges,
    methodOptions,
    qs,
  });
});

app.get('/admin/laporan/pdf', requireAdmin, (req, res) => {
  const filters = reports.parseReportFilters(req.query);
  const data = reports.getReport(filters);
  reports.streamReportPdf(res, data);
});

app.get('/admin/laporan/excel', requireAdmin, async (req, res, next) => {
  const filters = reports.parseReportFilters(req.query);
  const data = reports.getReport(filters);
  await reports.streamReportExcel(res, data);
});

/* ------------------------------- Errors ------------------------------- */

app.use((req, res) => {
  res.status(404).render('errors/404', {
    title: 'Halaman Tidak Ditemukan',
    bodyClass: 'page-error',
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).render('errors/500', {
    title: 'Terjadi Kesalahan',
    bodyClass: 'page-error',
  });
});

app.listen(PORT, () => {
  console.log(`Kelompok 4 berjalan di http://localhost:${PORT}`);
});
