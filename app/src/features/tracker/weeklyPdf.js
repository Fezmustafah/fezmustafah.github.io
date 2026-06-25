// weeklyPdf.js — consolidated Weekly Statement PDF (jsPDF). Lists every daily
// invoice in the tracking period chronologically, with grand totals + VAT.
// Manual table drawing with pagination (avoids the autotable page-break
// background gotcha) so the navy header repeats cleanly on every page.
import {
  PAGE, C, newDoc, fill, stroke, ink,
  drawHeader, drawTitle, drawSignature, drawFooter,
} from "./pdfShared.js";
import { money, dateShort, dateLong, invoiceNo, totals } from "./format.js";

const COLS = { num: 18, inv: 24, date: 60, loc: 88, qtyR: 168, amtR: 196 };
const ROW_H = 7;
const BODY_BOTTOM = PAGE.h - 16; // keep clear of the footer bar

function tableHead(doc, y) {
  const { margin, w } = PAGE;
  fill(doc, C.navy);
  doc.rect(margin, y, w - margin * 2, 8, "F");
  ink(doc, C.white);
  doc.setFont("helvetica", "bold").setFontSize(8);
  doc.text("#", COLS.num, y + 5.3, { align: "center" });
  doc.text("Invoice No", COLS.inv, y + 5.3);
  doc.text("Date", COLS.date, y + 5.3);
  doc.text("Location", COLS.loc, y + 5.3);
  doc.text("Qty", COLS.qtyR, y + 5.3, { align: "right" });
  doc.text("Amount (AED)", COLS.amtR, y + 5.3, { align: "right" });
  stroke(doc, C.gold);
  doc.setLineWidth(0.6);
  doc.line(margin, y + 8, w - margin, y + 8);
  return y + 8;
}

export function buildWeekly({ rows, settings, periodStart, periodEnd, sig }) {
  const { seller, buyer, item } = settings;
  const doc = newDoc();
  const { w, margin } = PAGE;
  const rightX = w - margin;

  drawHeader(doc, seller);
  drawTitle(doc, "WEEKLY STATEMENT", 42);

  ink(doc, C.text);
  doc.setFont("helvetica", "normal").setFontSize(9.5);
  doc.text(`Period: ${dateShort(periodStart)} — ${dateShort(periodEnd)}`, w / 2, 50, { align: "center" });
  ink(doc, C.navy);
  doc.setFont("helvetica", "bold").setFontSize(9.5);
  doc.text(`${buyer.name}     TRN: ${buyer.trn}`, w / 2, 56, { align: "center" });
  if (buyer.address) {
    ink(doc, C.muted);
    doc.setFont("helvetica", "normal").setFontSize(8);
    doc.text(buyer.address.replace(/\n/g, ", "), w / 2, 61, { align: "center" });
  }

  let y = tableHead(doc, 66);

  rows.forEach((r, i) => {
    // page break before a row that wouldn't fit
    if (y + ROW_H > BODY_BOTTOM) {
      drawFooter(doc, seller);
      doc.addPage();
      drawHeader(doc, seller);
      y = tableHead(doc, 38);
    }
    if (i % 2 === 1) {
      fill(doc, C.cream);
      doc.rect(margin, y, w - margin * 2, ROW_H, "F");
    }
    ink(doc, C.text);
    doc.setFont("helvetica", "normal").setFontSize(8);
    const by = y + 4.8;
    doc.text(String(i + 1), COLS.num, by, { align: "center" });
    doc.text(invoiceNo(r.date, r.index), COLS.inv, by);
    doc.text(dateShort(r.date), COLS.date, by);
    const loc = doc.splitTextToSize(r.order.location || "—", COLS.qtyR - COLS.loc - 6)[0];
    doc.text(loc, COLS.loc, by);
    doc.text(String(r.order.qty), COLS.qtyR, by, { align: "right" });
    doc.text(money(r.order.amount), COLS.amtR, by, { align: "right" });
    y += ROW_H;
  });

  stroke(doc, C.navy);
  doc.setLineWidth(0.5);
  doc.line(margin, y, w - margin, y);

  // grand totals — push to a fresh page if there isn't room
  const t = totals(rows.map((r) => r.order), item.vatRate);
  if (y + 48 > BODY_BOTTOM) {
    drawFooter(doc, seller);
    doc.addPage();
    drawHeader(doc, seller);
    y = 40;
  }
  let ty = y + 10;
  ink(doc, C.text);
  doc.setFont("helvetica", "normal").setFontSize(9.5);
  doc.text("Subtotal", rightX - 55, ty);
  doc.text(`AED ${money(t.subtotal)}`, rightX, ty, { align: "right" });
  ty += 6;
  doc.text(`VAT (${item.vatRate}%)`, rightX - 55, ty);
  doc.text(`AED ${money(t.vat)}`, rightX, ty, { align: "right" });
  ty += 4;
  fill(doc, C.navy);
  doc.roundedRect(rightX - 80, ty, 80, 11, 1.5, 1.5, "F");
  ink(doc, C.white);
  doc.setFont("helvetica", "bold").setFontSize(12);
  doc.text("GRAND TOTAL", rightX - 76, ty + 7.2);
  doc.text(`AED ${money(t.total)}`, rightX - 4, ty + 7.2, { align: "right" });

  // stats line (left)
  const days = new Set(rows.map((r) => r.date)).size;
  ink(doc, C.navy);
  doc.setFont("helvetica", "bold").setFontSize(8.5);
  doc.text(
    `Total Parcels: ${t.qty}    |    Total Invoices: ${rows.length}    |    Days: ${days}`,
    margin,
    ty + 6,
  );

  drawSignature(doc, sig, rightX, Math.min(ty + 34, PAGE.h - 24));
  drawFooter(doc, seller);
  return doc;
}

export function downloadWeekly(args) {
  const doc = buildWeekly(args);
  const start = args.periodStart.replace(/-/g, "");
  const end = args.periodEnd.replace(/-/g, "");
  doc.save(`BAM-Weekly-Statement-${start}-${end}.pdf`);
  return { fileName: dateLong(args.periodStart) };
}
