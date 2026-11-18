const crypto = require('node:crypto');
const QRCode = require('qrcode');
const { PAYMENT_METHODS, PAYMENT_GROUP_LABEL } = require('./constants');

/**
 * Adapter pembayaran.
 * Mode `mock` dipakai untuk demo: pembuatan instruksi pembayaran dan
 * konfirmasi dilakukan secara lokal. Untuk produksi, buat adapter baru
 * (Midtrans Snap / Xendit / Tripay) dengan kontrak yang sama, lalu ganti
 * `activeProvider` berdasarkan environment variable.
 */
const activeProvider = 'mock';

function randomDigits(length) {
  let out = '';
  while (out.length < length) out += crypto.randomInt(0, 10).toString();
  return out.slice(0, length);
}

function groupedDigits(digits, groups = [4, 4, 4]) {
  const parts = [];
  let cursor = 0;
  for (const size of groups) {
    parts.push(digits.slice(cursor, cursor + size));
    cursor += size;
  }
  return parts.filter(Boolean).join(' ');
}

function createPaymentIntent(order, methodId) {
  const method = PAYMENT_METHODS.find((m) => m.id === methodId);
  if (!method) throw new Error('Metode pembayaran tidak dikenal.');

  const ref = `PAY-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  let vaNumber = null;
  let qrPayload = null;

  if (methodId === 'bca_va') {
    vaNumber = groupedDigits(`8808${randomDigits(12)}`);
  } else if (methodId === 'mandiri_va') {
    vaNumber = groupedDigits(`8950${randomDigits(12)}`);
  } else if (methodId === 'qris') {
    qrPayload = `00020101021226${order.code.replace(/\D/g, '')}520400005303360540${order.total}5802ID5910CENDEKIA6007JAKARTA6304${randomDigits(4)}`;
  }

  return {
    ref,
    provider: activeProvider,
    method: methodId,
    methodName: PAYMENT_GROUP_LABEL[methodId] || method.name,
    amount: order.total,
    status: 'pending',
    vaNumber,
    qrPayload,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function buildQrSvg(payload) {
  return QRCode.toString(payload, {
    type: 'svg',
    margin: 1,
    width: 232,
    errorCorrectionLevel: 'M',
    color: { dark: '#0E3F32', light: '#ffffff' },
  });
}

module.exports = { activeProvider, createPaymentIntent, buildQrSvg };
