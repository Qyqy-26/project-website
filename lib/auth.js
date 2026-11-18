const db = require('./db');
const { randomToken } = require('./security');

const COOKIE_NAME = 'cendekia_sid';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function createSession(userId, res) {
  const token = randomToken(32);
  const now = new Date();
  const expires = new Date(now.getTime() + MAX_AGE);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    expires.toISOString(),
    now.toISOString()
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE,
    path: '/',
  });
  return token;
}

function destroySession(req, res) {
  const token = req.cookies[COOKIE_NAME];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function loadUser(req, res, next) {
  req.user = null;
  res.locals.user = null;
  const token = req.cookies[COOKIE_NAME];
  if (!token) return next();

  const row = db
    .prepare(
      `SELECT s.token, s.expires_at, u.id, u.name, u.email, u.role, u.phone, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token);

  if (!row) return next();
  if (new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    return next();
  }

  req.user = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone,
    created_at: row.created_at,
  };
  res.locals.user = req.user;
  return next();
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  const target = req.method === 'GET' ? req.originalUrl : '/dashboard';
  return res.redirect(`/masuk?next=${encodeURIComponent(target)}`);
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.redirect(`/masuk?next=${encodeURIComponent(req.originalUrl)}`);
  }
  if (req.user.role !== 'admin') {
    res.flash('error', 'Halaman tersebut hanya dapat diakses oleh admin.');
    return res.redirect('/dashboard');
  }
  return next();
}

function requireGuest(req, res, next) {
  if (!req.user) return next();
  return res.redirect(req.user.role === 'admin' ? '/admin' : '/dashboard');
}

module.exports = {
  createSession,
  destroySession,
  loadUser,
  requireAuth,
  requireAdmin,
  requireGuest,
};
