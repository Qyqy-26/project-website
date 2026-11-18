const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const db = require('./db');
const { APP, CATEGORIES, PAYMENT_METHODS, PAYMENT_GROUP_LABEL } = require('./constants');
const {
  formatRupiah,
  formatNumber,
  formatDateID,
  formatDateTimeID,
  categoryBy,
  statusMeta,
  todayISO,
  firstOfMonth,
  lastOfMonth,
  MONTHS_SHORT,
} = require('./helpers');

const C = {
  forest: '#0E3F32',
  forestSoft: '#12513F',
  ink: '#122019',
  muted: '#68766E',
  line: '#E5DED0',
  cream: '#F8F4EB',
  creamDeep: '#F2EBDD',
  amber: '#E4A33C',
  white: '#FFFFFF',
  pale: '#CFE3DA',
};

function defaultFilters() {
  return {
    from: firstOfMonth(-5),
    to: lastOfMonth(0),
    status: 'all',
    category: 'all',
    method: 'all',
  };
}

function parseReportFilters(query = {}) {
  const defaults = defaultFilters();
  const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  let from = isDate(query.from) ? query.from : defaults.from;
  let to = isDate(query.to) ? query.to : defaults.to;
  if (from > to) [from, to] = [to, from];
  const status = ['all', 'paid', 'completed'].includes(query.status) ? query.status : 'all';
  const category = CATEGORIES.some((c) => c.slug === query.category) ? query.category : 'all';
  const method =
    PAYMENT_METHODS.some((m) => m.id === query.method) || query.method === 'manual' ? query.method : 'all';
  return { from, to, status, category, method };
}

function filterLabels(filters) {
  return {
    period: `${formatDateID(filters.from, 'short')} – ${formatDateID(filters.to, 'short')}`,
    status:
      filters.status === 'paid' ? 'Lunas' : filters.status === 'completed' ? 'Selesai' : 'Lunas & Selesai',
    category: filters.category === 'all' ? 'Semua kategori' : categoryBy(filters.category).label,
    method: filters.method === 'all' ? 'Semua metode' : PAYMENT_GROUP_LABEL[filters.method],
  };
}

function getReport(filters) {
  const where = ["o.status IN ('paid', 'completed')"];
  const params = [];
  if (filters.status !== 'all') {
    where.push('o.status = ?');
    params.push(filters.status);
  }
  if (filters.category !== 'all') {
    where.push('p.category = ?');
    params.push(filters.category);
  }
  if (filters.method !== 'all') {
    where.push('o.method = ?');
    params.push(filters.method);
  }
  where.push('date(o.paid_at) BETWEEN date(?) AND date(?)');
  params.push(filters.from, filters.to);

  const rows = db
    .prepare(
      `SELECT o.code, o.invoice_no, o.paid_at, o.created_at, o.total, o.subtotal, o.discount, o.fee,
              o.status, o.method, o.sessions, p.title AS program_title, p.category,
              u.name AS user_name, u.email AS user_email
       FROM orders o
       JOIN programs p ON p.id = o.program_id
       JOIN users u ON u.id = o.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY o.paid_at DESC, o.id DESC`
    )
    .all(...params);

  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const uniqueStudents = new Set(rows.map((row) => row.user_email)).size;
  const byCategory = CATEGORIES.map((category) => {
    const items = rows.filter((row) => row.category === category.slug);
    return {
      ...category,
      count: items.length,
      total: items.reduce((sum, row) => sum + row.total, 0),
    };
  })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.total - a.total);

  const methodMap = new Map();
  for (const row of rows) {
    const key = row.method || 'lainnya';
    const current = methodMap.get(key) || { id: key, name: PAYMENT_GROUP_LABEL[key] || 'Lainnya', count: 0, total: 0 };
    current.count += 1;
    current.total += row.total;
    methodMap.set(key, current);
  }
  const byMethod = [...methodMap.values()].sort((a, b) => b.total - a.total);

  const pendingParams = [filters.from, filters.to];
  let pendingWhere = "o.status = 'pending' AND date(o.created_at) BETWEEN date(?) AND date(?)";
  if (filters.category !== 'all') {
    pendingWhere += ' AND p.category = ?';
    pendingParams.push(filters.category);
  }
  const pending = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(o.total), 0) AS total
       FROM orders o JOIN programs p ON p.id = o.program_id
       WHERE ${pendingWhere}`
    )
    .get(...pendingParams);

  return {
    filters,
    labels: filterLabels(filters),
    rows,
    summary: {
      total,
      count: rows.length,
      average: rows.length ? Math.round(total / rows.length) : 0,
      uniqueStudents,
      pendingCount: pending.count,
      pendingTotal: pending.total,
    },
    byCategory,
    byMethod,
  };
}

function getMonthlyRevenue(months = 6) {
  const now = new Date();
  const out = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
         FROM orders
         WHERE status IN ('paid', 'completed') AND date(paid_at) BETWEEN date(?) AND date(?)`
      )
      .get(
        `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
        `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
      );
    out.push({
      label: MONTHS_SHORT[start.getMonth()],
      fullLabel: `${MONTHS_SHORT[start.getMonth()]} ${start.getFullYear()}`,
      total: row.total,
      count: row.count,
    });
  }
  return out;
}

