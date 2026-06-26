// invoicePdf.js — single tax-invoice PDF for one delivery (jsPDF).
// Navy/gold theme, A4, all measurements in mm. No autotable — the one-row
// items table is drawn by hand so the styling matches the weekly statement.
import {
  PAGE, C, newDoc, fill, stroke, ink,
  drawHeader, drawTitle, drawSignature, drawFooter, drawLetterheadBg, moneyRow,
} from "./pdfShared.js";
import { money, dateLong, invoiceNo, totals } from "./format.js";

function partyBox(doc, x, y, w, title, lines) {
  const headerH = 7;
  const bodyH = 36;
  // navy header bar
  fill(doc, C.navy);
  doc.roundedRect(x, y, w, headerH, 1.5, 1.5, "F");
  ink(doc, C.white);
  doc.setFont("helvetica", "bold").setFontSize(8.5);
  doc.text(title, x + 4, y + 4.8);
  // cream body
  fill(doc, C.cream);
  stroke(doc, C.creamDark);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y + headerH, w, bodyH, 1.5, 1.5, "FD");

  let ly = y + headerH + 6;
  for (const ln of lines) {
    if (!ln || !ln.text) continue;
    ink(doc, ln.gold ? C.navy : C.text);
    doc.setFont("helvetica", ln.bold ? "bold" : "normal").setFontSize(ln.size || 8.5);
    const wrapped = doc.splitTextToSize(ln.text, w - 8);
    doc.text(wrapped, x + 4, ly);
    ly += wrapped.length * (ln.size ? ln.size * 0.45 : 4.1);
  }
  return y + headerH + bodyH;
}

