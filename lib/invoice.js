const PDFDocument = require('pdfkit');
const { APP, PAYMENT_GROUP_LABEL } = require('./constants');
const {
  formatRupiah,
  formatDateID,
  formatDateTimeID,
  addDays,
  toISODate,
  parseDate,
  statusMeta,
  modeLabel,
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
  danger: '#B7443B',
  mint: '#EAF3ED',
  pale: '#CFE3DA',
};

function streamInvoicePdf(res, order, { download = false } = {}) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    bufferPages: true,
    info: {
      Title: `Invoice ${order.invoice_no} — ${APP.name}`,
      Author: APP.name,
      Subject: `Invoice untuk ${order.user_name}`,
    },
  });

  const filename = `Invoice-${order.invoice_no.replace(/\//g, '-')}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${filename}"`);
  doc.pipe(res);

  const W = doc.page.width;
  const H = doc.page.height;
  const M = 48;
  const CW = W - M * 2;

  const isPaid = order.status === 'paid' || order.status === 'completed';
  const isCancelled = order.status === 'cancelled';
  const statusMain = isCancelled ? 'DIBATALKAN' : isPaid ? 'LUNAS' : 'BELUM DIBAYAR';
  const statusTone = isCancelled ? C.danger : isPaid ? C.forestSoft : C.amber;
  const dueDate = addDays(toISODate(parseDate(order.created_at)), 7);

  // Header band
  doc.save();
  doc.rect(0, 0, W, 124).fill(C.forest);
  doc.fillOpacity(0.13);
  doc.circle(W - 10, 4, 96).fill(C.amber);
  doc.fillOpacity(0.08);
  doc.circle(W - 90, 30, 56).fill(C.white);
  doc.restore();

  doc.roundedRect(M, 39, 35, 35, 10).fill(C.amber);
  doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(21).text('4', M, 47, { width: 35, align: 'center' });
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(19).text(APP.name, M + 47, 41);
  doc
    .fillColor(C.pale)
    .font('Helvetica')
    .fontSize(8)
    .text(APP.tagline.toUpperCase(), M + 47, 67, { characterSpacing: 1.1 });

  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(22).text('INVOICE', M, 42, { width: CW, align: 'right' });
  doc
    .fillColor(C.pale)
    .font('Helvetica')
    .fontSize(9)
    .text(order.invoice_no, M, 72, { width: CW, align: 'right' });
  doc.fillColor(C.amber).rect(0, 124, W, 4).fill();

  // Bill to
  let y = 158;
  doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(7).text('DITAGIHKAN KEPADA', M, y, { characterSpacing: 0.8 });
  doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(12).text(order.user_name, M, y + 13, { width: 250 });
  doc.fillColor(C.muted).font('Helvetica').fontSize(9);
  doc.text(order.user_email, M, y + 31, { width: 250 });
  doc.text(order.user_phone || '-', M, y + 43, { width: 250 });

  // Meta
  const metaX = W - M - 174;
  const metaW = 174;
  const metaRow = (label, value, rowY) => {
    doc.fillColor(C.muted).font('Helvetica').fontSize(8).text(label, metaX, rowY, { width: metaW, align: 'left' });
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(9).text(value, metaX, rowY, { width: metaW, align: 'right' });
  };
  metaRow('Tanggal terbit', formatDateID(order.created_at, 'short'), 156);
  metaRow('Jatuh tempo', formatDateID(dueDate, 'short'), 173);
  metaRow('Kode pesanan', order.code, 190);

  const pillText = statusMain;
  doc.font('Helvetica-Bold').fontSize(7.5);
  const pillW = Math.max(112, doc.widthOfString(pillText) + 26);
  doc.roundedRect(W - M - pillW, 210, pillW, 22, 11).fill(statusTone);
  doc.fillColor(C.white).fontSize(7.5).text(pillText, W - M - pillW, 217, {
    width: pillW,
    align: 'center',
    characterSpacing: 0.7,
  });

  doc.moveTo(M, 250).lineTo(W - M, 250).lineWidth(1).strokeColor(C.line).stroke();

  // Order item
  doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(7).text('DETAIL PESANAN', M, 268, { characterSpacing: 0.8 });
  doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(13).text(order.program_title, M, 282, { width: 330, ellipsis: true });
  doc
    .fillColor(C.muted)
    .font('Helvetica')
    .fontSize(8.5)
    .text(`${order.tutor_name}  •  ${modeLabel(order.mode)}  •  ${order.level}`, M, 301, { width: 330 });
  doc.text(
    `Jadwal mulai ${formatDateID(order.start_date, 'short')}, pukul ${order.time_slot}`,
    M,
    314,
    { width: 330 }
  );

  // Table header
  const tableY = 336;
  doc.rect(M, tableY, CW, 26).fill(C.forest);
  const hy = tableY + 9;
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(7.2);
  doc.text('DESKRIPSI', M + 12, hy, { characterSpacing: 0.7 });
  doc.text('SESI', 300, hy, { width: 52, align: 'right', characterSpacing: 0.7 });
  doc.text('HARGA / SESI', 362, hy, { width: 72, align: 'right', characterSpacing: 0.7 });
  doc.text('JUMLAH', 452, hy, { width: 82, align: 'right', characterSpacing: 0.7 });

  // Table row
  const rowY = tableY + 26;
  const rowH = 64;
  doc.rect(M, rowY, CW, rowH).fill(C.cream);
  doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(10).text(order.program_title, M + 12, rowY + 13, { width: 270 });
  doc
    .fillColor(C.muted)
    .font('Helvetica')
    .fontSize(8)
    .text(`${order.tutor_name} • ${order.level}`, M + 12, rowY + 30, { width: 270 });
  doc.text(`Mulai ${formatDateID(order.start_date, 'short')} • ${order.time_slot}`, M + 12, rowY + 43, { width: 270 });

  doc.fillColor(C.ink).font('Helvetica').fontSize(9);
  doc.text(`${order.sessions} sesi`, 300, rowY + 28, { width: 52, align: 'right' });
  doc.text(formatRupiah(order.price), 362, rowY + 28, { width: 72, align: 'right' });
  doc.font('Helvetica-Bold').text(formatRupiah(order.subtotal), 452, rowY + 28, { width: 82, align: 'right' });

  doc.moveTo(M, rowY + rowH).lineTo(W - M, rowY + rowH).strokeColor(C.line).lineWidth(0.8).stroke();

  // Payment info box
  const boxY = rowY + rowH + 20;
  const boxW = 250;
  const boxH = 106;
  doc.roundedRect(M, boxY, boxW, boxH, 10).fill('#FBF7EE');
  doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(7).text('INFORMASI PEMBAYARAN', M + 14, boxY + 14, { characterSpacing: 0.8 });

  if (isPaid) {
    const methodLabel = PAYMENT_GROUP_LABEL[order.method] || order.method || '-';
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(9.5).text(methodLabel, M + 14, boxY + 30, { width: boxW - 28 });
    doc.fillColor(C.muted).font('Helvetica').fontSize(7.5);
    doc.text(`Referensi: ${order.payment_ref || '-'}`, M + 14, boxY + 48, { width: boxW - 28 });
    doc.text(`Dibayar pada: ${formatDateTimeID(order.paid_at)}`, M + 14, boxY + 62, { width: boxW - 28 });
    doc.fillColor(C.forestSoft).font('Helvetica-Bold').fontSize(8).text('Pembayaran terverifikasi', M + 14, boxY + 80);
  } else if (isCancelled) {
    doc.fillColor(C.danger).font('Helvetica-Bold').fontSize(9.5).text('Pesanan dibatalkan', M + 14, boxY + 32);
    doc.fillColor(C.muted).font('Helvetica').fontSize(7.5).text('Tidak ada tagihan aktif untuk pesanan ini.', M + 14, boxY + 50, {
      width: boxW - 28,
    });
  } else {
    doc.fillColor(C.amber).font('Helvetica-Bold').fontSize(9.5).text('Menunggu pembayaran', M + 14, boxY + 32);
    doc.fillColor(C.muted).font('Helvetica').fontSize(7.5).text(`Selesaikan sebelum ${formatDateID(dueDate, 'short')}.`, M + 14, boxY + 50, {
      width: boxW - 28,
    });
    doc.text(`Buka halaman pesanan di portal ${APP.name} untuk melanjutkan pembayaran.`, M + 14, boxY + 64, {
      width: boxW - 28,
    });
  }

  // Totals
  const totalsX = 320;
  const totalsW = W - M - totalsX;
  const totalRows = [['Subtotal', formatRupiah(order.subtotal)]];
  if (order.discount > 0) {
    const pct = Math.round((order.discount / order.subtotal) * 100);
    totalRows.push([`Diskon paket (${pct}%)`, `− ${formatRupiah(order.discount)}`]);
  }
  totalRows.push(['Biaya layanan', formatRupiah(order.fee)]);

  let ty = boxY + 4;
  for (const [label, value] of totalRows) {
    doc.fillColor(C.muted).font('Helvetica').fontSize(9).text(label, totalsX, ty + 6, { width: 110 });
    doc.fillColor(C.ink).font('Helvetica').fontSize(9).text(value, totalsX, ty + 6, { width: totalsW, align: 'right' });
    ty += 20;
  }

  const lineY = ty + 6;
  doc.moveTo(totalsX, lineY).lineTo(W - M, lineY).strokeColor(C.line).lineWidth(0.8).stroke();

  const totalBarY = lineY + 8;
  doc.roundedRect(totalsX, totalBarY, totalsW, 36, 8).fill(C.forest);
  doc.fillColor(C.pale).font('Helvetica-Bold').fontSize(8).text('TOTAL TAGIHAN', totalsX + 14, totalBarY + 14, {
    characterSpacing: 0.6,
  });
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(12.5).text(formatRupiah(order.total), totalsX + 14, totalBarY + 10, {
    width: totalsW - 28,
    align: 'right',
  });

  // Notes
  let noteY = Math.max(boxY + boxH, totalBarY + 36) + 24;
  if (order.notes) {
    doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(7).text('CATATAN PESANAN', M, noteY, { characterSpacing: 0.8 });
    doc.fillColor(C.ink).font('Helvetica').fontSize(8).text(order.notes, M, noteY + 12, {
      width: CW,
      height: 34,
      ellipsis: true,
      lineGap: 2,
    });
  }

  // Footer
  const footerY = H - 84;
  doc.moveTo(M, footerY).lineTo(W - M, footerY).strokeColor(C.line).lineWidth(0.8).stroke();
  doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(8.5).text(`${APP.name} — ${APP.tagline}`, M, footerY + 14);
  doc.fillColor(C.muted).font('Helvetica').fontSize(7.5).text(`${APP.address}  •  ${APP.email}  •  ${APP.phone}`, M, footerY + 27, {
    width: 380,
  });
  doc.fillColor(C.muted).font('Helvetica').fontSize(7.5).text(order.invoice_no, M, footerY + 14, {
    width: CW,
    align: 'right',
  });
  doc.text(`Dokumen dibuat otomatis oleh sistem ${APP.name}.`, M, footerY + 27, { width: CW, align: 'right' });

  doc
    .fillColor('#9AA69F')
    .font('Helvetica')
    .fontSize(6.8)
    .text(
      'Pembayaran pada lingkungan demo diproses melalui gateway simulasi. Tidak ada transaksi dana nyata.',
      M,
      H - 32,
      { width: CW, align: 'center' }
    );

  doc.end();
}

module.exports = { streamInvoicePdf };
