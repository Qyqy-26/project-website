const db = require('./db');
const { addDays, toISODate } = require('./helpers');

const ORDER_SELECT = `
  SELECT o.*, p.title AS program_title, p.slug AS program_slug, p.category, p.level, p.mode, p.duration,
         u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
         t.name AS tutor_name, t.expertise AS tutor_expertise
  FROM orders o
  JOIN programs p ON p.id = o.program_id
  JOIN users u ON u.id = o.user_id
  LEFT JOIN tutors t ON t.id = o.tutor_id
`;

function getOrderByCode(code) {
  return db.prepare(`${ORDER_SELECT} WHERE o.code = ?`).get(code);
}

function getOrderById(id) {
  return db.prepare(`${ORDER_SELECT} WHERE o.id = ?`).get(id);
}

function getOrdersForUser(userId) {
  return db
    .prepare(`${ORDER_SELECT} WHERE o.user_id = ? ORDER BY o.created_at DESC`)
    .all(userId);
}

function getOrderSessions(orderId) {
  return db
    .prepare('SELECT * FROM order_sessions WHERE order_id = ? ORDER BY seq ASC')
    .all(orderId);
}

function getUpcomingSessions(userId, limit = 5) {
  return db
    .prepare(
      `SELECT s.*, o.code, o.status AS order_status, p.title AS program_title, p.mode, t.name AS tutor_name
       FROM order_sessions s
       JOIN orders o ON o.id = s.order_id
       JOIN programs p ON p.id = o.program_id
       LEFT JOIN tutors t ON t.id = o.tutor_id
       WHERE o.user_id = ? AND s.status = 'scheduled' AND s.date >= date('now', 'localtime')
       ORDER BY s.date ASC, s.time_slot ASC
       LIMIT ?`
    )
    .all(userId, limit);
}

function createSessionsForOrder(order) {
  const existing = db
    .prepare('SELECT COUNT(*) AS n FROM order_sessions WHERE order_id = ?')
    .get(order.id).n;
  if (existing > 0) return;

  const insert = db.prepare(
    'INSERT INTO order_sessions (order_id, seq, date, time_slot, status) VALUES (?, ?, ?, ?, ?)'
  );
  const today = toISODate(new Date());
  for (let i = 0; i < order.sessions; i += 1) {
    const date = addDays(order.start_date, i * 7);
    insert.run(order.id, i + 1, date, order.time_slot, date < today ? 'done' : 'scheduled');
  }
}

function markOrderPaid(order, method, ref) {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE orders SET status = 'paid', method = ?, payment_ref = ?, paid_at = COALESCE(paid_at, ?), updated_at = ? WHERE id = ?`
  ).run(method, ref, now, now, order.id);
  const fresh = getOrderById(order.id);
  createSessionsForOrder(fresh);
  return fresh;
}

function completeOrder(orderId) {
  const now = new Date().toISOString();
  db.prepare("UPDATE orders SET status = 'completed', updated_at = ? WHERE id = ?").run(now, orderId);
  db.prepare("UPDATE order_sessions SET status = 'done' WHERE order_id = ?").run(orderId);
}

function cancelOrder(orderId) {
  const now = new Date().toISOString();
  db.prepare("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now, orderId);
}

function latestPaymentForOrder(orderId) {
  return db
    .prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1')
    .get(orderId);
}

module.exports = {
  ORDER_SELECT,
  getOrderByCode,
  getOrderById,
  getOrdersForUser,
  getOrderSessions,
  getUpcomingSessions,
  createSessionsForOrder,
  markOrderPaid,
  completeOrder,
  cancelOrder,
  latestPaymentForOrder,
};
