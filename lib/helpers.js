const { CATEGORIES, PACKAGES, STATUS, PAYMENT_METHODS, APP } = require('./constants');
const { icon } = require('./icons');

const nf = new Intl.NumberFormat('id-ID');
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTHS_LONG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function formatRupiah(n) {
  return 'Rp ' + nf.format(Math.round(Number(n) || 0));
}

function formatNumber(n) {
  return nf.format(Number(n) || 0);
}

function formatRupiahShort(n) {
  const value = Number(n) || 0;
  if (value >= 1_000_000_000) return 'Rp ' + (value / 1_000_000_000).toFixed(1).replace('.', ',') + ' M';
  if (value >= 1_000_000) return 'Rp ' + (value / 1_000_000).toFixed(1).replace('.', ',') + ' jt';
  if (value >= 1_000) return 'Rp ' + Math.round(value / 1_000) + ' rb';
  return formatRupiah(value);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function todayISO() {
  return toISODate(new Date());
}

function addDays(value, days) {
  const date = parseDate(value);
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return toISODate(next);
}

function diffDays(target, base = todayISO()) {
  const a = parseDate(base);
  const b = parseDate(target);
  return Math.round((b - a) / 86400000);
}

function formatDateID(value, style = 'long') {
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return '-';
  const d = date.getDate();
  const m = date.getMonth();
  const y = date.getFullYear();
  if (style === 'short') return `${d} ${MONTHS_SHORT[m]} ${y}`;
  if (style === 'numeric') return `${pad2(d)}/${pad2(m + 1)}/${y}`;
  if (style === 'month-year') return `${MONTHS_LONG[m]} ${y}`;
  if (style === 'weekday') {
    const weekday = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(date);
    return `${weekday}, ${d} ${MONTHS_SHORT[m]} ${y}`;
  }
  return `${d} ${MONTHS_LONG[m]} ${y}`;
}

function formatDateTimeID(value) {
  const date = parseDate(value);
  if (!date || Number.isNaN(date.getTime())) return '-';
  return `${formatDateID(date, 'short')}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] || '')
    .join('')
    .toUpperCase();
}

function categoryBy(slug) {
  return CATEGORIES.find((c) => c.slug === slug) || { slug, label: slug, icon: 'book', tint: 'sage' };
}

function statusMeta(status) {
  return STATUS[status] || { label: status, tone: 'ink', step: 0 };
}

function paymentMethodBy(id) {
  const found = PAYMENT_METHODS.find((m) => m.id === id);
  if (found) return found;
  if (id === 'manual') {
    return { id: 'manual', name: 'Transfer Manual', group: 'Manual', icon: 'bank', note: 'Dikonfirmasi manual oleh admin.' };
  }
  return { id, name: id || '-', icon: 'wallet' };
}

function packageBySessions(sessions) {
  return PACKAGES.find((p) => p.sessions === Number(sessions)) || PACKAGES[0];
}

function modeLabel(mode) {
  return mode === 'hybrid' ? 'Online & Offline' : 'Online';
}

function parseHighlights(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [String(value)];
  } catch {
    return String(value).split('\n').filter(Boolean);
  }
}

function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function sessionLabel(date) {
  const diff = diffDays(date);
  if (diff === 0) return 'Hari ini';
  if (diff === 1) return 'Besok';
  if (diff > 1) return `${diff} hari lagi`;
  if (diff === -1) return 'Kemarin';
  return `${Math.abs(diff)} hari lalu`;
}

function sanitizeFilename(value) {
  return String(value).replace(/[^\w.-]+/g, '-').replace(/-+/g, '-');
}

function firstOfMonth(offset = 0) {
  const now = new Date();
  return toISODate(new Date(now.getFullYear(), now.getMonth() + offset, 1));
}

function lastOfMonth(offset = 0) {
  const now = new Date();
  return toISODate(new Date(now.getFullYear(), now.getMonth() + offset + 1, 0));
}

module.exports = {
  APP,
  icon,
  formatRupiah,
  formatNumber,
  formatRupiahShort,
  formatDateID,
  formatDateTimeID,
  todayISO,
  addDays,
  diffDays,
  initials,
  categoryBy,
  statusMeta,
  paymentMethodBy,
  packageBySessions,
  modeLabel,
  parseHighlights,
  greeting,
  sessionLabel,
  sanitizeFilename,
  toISODate,
  parseDate,
  firstOfMonth,
  lastOfMonth,
  pad2,
  MONTHS_SHORT,
};
