// invoicePdf.js — single tax-invoice PDF for one delivery (jsPDF).
// Themed via settings.theme (classic navy/gold OR corporate minimal). A4, all
// measurements in mm. No autotable — the items table is drawn by hand so the
// styling tracks the weekly statement and the active theme.
import {
  PAGE, newDoc, fill, stroke, ink, getTheme,
  drawHeader, drawTitle, drawSignature, drawFooter, drawLetterheadBg,
  partyBox, tableHeadBand, totalBox, moneyRow,
} from "./pdfShared.js";
import { money, dateLong, invoiceNo, totals, orderLines } from "./format.js";

export function buildInvoice({ order, date, index, settings, sig, letterhead }) {
  const { seller, buyer, vatRate } = settings;
  const T = getTheme(settings.theme);
  const c = T.c;
  const useLh = !!(letterhead && letterhead.dataUrl);
  const doc = newDoc();
  const { w, margin } = PAGE;
  const rightX = w - margin;

  // header: built-in drawn header, OR the user's letterhead as background
  let titleY;
  if (useLh) {
    drawLetterheadBg(doc, letterhead);
    titleY = (letterhead.marginTop || 40) + 8; // start below the letterhead's own header
  } else {
    drawHeader(doc, seller, T);
    titleY = 42;
  }

  // title
  drawTitle(doc, "TAX INVOICE", titleY, T);

  // meta row
  const metaY = titleY + 11;
  ink(doc, c.text);
  doc.setFont(T.font.body, "bold").setFontSize(9.5);
  doc.text(`Invoice No: ${invoiceNo(date, index)}`, margin, metaY);
  doc.setFont(T.font.body, "normal");
  doc.text(`Date: ${dateLong(date)}`, rightX, metaY, { align: "right" });

  // party boxes — BOTH parties shown (seller + buyer)
  const boxW = 82;
  const gap = w - margin * 2 - boxW * 2; // remaining space becomes the gutter
  const leftX = margin;
  const rightBoxX = margin + boxW + gap;
  const boxY = titleY + 16;
  partyBox(doc, T, leftX, boxY, boxW, "FROM (SELLER)", [
    { text: seller.name, bold: true, size: 9.5 },
    // seller.nameAr is intentionally not drawn: jsPDF's built-in fonts can't
    // render Arabic glyphs (would print as mojibake).
    { text: seller.address },
    { text: seller.phone },
    { text: seller.email },
    { text: `TRN: ${seller.trn}`, bold: true },
  ]);
  partyBox(doc, T, rightBoxX, boxY, boxW, "BILL TO (BUYER)", [
    { text: buyer.name, bold: true, size: 9.5 },
    { text: buyer.address || "—" },
    { text: `Tel: ${buyer.phone}` },
    { text: `TRN: ${buyer.trn}`, bold: true },
  ]);

  // ---- delivery site band (the supply location for THIS delivery) ----
  const bandY = boxY + 7 + 36 + 6; // just below the two party boxes
  if (T.minimal) {
    ink(doc, c.muted);
    doc.setFont(T.font.body, "bold").setFontSize(8);
    doc.text("DELIVERY SITE", margin, bandY + 5.7);
    ink(doc, c.text);
    doc.setFont(T.font.body, "bold").setFontSize(10);
    doc.text(order.location || "—", margin + 35, bandY + 5.9);
    stroke(doc, c.panelEdge);
    doc.setLineWidth(0.3);
    doc.line(margin, bandY + 9, w - margin, bandY + 9);
  } else {
    fill(doc, c.panel);
    stroke(doc, c.panelEdge);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, bandY, w - margin * 2, 9, 1.5, 1.5, "FD");
    fill(doc, c.accent);
    doc.rect(margin, bandY, 1.6, 9, "F"); // gold accent edge
    ink(doc, c.primary);
    doc.setFont("helvetica", "bold").setFontSize(8);
    doc.text("DELIVERY SITE", margin + 5, bandY + 5.7);
    ink(doc, c.text);
    doc.setFont("helvetica", "bold").setFontSize(10);
    doc.text(order.location || "—", margin + 35, bandY + 5.9);
  }

  // ---- items table ----
  const tableTop = bandY + 9 + 6; // below the delivery band
  const tableW = w - margin * 2;
  const qtyR = 126, unitR = 162, amtR = rightX;

  tableHeadBand(doc, T, margin, tableTop, tableW, 8, [
    { text: "#", x: margin + 4 },
    { text: "Description", x: margin + 14 },
    { text: "Qty", x: qtyR, align: "right" },
    { text: "Unit Price (AED)", x: unitR, align: "right" },
    { text: "Amount (AED)", x: amtR, align: "right" },
  ]);

  // one row per line item
  const lns = orderLines(order);
  const rowH = 8;
  const rowsTop = tableTop + 8;
  lns.forEach((l, i) => {
    const ry = rowsTop + i * rowH;
    if (i % 2 === 1) {
      fill(doc, c.panel);
      doc.rect(margin, ry, tableW, rowH, "F");
    }
    ink(doc, c.text);
    doc.setFont(T.font.body, "normal").setFontSize(9);
    const by = ry + 5.6;
    doc.text(String(i + 1), margin + 4, by);
    doc.text(l.item || "", margin + 14, by);
    doc.text(String(l.qty), qtyR, by, { align: "right" });
    doc.text(money(l.unitPrice), unitR, by, { align: "right" });
    doc.text(money(l.amount ?? l.qty * l.unitPrice), amtR, by, { align: "right" });
  });

  const tableBottom = rowsTop + lns.length * rowH;
  stroke(doc, T.minimal ? c.muted : c.primary);
  doc.setLineWidth(0.5);
  doc.line(margin, tableBottom, w - margin, tableBottom);

  // ---- totals ----
  const t = totals([order], vatRate);
  let ty = tableBottom + 9;
  moneyRow(doc, "Subtotal", t.subtotal, rightX, ty, { color: c.text, font: T.font.body });
  ty += 6;
  moneyRow(doc, `VAT (${vatRate}%)`, t.vat, rightX, ty, { color: c.text, font: T.font.body });
  ty += 3;
  if (!T.minimal) {
    stroke(doc, c.primary);
    doc.setLineWidth(0.4);
    doc.line(rightX - 70, ty, rightX, ty);
  }
  ty += 4;
  totalBox(doc, T, rightX - 70, ty, 70, 10, "TOTAL", `AED ${money(t.total)}`, 11);

  // quantity summary (left, aligned with the TOTAL box)
  ink(doc, T.minimal ? c.muted : c.primary);
  doc.setFont(T.font.body, "bold").setFontSize(8);
  doc.text(`Total Quantity Supplied: ${t.qty} Parcels`, margin, ty + 6.6);

  // ---- terms ----
  const termsY = ty + 22;
  ink(doc, c.muted);
  doc.setFont(T.font.body, "normal").setFontSize(7.5);
  doc.text("All amounts are in AED (United Arab Emirates Dirham), inclusive of 5% VAT where applicable.", margin, termsY);
  doc.text("This is a computer-generated tax invoice and is valid without a physical signature.", margin, termsY + 4);
  doc.text("Payment due on receipt. Thank you for your business.", margin, termsY + 8);

  // ---- signature + footer ----
  // on a letterhead, sit the signature above the letterhead's own footer zone
  // and skip our drawn footer bar (the letterhead supplies it).
  const sigLineY = useLh
    ? PAGE.h - (letterhead.marginBottom || 20) - 8
    : Math.min(termsY + 30, PAGE.h - 24);
  drawSignature(doc, sig, rightX, sigLineY, T);
  if (!useLh) drawFooter(doc, seller, T);

  return doc;
}

export function downloadInvoice(args) {
  const doc = buildInvoice(args);
  doc.save(`${invoiceNo(args.date, args.index)}.pdf`);
}