/* ----------------------------- PDF laporan ----------------------------- */

function streamReportPdf(res, data) {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 0,
    bufferPages: true,
    info: { Title: `Laporan Keuangan — ${APP.name}`, Author: APP.name },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Laporan-Keuangan-Kelompok-4-${todayISO()}.pdf"`);
  doc.pipe(res);

  const W = doc.page.width;
  const H = doc.page.height;
  const M = 50;
  const CW = W - M * 2;

  const header = (continuationLabel = null) => {
    if (continuationLabel) {
      doc.rect(0, 0, W, 44).fill(C.forest);
      doc.fillColor(C.white).font('Helvetica-Bold').fontSize(11).text(APP.name, M, 15);
      doc.fillColor(C.pale).font('Helvetica').fontSize(8).text(continuationLabel, M + 78, 18);
      return 62;
    }
    doc.save();
    doc.rect(0, 0, W, 92).fill(C.forest);
    doc.fillOpacity(0.12);
    doc.circle(W - 20, -20, 110).fill(C.amber);
    doc.fillOpacity(0.07);
    doc.circle(W - 120, 60, 70).fill(C.white);
    doc.restore();

    doc.roundedRect(M, 26, 30, 30, 8).fill(C.amber);
    doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(17).text('4', M, 32, { width: 30, align: 'center' });
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(15).text(APP.name, M + 40, 28);
    doc
      .fillColor(C.pale)
      .font('Helvetica')
      .fontSize(7.5)
      .text(APP.tagline.toUpperCase(), M + 40, 49, { characterSpacing: 1 });

    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(18).text('LAPORAN KEUANGAN', M, 28, {
      width: CW,
      align: 'right',
    });
    doc
      .fillColor(C.pale)
      .font('Helvetica')
      .fontSize(8.5)
      .text(`${data.labels.period}  •  ${data.labels.status}`, M, 52, { width: CW, align: 'right' });
    doc
      .fillColor(C.pale)
      .font('Helvetica')
      .fontSize(7.2)
      .text(`Dibuat ${formatDateTimeID(new Date())}`, M, 66, { width: CW, align: 'right' });
    return 116;
  };

  let y = header();

  // Summary cards
  const cards = [
    ['Total pendapatan', formatRupiah(data.summary.total)],
    ['Transaksi', `${formatNumber(data.summary.count)} transaksi`],
    ['Rata-rata / transaksi', formatRupiah(data.summary.average)],
    ['Siswa unik', `${formatNumber(data.summary.uniqueStudents)} siswa`],
  ];
  const gap = 12;
  const cardW = (CW - gap * 3) / 4;
  cards.forEach(([label, value], i) => {
    const x = M + i * (cardW + gap);
    doc.roundedRect(x, y, cardW, 62, 8).fill(C.cream);
    doc.rect(x, y + 12, 3, 38).fill(i === 0 ? C.amber : C.forestSoft);
    doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(6.6).text(label.toUpperCase(), x + 14, y + 13, {
      width: cardW - 22,
      characterSpacing: 0.5,
    });
    doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(12.5).text(value, x + 14, y + 28, { width: cardW - 22 });
  });
  y += 76;

  doc.fillColor(C.muted).font('Helvetica').fontSize(7.5);
  doc.text(
    `Kategori: ${data.labels.category}     •     Metode: ${data.labels.method}     •     Periode: ${data.labels.period}`,
    M,
    y,
    { width: CW }
  );
  doc
    .fillColor(C.amber)
    .font('Helvetica-Bold')
    .fontSize(7.2)
    .text(
      `Tagihan belum dibayar pada periode ini: ${data.summary.pendingCount} pesanan (tidak dihitung sebagai pendapatan)`,
      M,
      y,
      { width: CW, align: 'right' }
    );
  y += 22;

  // Transaction table
  const cols = [
    { key: 'no', label: 'NO', x: M, w: 24, align: 'left' },
    { key: 'invoice', label: 'INVOICE', x: M + 24, w: 104, align: 'left' },
    { key: 'date', label: 'TANGGAL', x: M + 128, w: 58, align: 'left' },
    { key: 'user', label: 'PELANGGAN', x: M + 186, w: 94, align: 'left' },
    { key: 'program', label: 'PROGRAM', x: M + 280, w: 174, align: 'left' },
    { key: 'category', label: 'KATEGORI', x: M + 454, w: 68, align: 'left' },
    { key: 'method', label: 'METODE', x: M + 522, w: 74, align: 'left' },
    { key: 'status', label: 'STATUS', x: M + 596, w: 44, align: 'left' },
    { key: 'total', label: 'TOTAL', x: M + 640, w: CW - 640, align: 'right' },
  ];

  const drawThead = (top) => {
    doc.rect(M, top, CW, 21).fill(C.forest);
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(6.6);
    for (const col of cols) {
      doc.text(col.label, col.x + (col.align === 'right' ? 0 : 7), top + 7.5, {
        width: col.w - (col.align === 'right' ? 8 : 7),
        align: col.align,
        characterSpacing: 0.4,
      });
    }
    return top + 21;
  };

  const drawRow = (row, index, top) => {
    if (index % 2 === 1) doc.rect(M, top, CW, 18).fill('#FBF8F1');
    const values = {
      no: String(index + 1),
      invoice: row.invoice_no,
      date: formatDateID(row.paid_at, 'short'),
      user: row.user_name,
      program: row.program_title,
      category: categoryBy(row.category).label,
      method: PAYMENT_GROUP_LABEL[row.method] || '-',
      status: statusMeta(row.status).label,
      total: formatRupiah(row.total),
    };
    doc.font('Helvetica').fontSize(6.9).fillColor(C.ink);
    for (const col of cols) {
      let text = values[col.key];
      if (col.key === 'program' && text.length > 34) text = `${text.slice(0, 33)}...`;
      if (col.key === 'user' && text.length > 20) text = `${text.slice(0, 19)}...`;
      doc
        .font(col.key === 'total' ? 'Helvetica-Bold' : 'Helvetica')
        .text(text, col.x + (col.align === 'right' ? 0 : 7), top + 5.5, {
          width: col.w - (col.align === 'right' ? 8 : 7),
          align: col.align,
          lineBreak: false,
        });
    }
    doc.moveTo(M, top + 18).lineTo(W - M, top + 18).strokeColor('#F0EADF').lineWidth(0.5).stroke();
    return top + 18;
  };

  let tableTop = y;
  let rowY = drawThead(tableTop);
  if (data.rows.length === 0) {
    doc.rect(M, rowY, CW, 46).fill(C.cream);
    doc.fillColor(C.muted).font('Helvetica').fontSize(8).text('Tidak ada transaksi pada filter yang dipilih.', M, rowY + 18, {
      width: CW,
      align: 'center',
    });
    rowY += 46;
  } else {
    data.rows.forEach((row, index) => {
      if (rowY + 18 > H - 58) {
        doc.addPage();
        const top = header('Laporan Keuangan — lanjutan');
        rowY = drawThead(top - 2);
      }
      rowY = drawRow(row, index, rowY);
    });

    if (rowY + 26 > H - 58) {
      doc.addPage();
      const top = header('Laporan Keuangan — lanjutan');
      rowY = top - 2;
    }
    doc.rect(M, rowY, CW, 24).fill(C.creamDeep);
    doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(8).text(
      `TOTAL PENDAPATAN  •  ${formatNumber(data.summary.count)} TRANSAKSI`,
      M + 8,
      rowY + 8,
      { characterSpacing: 0.4 }
    );
    doc
      .fillColor(C.forest)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(formatRupiah(data.summary.total), M, rowY + 7, { width: CW - 8, align: 'right' });
    rowY += 24;
  }

  // Recap page
  doc.addPage();
  let ry = header('Rekap pendapatan per kategori dan metode');
  ry += 10;
  doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(12).text('Rekap Pendapatan', M, ry);
  doc.fillColor(C.muted).font('Helvetica').fontSize(8).text(data.labels.period, M, ry + 16);
  ry += 40;

  const recapTable = (x, width, title, rows, totalRow) => {
    doc.roundedRect(x, ry, width, 28, 6).fill(C.creamDeep);
    doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(8.5).text(title, x + 12, ry + 9, { characterSpacing: 0.3 });
    let ty = ry + 36;
    doc.rect(x, ty, width, 20).fill(C.forest);
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(6.8);
    doc.text('NAMA', x + 10, ty + 7);
    doc.text('TRANSAKSI', x + width - 160, ty + 7, { width: 55, align: 'right' });
    doc.text('PENDAPATAN', x + width - 95, ty + 7, { width: 85, align: 'right' });
    ty += 20;

    rows.forEach((row, index) => {
      if (index % 2 === 1) doc.rect(x, ty, width, 19).fill('#FBF8F1');
      doc.fillColor(C.ink).font('Helvetica').fontSize(7.4).text(row.name, x + 10, ty + 6, {
        width: width - 175,
        lineBreak: false,
      });
      doc.text(String(row.count), x + width - 160, ty + 6, { width: 55, align: 'right' });
      doc.text(formatRupiah(row.total), x + width - 95, ty + 6, { width: 85, align: 'right' });
      doc.moveTo(x, ty + 19).lineTo(x + width, ty + 19).strokeColor('#F0EADF').lineWidth(0.5).stroke();
      ty += 19;
    });

    doc.rect(x, ty, width, 22).fill(C.creamDeep);
    doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(7.6).text('TOTAL', x + 10, ty + 7);
    doc.text(String(totalRow.count), x + width - 160, ty + 7, { width: 55, align: 'right' });
    doc.text(formatRupiah(totalRow.total), x + width - 95, ty + 7, { width: 85, align: 'right' });
    return ty + 22;
  };

  const halfW = (CW - 24) / 2;
  const leftEnd = recapTable(M, halfW, 'PER KATEGORI', data.byCategory.map((row) => ({
    name: row.label,
    count: row.count,
    total: row.total,
  })), { count: data.summary.count, total: data.summary.total });
  const rightEnd = recapTable(M + halfW + 24, halfW, 'PER METODE PEMBAYARAN', data.byMethod.map((row) => ({
    name: row.name,
    count: row.count,
    total: row.total,
  })), { count: data.summary.count, total: data.summary.total });

  let noteY = Math.max(leftEnd, rightEnd) + 24;
  doc.roundedRect(M, noteY, CW, 48, 8).fill(C.cream);
  doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(8).text('Catatan', M + 14, noteY + 12);
  doc.fillColor(C.muted).font('Helvetica').fontSize(7.5).text(
    `Laporan ini hanya menghitung pesanan berstatus Lunas dan Selesai. Terdapat ${data.summary.pendingCount} pesanan senilai ${formatRupiah(
      data.summary.pendingTotal
    )} yang masih menunggu pembayaran dan belum termasuk dalam total pendapatan.`,
    M + 14,
    noteY + 24,
    { width: CW - 28 }
  );

  // Footer per halaman
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const pageH = doc.page.height;
    doc.moveTo(M, pageH - 38).lineTo(W - M, pageH - 38).strokeColor(C.line).lineWidth(0.6).stroke();
    doc
      .fillColor(C.muted)
      .font('Helvetica')
      .fontSize(6.8)
      .text(`${APP.name} — Laporan Keuangan  •  Dicetak ${formatDateTimeID(new Date())}`, M, pageH - 30, { width: CW / 2 });
    doc.text(`Halaman ${i + 1} dari ${range.count}`, M, pageH - 30, { width: CW, align: 'right' });
  }

  doc.end();
}

