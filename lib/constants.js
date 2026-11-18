const APP = {
  name: 'Kelompok 4',
  tagline: 'Private Tutor',
  email: 'halo@kelompok4.id',
  phone: '0858 1308 9193',
  address: 'Jl. Raya Puspiptek No. 46, Buaran, Kec. Pamulang, Kota Tangerang Selatan, Banten 15310',
  fee: 2500,
};

const CATEGORIES = [
  {
    slug: 'matematika',
    label: 'Matematika',
    short: 'Matematika',
    icon: 'sigma',
    tint: 'sage',
    blurb: 'Pemantapan konsep, latihan soal, dan persiapan ujian bersama tutor berpengalaman.',
  },
  {
    slug: 'bahasa-inggris',
    label: 'Bahasa Inggris',
    short: 'Bahasa Inggris',
    icon: 'globe',
    tint: 'sky',
    blurb: 'Percakapan percaya diri, tata bahasa yang kuat, hingga target skor IELTS.',
  },
  {
    slug: 'pemrograman',
    label: 'Pemrograman',
    short: 'Pemrograman',
    icon: 'code',
    tint: 'amber',
    blurb: 'Belajar coding dari nol dengan proyek nyata dan mentor praktisi industri.',
  },
  {
    slug: 'desain',
    label: 'Desain',
    short: 'Desain',
    icon: 'pen',
    tint: 'rose',
    blurb: 'Kuasai Figma, prinsip visual, dan proses desain produk dari brief hingga prototipe.',
  },
  {
    slug: 'digital',
    label: 'Keterampilan Digital',
    short: 'Digital',
    icon: 'spark',
    tint: 'violet',
    blurb: 'Literasi digital, produktivitas, dan pemasaran digital untuk masa depan.',
  },
];

const PACKAGES = [
  { sessions: 4, discount: 0, label: 'Paket Mulai', note: 'Cocok untuk mencoba ritme belajar' },
  { sessions: 8, discount: 8, label: 'Paket Favorit', note: 'Paling banyak dipilih siswa', popular: true },
  { sessions: 12, discount: 15, label: 'Paket Intensif', note: 'Hemat untuk belajar rutin' },
];

const TIME_SLOTS = [
  '08:00 - 09:30',
  '10:00 - 11:30',
  '13:00 - 14:30',
  '16:00 - 17:30',
  '19:00 - 20:30',
];

const STATUS = {
  pending: { label: 'Menunggu Pembayaran', tone: 'amber', step: 0 },
  paid: { label: 'Lunas', tone: 'green', step: 1 },
  completed: { label: 'Selesai', tone: 'ink', step: 2 },
  cancelled: { label: 'Dibatalkan', tone: 'red', step: -1 },
};

const PAYMENT_METHODS = [
  {
    id: 'bca_va',
    name: 'BCA Virtual Account',
    group: 'Virtual Account',
    icon: 'bank',
    note: 'Transfer melalui m-BCA, ATM, atau internet banking.',
  },
  {
    id: 'mandiri_va',
    name: 'Mandiri Virtual Account',
    group: 'Virtual Account',
    icon: 'bank',
    note: 'Transfer melalui Livin\' by Mandiri atau ATM.',
  },
  {
    id: 'qris',
    name: 'QRIS',
    group: 'QR Code',
    icon: 'qr',
    note: 'Scan sekali dengan GoPay, OVO, DANA, atau m-banking.',
  },
  {
    id: 'gopay',
    name: 'GoPay',
    group: 'E-Wallet',
    icon: 'wallet',
    note: 'Bayar langsung dari aplikasi Gojek.',
  },
];

const PAYMENT_GROUP_LABEL = {
  bca_va: 'BCA Virtual Account',
  mandiri_va: 'Mandiri Virtual Account',
  qris: 'QRIS',
  gopay: 'GoPay',
  manual: 'Transfer Manual',
};

function calcPricing(price, sessions) {
  const pkg = PACKAGES.find((p) => p.sessions === Number(sessions)) || PACKAGES[0];
  const subtotal = price * pkg.sessions;
  const discount = Math.round((subtotal * pkg.discount) / 100);
  return {
    sessions: pkg.sessions,
    discountPct: pkg.discount,
    subtotal,
    discount,
    fee: APP.fee,
    total: subtotal - discount + APP.fee,
  };
}

module.exports = {
  APP,
  CATEGORIES,
  PACKAGES,
  TIME_SLOTS,
  STATUS,
  PAYMENT_METHODS,
  PAYMENT_GROUP_LABEL,
  calcPricing,
};