export function buildInvoice({ order, date, index, settings, sig, letterhead }) {
  const { seller, buyer, vatRate } = settings;
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
    drawHeader(doc, seller);
    titleY = 42;
  }

  // title
  drawTitle(doc, "TAX INVOICE", titleY);

  // meta row
  const metaY = titleY + 11;
  ink(doc, C.text);
  doc.setFont("helvetica", "bold").setFontSize(9.5);
  doc.text(`Invoice No: ${invoiceNo(date, index)}`, margin, metaY);
  doc.setFont("helvetica", "normal");
  doc.text(`Date: ${dateLong(date)}`, rightX, metaY, { align: "right" });

  // party boxes
  const boxW = 82;
  const gap = w - margin * 2 - boxW * 2; // remaining space becomes the gutter
  const leftX = margin;
  const rightBoxX = margin + boxW + gap;
  const boxY = titleY + 16;
  partyBox(doc, leftX, boxY, boxW, "FROM (SELLER)", [
    { text: seller.name, bold: true, size: 9.5 },
    // seller.nameAr is intentionally not drawn: jsPDF's built-in Helvetica
    // can't render Arabic glyphs (would print as mojibake).
    { text: seller.address },
    { text: seller.phone },
    { text: seller.email },
    { text: `TRN: ${seller.trn}`, bold: true },
  ]);
  partyBox(doc, rightBoxX, boxY, boxW, "BILL TO (BUYER)", [
    { text: buyer.name, bold: true, size: 9.5 },
    { text: buyer.address || "—" },
    { text: `Tel: ${buyer.phone}` },
    { text: `TRN: ${buyer.trn}`, bold: true },
  ]);

  // ---- delivery site band (the supply location for THIS delivery) ----
  const bandY = boxY + 7 + 36 + 6; // just below the two party boxes
  fill(doc, C.cream);
  stroke(doc, C.creamDark);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, bandY, w - margin * 2, 9, 1.5, 1.5, "FD");
  fill(doc, C.gold);
  doc.rect(margin, bandY, 1.6, 9, "F"); // gold accent edge
  ink(doc, C.navy);
  doc.setFont("helvetica", "bold").setFontSize(8);
  doc.text("DELIVERY SITE", margin + 5, bandY + 5.7);
  ink(doc, C.text);
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text(order.location || "—", margin + 35, bandY + 5.9);

  // ---- items table ----
  const tableTop = bandY + 9 + 6; // below the delivery band
  const tableW = w - margin * 2;
  const qtyR = 126, unitR = 162, amtR = rightX;

  fill(doc, C.navy);
  doc.rect(margin, tableTop, tableW, 8, "F");
  ink(doc, C.white);
  doc.setFont("helvetica", "bold").setFontSize(8.5);
  doc.text("#", margin + 4, tableTop + 5.3);
  doc.text("Description", margin + 14, tableTop + 5.3);
  doc.text("Qty", qtyR, tableTop + 5.3, { align: "right" });
  doc.text("Unit Price (AED)", unitR, tableTop + 5.3, { align: "right" });
  doc.text("Amount (AED)", amtR, tableTop + 5.3, { align: "right" });

  stroke(doc, C.gold);
  doc.setLineWidth(0.6);
  doc.line(margin, tableTop + 8, w - margin, tableTop + 8);

  const rowY = tableTop + 8;
  ink(doc, C.text);
  doc.setFont("helvetica", "normal").setFontSize(9);
  doc.text("1", margin + 4, rowY + 6);
  doc.text(order.item || "", margin + 14, rowY + 6);
  doc.text(String(order.qty), qtyR, rowY + 6, { align: "right" });
  doc.text(money(order.unitPrice), unitR, rowY + 6, { align: "right" });
  doc.text(money(order.amount), amtR, rowY + 6, { align: "right" });

  stroke(doc, C.navy);
  doc.setLineWidth(0.5);
  doc.line(margin, rowY + 9, w - margin, rowY + 9);

  // ---- totals ----
  const t = totals([order], vatRate);
  let ty = rowY + 18;
  moneyRow(doc, "Subtotal", t.subtotal, rightX, ty);
  ty += 6;
  moneyRow(doc, `VAT (${vatRate}%)`, t.vat, rightX, ty);
  ty += 3;
  stroke(doc, C.navy);
  doc.setLineWidth(0.4);
  doc.line(rightX - 70, ty, rightX, ty);
  ty += 4;
  fill(doc, C.navy);
  doc.roundedRect(rightX - 70, ty, 70, 10, 1.5, 1.5, "F");
  ink(doc, C.white);
  doc.setFont("helvetica", "bold").setFontSize(11);
  doc.text("TOTAL", rightX - 66, ty + 6.6);
  doc.text(`AED ${money(t.total)}`, rightX - 4, ty + 6.6, { align: "right" });

  // quantity summary (left, aligned with totals block)
  ink(doc, C.navy);
  doc.setFont("helvetica", "bold").setFontSize(8);
  doc.text(`Total Quantity Supplied: ${t.qty} Parcels`, margin, rowY + 24);

  // ---- terms ----
  const termsY = ty + 22;
  ink(doc, C.muted);
  doc.setFont("helvetica", "normal").setFontSize(7.5);
  doc.text("All amounts are in AED (United Arab Emirates Dirham), inclusive of 5% VAT where applicable.", margin, termsY);
  doc.text("This is a computer-generated tax invoice and is valid without a physical signature.", margin, termsY + 4);
  doc.text("Payment due on receipt. Thank you for your business.", margin, termsY + 8);

  // ---- signature + footer ----
  // on a letterhead, sit the signature above the letterhead's own footer zone
  // and skip our drawn footer bar (the letterhead supplies it).
  const sigLineY = useLh
    ? PAGE.h - (letterhead.marginBottom || 20) - 8
    : Math.min(termsY + 30, PAGE.h - 24);
  drawSignature(doc, sig, rightX, sigLineY);
  if (!useLh) drawFooter(doc, seller);

  return doc;
}

export function downloadInvoice(args) {
  const doc = buildInvoice(args);
  doc.save(`${invoiceNo(args.date, args.index)}.pdf`);
}