/* ----------------------------- Excel laporan ----------------------------- */

async function streamReportExcel(res, data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = APP.name;
  wb.created = new Date();

  const GREEN = 'FF0E3F32';
  const AMBER = 'FFE4A33C';
  const CREAM = 'FFF8F4EB';
  const PALE = 'FFEAE3D5';
  const MUTED = 'FF68766E';
  const CURRENCY = '"Rp" #,##0';

  const border = {
    top: { style: 'thin', color: { argb: 'FFE5DED0' } },
    left: { style: 'thin', color: { argb: 'FFE5DED0' } },
    bottom: { style: 'thin', color: { argb: 'FFE5DED0' } },
    right: { style: 'thin', color: { argb: 'FFE5DED0' } },
  };

  const ws = wb.addWorksheet('Ringkasan', {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });
  ws.columns = [
    { width: 34 },
    { width: 20 },
    { width: 26 },
    { width: 4 },
  ];

  ws.mergeCells('A1:C2');
  const title = ws.getCell('A1');
  title.value = 'CENDEKIA';
  title.font = { name: 'Calibri', size: 22, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 24;

  ws.mergeCells('A3:C3');
  const tagline = ws.getCell('A3');
  tagline.value = 'Les Privat & Kursus Online  •  Laporan Keuangan';
  tagline.font = { size: 9, color: { argb: 'FFCFE3DA' } };
  tagline.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
  tagline.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(3).height = 22;

  ws.getCell('A5').value = 'Laporan Keuangan';
  ws.getCell('A5').font = { size: 16, bold: true, color: { argb: GREEN } };
  ws.getCell('A6').value = `Periode: ${data.labels.period}`;
  ws.getCell('A6').font = { size: 10, color: { argb: MUTED } };
  ws.getCell('A7').value = `Status: ${data.labels.status}   |   Kategori: ${data.labels.category}   |   Metode: ${data.labels.method}`;
  ws.getCell('A7').font = { size: 9, color: { argb: MUTED } };

  ws.mergeCells('A9:C9');
  const summaryTitle = ws.getCell('A9');
  summaryTitle.value = 'RINGKASAN';
  summaryTitle.font = { size: 10, bold: true, color: { argb: GREEN } };
  summaryTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CREAM } };
  summaryTitle.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(9).height = 24;

  const summaryRows = [
    ['Total pendapatan', data.summary.total, true],
    ['Jumlah transaksi', data.summary.count, false],
    ['Rata-rata per transaksi', data.summary.average, true],
    ['Siswa unik', data.summary.uniqueStudents, false],
  ];
  summaryRows.forEach(([label, value, isCurrency], index) => {
    const rowNo = 10 + index;
    const labelCell = ws.getCell(`A${rowNo}`);
    const valueCell = ws.getCell(`B${rowNo}`);
    labelCell.value = label;
    labelCell.font = { size: 10, color: { argb: 'FF122019' } };
    labelCell.border = border;
    valueCell.value = value;
    valueCell.font = { size: 11, bold: true, color: { argb: GREEN } };
    valueCell.alignment = { horizontal: 'right' };
    valueCell.border = border;
    if (isCurrency) valueCell.numFmt = CURRENCY;
    ws.getCell(`C${rowNo}`).border = border;
  });

  ws.mergeCells('A15:C15');
  const pending = ws.getCell('A15');
  pending.value = `Tagihan belum dibayar: ${data.summary.pendingCount} pesanan senilai ${formatRupiah(
    data.summary.pendingTotal
  )} (tidak termasuk pendapatan).`;
  pending.font = { size: 9, italic: true, color: { argb: 'FF9A6B1E' } };

  const headerRow = (rowNo, labels) => {
    const row = ws.getRow(rowNo);
    labels.forEach((label, index) => {
      const cell = row.getCell(index + 1);
      cell.value = label;
      cell.font = { size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
      cell.alignment = { vertical: 'middle', horizontal: index === 0 ? 'left' : 'right' };
      cell.border = border;
    });
    row.height = 20;
  };

  ws.getCell('A17').value = 'PENDAPATAN PER KATEGORI';
  ws.getCell('A17').font = { size: 10, bold: true, color: { argb: GREEN } };
  headerRow(18, ['Kategori', 'Transaksi', 'Pendapatan']);
  let rowCursor = 19;
  for (const cat of data.byCategory) {
    ws.getCell(`A${rowCursor}`).value = cat.label;
    ws.getCell(`B${rowCursor}`).value = cat.count;
    ws.getCell(`C${rowCursor}`).value = cat.total;
    ws.getCell(`C${rowCursor}`).numFmt = CURRENCY;
    for (let col = 1; col <= 3; col += 1) {
      const cell = ws.getRow(rowCursor).getCell(col);
      cell.border = border;
      cell.font = { size: 9.5 };
      if (col > 1) cell.alignment = { horizontal: 'right' };
    }
    rowCursor += 1;
  }
  const catTotalRow = rowCursor;
  ws.getCell(`A${catTotalRow}`).value = 'Total';
  ws.getCell(`B${catTotalRow}`).value = data.summary.count;
  ws.getCell(`C${catTotalRow}`).value = data.summary.total;
  ws.getCell(`C${catTotalRow}`).numFmt = CURRENCY;
  for (let col = 1; col <= 3; col += 1) {
    const cell = ws.getRow(catTotalRow).getCell(col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALE } };
    cell.font = { bold: true, size: 9.5 };
    cell.border = border;
    if (col > 1) cell.alignment = { horizontal: 'right' };
  }

  rowCursor += 2;
  ws.getCell(`A${rowCursor}`).value = 'PENDAPATAN PER METODE';
  ws.getCell(`A${rowCursor}`).font = { size: 10, bold: true, color: { argb: GREEN } };
  rowCursor += 1;
  headerRow(rowCursor, ['Metode', 'Transaksi', 'Pendapatan']);
  rowCursor += 1;
  for (const method of data.byMethod) {
    ws.getCell(`A${rowCursor}`).value = method.name;
    ws.getCell(`B${rowCursor}`).value = method.count;
    ws.getCell(`C${rowCursor}`).value = method.total;
    ws.getCell(`C${rowCursor}`).numFmt = CURRENCY;
    for (let col = 1; col <= 3; col += 1) {
      const cell = ws.getRow(rowCursor).getCell(col);
      cell.border = border;
      cell.font = { size: 9.5 };
      if (col > 1) cell.alignment = { horizontal: 'right' };
    }
    rowCursor += 1;
  }

  rowCursor += 2;
  ws.mergeCells(`A${rowCursor}:C${rowCursor}`);
  const footer = ws.getCell(`A${rowCursor}`);
  footer.value = `Dibuat otomatis oleh sistem ${APP.name} pada ${formatDateTimeID(new Date())}.`;
  footer.font = { size: 8, italic: true, color: { argb: MUTED } };

  // Transactions sheet
  const tx = wb.addWorksheet('Transaksi', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, margins: { left: 0.4, right: 0.4 } },
  });
  tx.columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'Invoice', key: 'invoice', width: 24 },
    { header: 'Tanggal Bayar', key: 'date', width: 16 },
    { header: 'Pelanggan', key: 'user', width: 24 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Program', key: 'program', width: 44 },
    { header: 'Kategori', key: 'category', width: 20 },
    { header: 'Metode', key: 'method', width: 24 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Total', key: 'total', width: 17 },
  ];

  const headerRowTx = tx.getRow(1);
  headerRowTx.height = 26;
  headerRowTx.eachCell((cell) => {
    cell.font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = border;
  });

  data.rows.forEach((row, index) => {
    const excelRow = tx.addRow({
      no: index + 1,
      invoice: row.invoice_no,
      date: formatDateID(row.paid_at, 'short'),
      user: row.user_name,
      email: row.user_email,
      program: row.program_title,
      category: categoryBy(row.category).label,
      method: PAYMENT_GROUP_LABEL[row.method] || '-',
      status: statusMeta(row.status).label,
      total: row.total,
    });
    excelRow.height = 20;
    excelRow.eachCell((cell, colNumber) => {
      cell.font = { size: 9.5 };
      cell.border = border;
      if (index % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBF8F1' } };
      }
      if (colNumber === 10) {
        cell.numFmt = CURRENCY;
        cell.alignment = { horizontal: 'right' };
        cell.font = { size: 9.5, bold: true };
      }
    });
  });

  const totalRowNo = data.rows.length + 2;
  tx.mergeCells(`A${totalRowNo}:I${totalRowNo}`);
  const totalLabel = tx.getCell(`A${totalRowNo}`);
  totalLabel.value = `TOTAL PENDAPATAN  •  ${data.summary.count} transaksi`;
  totalLabel.font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  totalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
  totalLabel.alignment = { vertical: 'middle', indent: 1 };
  const totalValue = tx.getCell(`J${totalRowNo}`);
  totalValue.value = data.summary.total;
  totalValue.numFmt = CURRENCY;
  totalValue.font = { size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  totalValue.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
  totalValue.alignment = { horizontal: 'right', vertical: 'middle' };
  tx.getRow(totalRowNo).height = 24;

  tx.autoFilter = { from: 'A1', to: 'J1' };

  const filename = `Laporan-Keuangan-Kelompok-4-${todayISO()}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

module.exports = {
  parseReportFilters,
  defaultFilters,
  getReport,
  getMonthlyRevenue,
  streamReportPdf,
  streamReportExcel,
};
