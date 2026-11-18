const { hashPassword } = require('./security');
const { calcPricing, TIME_SLOTS } = require('./constants');
const { addDays, todayISO, pad2, parseDate, toISODate } = require('./helpers');

function isoAt(dateStr, hour = 9, minute = 0) {
  const d = parseDate(dateStr);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function seed(db) {
  const nowISO = new Date().toISOString();
  const today = todayISO();
  const now = new Date();

  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password, role, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const userPassword = hashPassword('user123');
  const adminPassword = hashPassword('admin123');

  insertUser.run('Admin Kelompok 4', 'admin@kelompok4.id', adminPassword, 'admin', '0858 1308 9193', '2025-05-02T09:00:00.000Z');
  insertUser.run('Muhammad Rifqy', 'me.rifqy@gmail.com', userPassword, 'user', '0858 1308 9193', '2026-07-14T10:20:00.000Z');
  insertUser.run('Dimas Aryo', 'dimas@example.com', userPassword, 'user', '0813 2211 4455', '2026-08-03T13:10:00.000Z');
  insertUser.run('Nadia Salsabila', 'nadia@example.com', userPassword, 'user', '0857 8899 1122', '2026-08-19T08:45:00.000Z');
  insertUser.run('Fajar Ramadhan', 'fajar@example.com', userPassword, 'user', '0821 3344 5566', '2026-09-06T15:30:00.000Z');
  insertUser.run('Intan Permata', 'intan@example.com', userPassword, 'user', '0819 7766 5544', '2026-09-27T11:05:00.000Z');

  const insertTutor = db.prepare(
    'INSERT INTO tutors (name, title, expertise, bio, rating, students, badge, accent, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
  );
  const tutors = [
    {
      name: 'Ratna Kusuma, S.Pd',
      title: 'Pendiri & Lead Tutor Matematika',
      expertise: 'Matematika • Olimpiade',
      bio: '12 tahun mendampingi siswa SD hingga SMA. Fokus pada pemahaman konsep, bukan sekadar rumus hafalan.',
      rating: 4.9,
      students: 115,
      badge: 'Alumni UI',
      accent: 'sage',
    },
    {
      name: 'Daniel Pratama, M.A.',
      title: 'Spesialis Bahasa Inggris & IELTS',
      expertise: 'IELTS • Conversation',
      bio: 'Mengajar bahasa Inggris dengan pendekatan komunikatif. Rata-rata kenaikan skor IELTS muridnya 1,5 band.',
      rating: 4.9,
      students: 140,
      badge: 'British Council Certified',
      accent: 'sky',
    },
    {
      name: 'Arif Nugraha',
      title: 'Software Engineer & Mentor Pemrograman',
      expertise: 'Python • Web Development',
      bio: 'Praktisi industri selama 8 tahun. Suka mengajar lewat proyek nyata yang bisa langsung masuk portofolio.',
      rating: 4.8,
      students: 145,
      badge: 'Ex-Tokopedia',
      accent: 'amber',
    },
    {
      name: 'Sinta Maharani',
      title: 'Product Designer & Mentor Desain',
      expertise: 'Figma • UI/UX',
      bio: 'Membantu pemula memahami proses desain dari riset, wireframe, hingga prototipe yang siap diuji.',
      rating: 4.9,
      students: 80,
      badge: 'Ex-Gojek Design',
      accent: 'rose',
    },
    {
      name: 'Bagas Wirawan',
      title: 'Digital Marketing Practitioner',
      expertise: 'Ads • Content Strategy',
      bio: 'Mengelola kampanye digital untuk UMKM dan brand nasional. Mengajar dengan studi kasus dan data nyata.',
      rating: 4.8,
      students: 70,
      badge: 'Google Certified',
      accent: 'violet',
    },
    {
      name: 'Nadia Putri, S.Pd',
      title: 'Tutor Matematika & Sains',
      expertise: 'Matematika • Fisika',
      bio: 'Sabar, terstruktur, dan senang membuat matematika terasa masuk akal untuk siswa yang sempat kesulitan.',
      rating: 4.9,
      students: 50,
      badge: 'Alumni ITB',
      accent: 'sage',
    },
  ];
  for (const t of tutors) {
    insertTutor.run(t.name, t.title, t.expertise, t.bio, t.rating, t.students, t.badge, t.accent, '2025-06-01T09:00:00.000Z');
  }

  const programs = [
    {
      slug: 'matematika-dasar-sd-smp',
      title: 'Matematika Dasar SD–SMP',
      category: 'matematika',
      level: 'SD – SMP',
      mode: 'hybrid',
      description:
        'Bangun fondasi matematika yang kokoh dengan pendekatan yang sabar dan menyenangkan. Setiap sesi disesuaikan dengan ritme belajar anak, mulai dari pemantapan operasi hitung hingga pemecahan soal cerita yang sering muncul di ulangan.',
      highlights: [
        'Pemantapan konsep dasar berhitung, pecahan, dan aljabar',
        'Latihan soal cerita serta strategi menghadapi ulangan',
        'Laporan progres belajar untuk orang tua setiap bulan',
        'Rencana belajar personal yang disusun bersama tutor',
      ],
      price: 110000,
      tutorId: 1,
      rating: 4.9,
      students: 115,
      featured: 1,
    },
    {
      slug: 'matematika-intensif-sma',
      title: 'Matematika Intensif SMA',
      category: 'matematika',
      level: 'SMA',
      mode: 'online',
      description:
        'Program intensif untuk siswa SMA yang ingin mengejar ketertinggalan atau menembus nilai tinggi di sekolah dan seleksi masuk perguruan tinggi. Materi disusun per topik dengan latihan terarah dan pembahasan mendalam.',
      highlights: [
        'Aljabar, kalkulus, trigonometri, dan statistika',
        'Pembahasan soal UTBK dan simulasi ujian',
        'Diagnostik awal untuk memetakan celah pemahaman',
        'Rekaman sesi agar bisa dipelajari ulang',
      ],
      price: 135000,
      tutorId: 6,
      rating: 4.9,
      students: 50,
      featured: 0,
    },
    {
      slug: 'english-conversation-teens',
      title: 'English Conversation for Teens',
      category: 'bahasa-inggris',
      level: 'SMP – SMA',
      mode: 'online',
      description:
        'Latih keberanian berbicara bahasa Inggris lewat percakapan topik sehari-hari, diskusi ringan, dan permainan bahasa. Tutor akan menyesuaikan materi dengan minat remaja supaya belajar terasa relevan dan tidak kaku.',
      highlights: [
        'Sesi speaking 90 menit dengan koreksi langsung',
        'Kosakata dan idiom yang dipakai sehari-hari',
        'Latihan presentasi dan diskusi kelompok kecil',
        'Rekaman sesi plus catatan perbaikan pelafalan',
      ],
      price: 100000,
      tutorId: 2,
      rating: 4.9,
      students: 85,
      featured: 1,
    },
    {
      slug: 'ielts-preparation',
      title: 'IELTS Preparation Intensive',
      category: 'bahasa-inggris',
      level: 'Umum',
      mode: 'online',
      description:
        'Siapkan diri untuk IELTS Academic maupun General dengan rencana belajar yang terukur. Tutor membantu memetakan target band, memperbaiki kelemahan, dan melatih keempat skill dengan simulasi tes yang mirip aslinya.',
      highlights: [
        'Simulasi listening, reading, writing, dan speaking',
        'Umpan balik tertulis untuk setiap esai',
        'Strategi manajemen waktu per section',
        'Target kenaikan skor yang disepakati di awal',
      ],
      price: 175000,
      tutorId: 2,
      rating: 4.9,
      students: 50,
      featured: 0,
    },
    {
      slug: 'python-untuk-pemula',
      title: 'Python untuk Pemula',
      category: 'pemrograman',
      level: 'Umum',
      mode: 'online',
      description:
        'Belajar Python dari nol tanpa perlu latar belakang teknologi. Kamu akan menulis kode sejak sesi pertama, membangun proyek kecil, dan memahami cara berpikir komputasional yang berguna di banyak bidang.',
      highlights: [
        'Variabel, logika, loop, fungsi, dan struktur data',
        'Proyek akhir: automasi file dan visualisasi data sederhana',
        'Pendampingan instalasi tools dan editor kode',
        'Latihan mandiri dengan umpan balik dari mentor',
      ],
      price: 150000,
      tutorId: 3,
      rating: 4.8,
      students: 60,
      featured: 0,
    },
    {
      slug: 'web-development-dasar',
      title: 'Web Development: HTML, CSS & JavaScript',
      category: 'pemrograman',
      level: 'SMA – Umum',
      mode: 'online',
      description:
        'Bangun website pertamamu dengan HTML, CSS, dan JavaScript. Setiap pertemuan menghasilkan bagian nyata dari sebuah proyek portofolio, sehingga kamu tidak hanya belajar teori tetapi juga punya karya untuk ditunjukkan.',
      highlights: [
        'Struktur HTML semantik dan layout responsif',
        'JavaScript modern untuk interaksi halaman',
        'Proyek portofolio landing page lengkap',
        'Review kode dan panduan publikasi website',
      ],
      price: 185000,
      tutorId: 3,
      rating: 4.9,
      students: 45,
      featured: 1,
    },
    {
      slug: 'desain-grafis-figma',
      title: 'Desain Grafis dengan Figma',
      category: 'desain',
      level: 'Umum',
      mode: 'online',
      description:
        'Kuasai Figma untuk membuat desain yang rapi, konsisten, dan siap dipakai. Mulai dari dasar antarmuka Figma, tipografi, warna, hingga menyusun komponen dan design system sederhana.',
      highlights: [
        'Dasar Figma, frame, auto layout, dan komponen',
        'Prinsip tipografi, warna, dan hierarki visual',
        'Latihan membuat konten sosial media dan poster',
        'Kumpulan file latihan dan template starter',
      ],
      price: 140000,
      tutorId: 4,
      rating: 4.9,
      students: 45,
      featured: 0,
    },
    {
      slug: 'ui-ux-fundamental',
      title: 'UI/UX Design Fundamental',
      category: 'desain',
      level: 'Umum',
      mode: 'online',
      description:
        'Pelajari proses desain produk digital dari masalah pengguna hingga prototipe yang bisa diuji. Cocok untuk pemula maupun desainer yang ingin memperkuat dasar berpikirnya.',
      highlights: [
        'Riset pengguna, user flow, dan wireframe',
        'Membangun prototipe interaktif di Figma',
        'Studi kasus yang bisa masuk portofolio',
        'Sesi kritik desain bersama mentor',
      ],
      price: 165000,
      tutorId: 4,
      rating: 4.8,
      students: 32,
      featured: 0,
    },
    {
      slug: 'literasi-digital-produktivitas',
      title: 'Literasi Digital & Produktivitas',
      category: 'digital',
      level: 'SD – SMP',
      mode: 'hybrid',
      description:
        'Bekali anak dengan keterampilan digital yang aman dan produktif: mengelola file, membuat presentasi, mencari informasi yang kredibel, sampai menjaga jejak digital. Dibimbing tutor dengan pendekatan praktik langsung.',
      highlights: [
        'Pengelolaan file, cloud, dan kolaborasi dokumen',
        'Membuat presentasi yang jelas dan menarik',
        'Keamanan digital dan etika bermedia sosial',
        'Proyek akhir presentasi bertema bebas',
      ],
      price: 95000,
      tutorId: 5,
      rating: 4.8,
      students: 30,
      featured: 0,
    },
    {
      slug: 'digital-marketing-pemula',
      title: 'Digital Marketing untuk Pemula',
      category: 'digital',
      level: 'Umum',
      mode: 'online',
      description:
        'Pahami cara memasarkan produk secara digital dengan strategi yang masuk akal dan terukur. Dari menyusun konten, memahami audiens, hingga membaca metrik kampanye sederhana.',
      highlights: [
        'Dasar content marketing dan pemetaan audiens',
        'Mengenal iklan Meta dan Google Ads',
        'Menyusun kalender konten satu bulan',
        'Studi kasus UMKM dan evaluasi metrik',
      ],
      price: 155000,
      tutorId: 5,
      rating: 4.8,
      students: 38,
      featured: 0,
    },
    {
      slug: 'flutter-aplikasi-mobile',
      title: 'Flutter: Aplikasi Mobile Pertama',
      category: 'pemrograman',
      level: 'SMA – Umum',
      mode: 'online',
      description:
        'Bangun aplikasi mobile pertamamu dengan Flutter dari nol. Mulai dari dasar Dart, menyusun antarmuka, hingga menghubungkan data dan merilis aplikasi ke perangkatmu sendiri.',
      highlights: [
        'Dasar Dart dan struktur proyek Flutter',
        'Menyusun antarmuka aplikasi yang responsif',
        'Mengelola data dan navigasi antar halaman',
        'Proyek akhir: aplikasi catatan atau to-do sederhana',
      ],
      price: 165000,
      tutorId: 3,
      rating: 4.8,
      students: 20,
      featured: 0,
    },
    {
      slug: 'data-science-python',
      title: 'Data Science & Analisis Data dengan Python',
      category: 'pemrograman',
      level: 'Umum',
      mode: 'online',
      description:
        'Pelajari cara mengolah data menjadi insight dengan Python. Kamu akan membersihkan data, membuat visualisasi, dan menyusun analisis sederhana yang siap dipresentasikan.',
      highlights: [
        'Pengolahan data dengan pandas dan NumPy',
        'Visualisasi data yang mudah dipahami',
        'Dasar statistik untuk analisis sehari-hari',
        'Proyek akhir: laporan analisis data nyata',
      ],
      price: 175000,
      tutorId: 3,
      rating: 4.9,
      students: 18,
      featured: 0,
    },
  ];

  const insertProgram = db.prepare(
    'INSERT INTO programs (slug, title, category, level, mode, description, highlights, price, duration, tutor_id, rating, students, featured, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)'
  );
  for (const p of programs) {
    insertProgram.run(
      p.slug,
      p.title,
      p.category,
      p.level,
      p.mode,
      p.description,
      JSON.stringify(p.highlights),
      p.price,
      90,
      p.tutorId,
      p.rating,
      p.students,
      p.featured,
      '2025-06-15T09:00:00.000Z'
    );
  }

  const insertOrder = db.prepare(
    `INSERT INTO orders (code, invoice_no, user_id, program_id, tutor_id, sessions, price, subtotal, discount, fee, total, status, method, payment_ref, start_date, time_slot, notes, paid_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSession = db.prepare(
    'INSERT INTO order_sessions (order_id, seq, date, time_slot, status) VALUES (?, ?, ?, ?, ?)'
  );
  const insertPayment = db.prepare(
    'INSERT INTO payments (order_id, ref, provider, method, amount, status, va_number, qr_payload, created_at, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const invoiceCounters = new Map();
  function nextInvoice(dateObj) {
    const y = dateObj.getFullYear();
    const m = pad2(dateObj.getMonth() + 1);
    const key = `${y}-${m}`;
    const n = (invoiceCounters.get(key) || 0) + 1;
    invoiceCounters.set(key, n);
    return `INV/${y}/${m}/${String(n).padStart(4, '0')}`;
  }

  const methods = ['bca_va', 'mandiri_va', 'qris', 'gopay'];
  let orderSeq = 0;

  function createOrder(opts) {
    const program = programs[opts.programId - 1];
    const tutorId = opts.tutorId || program.tutorId;
    const pricing = calcPricing(program.price, opts.sessions);
    const created = new Date(opts.createdAt);
    orderSeq += 1;
    const invoiceNo = nextInvoice(created);
    const code = `K4-${String(created.getFullYear()).slice(2)}${pad2(created.getMonth() + 1)}${pad2(created.getDate())}-${String(orderSeq).padStart(3, '0')}`;
    const method = opts.method || null;
    const paymentRef = method ? `PAY-${code}` : null;
    const status = opts.status;
    const paidAt = opts.paidAt || null;

    const result = insertOrder.run(
      code,
      invoiceNo,
      opts.userId,
      opts.programId,
      tutorId,
      pricing.sessions,
      program.price,
      pricing.subtotal,
      pricing.discount,
      pricing.fee,
      pricing.total,
      status,
      method,
      paymentRef,
      opts.startDate,
      opts.timeSlot || TIME_SLOTS[2],
      opts.notes || null,
      paidAt,
      created.toISOString(),
      paidAt || created.toISOString()
    );
    const orderId = Number(result.lastInsertRowid);

    if (status === 'paid' || status === 'completed') {
      for (let i = 0; i < pricing.sessions; i += 1) {
        const sessionDate = addDays(opts.startDate, i * 7);
        let sessionStatus = sessionDate < today ? 'done' : 'scheduled';
        if (status === 'completed') sessionStatus = 'done';
        insertSession.run(orderId, i + 1, sessionDate, opts.timeSlot || TIME_SLOTS[2], sessionStatus);
      }
      const methodIndex = methods.indexOf(method);
      insertPayment.run(
        orderId,
        paymentRef,
        'mock',
        method,
        pricing.total,
        'success',
        method && method.endsWith('_va') ? `8808 ${String(10000000 + orderId * 137).slice(-4)} ${String(20000000 + orderId * 731).slice(-4)}` : null,
        method === 'qris' ? `00020101021226${code.replace(/[^0-9]/g, '')}520400005303360540${pricing.total}5802ID5920CENDEKIA` : null,
        paidAt || created.toISOString(),
        paidAt || created.toISOString()
      );
      if (methodIndex < 0) {
        // no-op, keeps all seeded payments consistent
      }
    }
    return { orderId, code, invoiceNo };
  }

  let seedState = 2026;
  const rnd = () => {
    seedState = (seedState * 9301 + 49297) % 233280;
    return seedState / 233280;
  };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  // Riwayat lima bulan sebelumnya
  for (let m = 5; m >= 1; m -= 1) {
    const count = m % 2 === 0 ? 5 : 4;
    for (let i = 0; i < count; i += 1) {
      const userId = 2 + Math.floor(rnd() * 5);
      const programId = 1 + Math.floor(rnd() * programs.length);
      const sessions = pick([4, 8, 8, 12]);
      const status = i === count - 1 && m % 2 === 0 ? 'cancelled' : rnd() > 0.45 ? 'completed' : 'paid';
      const day = 2 + Math.floor(rnd() * 25);
      const baseDate = new Date(now.getFullYear(), now.getMonth() - m, day, 9 + Math.floor(rnd() * 8), 15);
      const baseISO = toISODate(baseDate);
      let createdAt;
      let paidAt = null;
      let startDate = addDays(baseISO, 4);

      if (status === 'completed') {
        startDate = addDays(today, -(sessions * 7 + 10 + i));
        createdAt = isoAt(addDays(startDate, -2), 10, 30);
        paidAt = isoAt(addDays(startDate, -1), 14, 5);
      } else if (status === 'paid') {
        createdAt = baseDate.toISOString();
        paidAt = isoAt(addDays(baseISO, 1), 13, 20);
        startDate = addDays(baseISO, 5);
      } else {
        createdAt = baseDate.toISOString();
      }

      createOrder({
        userId,
        programId,
        sessions,
        status,
        method: status === 'pending' || status === 'cancelled' ? null : pick(methods),
        createdAt,
        paidAt,
        startDate,
        timeSlot: pick(TIME_SLOTS),
        notes: rnd() > 0.75 ? 'Mohon jadwal di sore hari jika memungkinkan.' : null,
      });
    }
  }

  // Bulan berjalan: campuran lunas dan menunggu pembayaran
  const maxDay = Math.max(1, now.getDate() - 1);
  const currentStatuses = ['paid', 'pending', 'paid', 'pending', 'paid'];
  for (let i = 0; i < currentStatuses.length; i += 1) {
    const status = currentStatuses[i];
    const userId = 2 + Math.floor(rnd() * 5);
    const programId = 1 + Math.floor(rnd() * programs.length);
    const sessions = pick([4, 8, 8, 12]);
    const day = 1 + Math.floor(rnd() * maxDay);
    const dateString = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(day)}`;
    const createdAt = isoAt(dateString, 9 + Math.floor(rnd() * 7), 10 + Math.floor(rnd() * 40));
    const startDate = status === 'paid' ? addDays(today, 2 + Math.floor(rnd() * 12)) : addDays(today, 4 + Math.floor(rnd() * 12));
    const paidAt = status === 'paid' ? isoAt(dateString, 16, 20) : null;

    createOrder({
      userId,
      programId,
      sessions,
      status,
      method: status === 'paid' ? pick(methods) : null,
      createdAt,
      paidAt,
      startDate,
      timeSlot: pick(TIME_SLOTS),
      notes: status === 'pending' ? 'Ditunggu konfirmasi jadwal oleh admin.' : null,
    });
  }

  // Riwayat khusus akun demo Muhammad Rifqy
  createOrder({
    userId: 2,
    programId: 4,
    sessions: 8,
    status: 'completed',
    method: 'bca_va',
    createdAt: isoAt(addDays(today, -49), 9, 40),
    paidAt: isoAt(addDays(today, -48), 10, 15),
    startDate: addDays(today, -46),
    timeSlot: TIME_SLOTS[1],
    notes: 'Target skor IELTS 7.0 untuk beasiswa.',
  });

  createOrder({
    userId: 2,
    programId: 5,
    sessions: 8,
    status: 'paid',
    method: 'qris',
    createdAt: isoAt(addDays(today, -3), 19, 25),
    paidAt: isoAt(addDays(today, -3), 19, 32),
    startDate: addDays(today, 3),
    timeSlot: TIME_SLOTS[3],
    notes: 'Ingin fokus pada automasi laporan dan dasar data.',
  });

  createOrder({
    userId: 2,
    programId: 7,
    sessions: 4,
    status: 'pending',
    method: null,
    createdAt: isoAt(addDays(today, -1), 20, 5),
    paidAt: null,
    startDate: addDays(today, 7),
    timeSlot: TIME_SLOTS[1],
    notes: 'Untuk persiapan portofolio desain.',
  });

  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('seeded_at', nowISO);
}

module.exports = seed;
