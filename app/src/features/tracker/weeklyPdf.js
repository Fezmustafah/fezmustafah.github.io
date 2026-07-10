// weeklyPdf.js — consolidated Weekly Statement PDF (jsPDF). Lists every daily
// invoice in the tracking period chronologically, with grand totals + VAT.
// Manual table drawing with pagination (avoids the autotable page-break
// background gotcha) so the header repeats cleanly on every page. Themed via
// settings.theme (classic navy/gold OR corporate minimal).
import {
  PAGE, newDoc, fill, stroke, ink, resolveTheme,
  drawHeader, drawTitle, drawSignature, drawFooter, drawLetterheadBg,
  partyBox, partyBodyHeight, PARTY_HEADER_H, tableHeadBand, totalBox, bankBox,
} from "./pdfShared.js";
import { money, dateShort, dateLong, invoiceNo, totals, extraLines } from "./format.js";

const COLS = { num: 18, inv: 24, date: 60, loc: 88, qtyR: 168, amtR: 196 };
const ROW_H = 7;

function tableHead(doc, T, y) {
  const { margin, w } = PAGE;
  return tableHeadBand(doc, T, margin, y, w - margin * 2, 8, [
    { text: "#", x: COLS.num, align: "center" },
    { text: "Invoice No", x: COLS.inv },
    { text: "Date", x: COLS.date },
    { text: "Location", x: COLS.loc },
    { text: "Qty", x: COLS.qtyR, align: "right" },
    { text: "Amount (AED)", x: COLS.amtR, align: "right" },
  ]);
}

export function buildWeekly({ rows, settings, periodStart, periodEnd, sig, letterhead, doc: sharedDoc }) {
  const { seller, buyer, vatRate } = settings;
  const T = resolveTheme(settings, letterhead);
  const c = T.c;
  const useLh = !!(letterhead && letterhead.dataUrl);
  const doc = sharedDoc || newDoc();
  const { w, margin } = PAGE;
  const rightX = w - margin;

  const bodyBottom = useLh ? PAGE.h - (letterhead.marginBottom || 20) - 6 : PAGE.h - 16;
  const contTop = useLh ? (letterhead.marginTop || 40) + 6 : 38; // table top on continuation pages
  const endPage = () => { if (!useLh) drawFooter(doc, seller, T); };
  const startContPage = () => {
    endPage();
    doc.addPage();
    if (useLh) drawLetterheadBg(doc, letterhead);
    else drawHeader(doc, seller, T);
    return tableHead(doc, T, contTop);
  };

  let titleY;
  if (useLh) {
    drawLetterheadBg(doc, letterhead);
    titleY = (letterhead.marginTop || 40) + 8;
  } else {
    drawHeader(doc, seller, T);
    titleY = 42;
  }
  drawTitle(doc, "WEEKLY STATEMENT", titleY, T);

  // period line — follows the title alignment (center, or left for graphite)
  ink(doc, c.text);
  doc.setFont(T.font.body, "normal").setFontSize(9.5);
  const periodText = `Period: ${dateShort(periodStart)} — ${dateShort(periodEnd)}`;
  if (T.layout && T.layout.title === "left") doc.text(periodText, margin, titleY + 8);
  else doc.text(periodText, w / 2, titleY + 8, { align: "center" });

  // ---- BOTH parties: seller + buyer boxes (matches the invoice) ----
  const boxW = 82;
  const gap = w - margin * 2 - boxW * 2;
  const rightBoxX = margin + boxW + gap;
  const boxY = titleY + 13;
  const sellerLines = [
    { text: seller.name, bold: true, size: 9.5 },
    { text: seller.address },
    { text: seller.phone },
    { text: seller.email },
    { text: `TRN: ${seller.trn}`, bold: true },
    ...extraLines(seller),
  ];
  const buyerLines = [
    { text: buyer.name, bold: true, size: 9.5 },
    { text: buyer.address ? buyer.address.replace(/\n/g, ", ") : "—" },
    { text: `Tel: ${buyer.phone}` },
    { text: `TRN: ${buyer.trn}`, bold: true },
    ...extraLines(buyer),
  ];
  const bodyH = Math.max(
    partyBodyHeight(doc, T, boxW, sellerLines),
    partyBodyHeight(doc, T, boxW, buyerLines),
  );
  partyBox(doc, T, margin, boxY, boxW, "FROM (SELLER)", sellerLines, bodyH);
  partyBox(doc, T, rightBoxX, boxY, boxW, "BILL TO (BUYER)", buyerLines, bodyH);

  let y = tableHead(doc, T, boxY + PARTY_HEADER_H + bodyH + 6);

  rows.forEach((r, i) => {
    // page break before a row that wouldn't fit
    if (y + ROW_H > bodyBottom) {
      y = startContPage();
    }
    if (i % 2 === 1) {
      fill(doc, c.panel);
      doc.rect(margin, y, w - margin * 2, ROW_H, "F");
    }
    ink(doc, c.text);
    doc.setFont(T.font.body, "normal").setFontSize(8);
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

  stroke(doc, T.minimal ? c.muted : c.primary);
  doc.setLineWidth(0.5);
  doc.line(margin, y, w - margin, y);

  // grand totals + signature stay on THIS page (statement is a one-pager).
  // The stamp/signature image shrinks into whatever space is left below the
  // GRAND TOTAL (never overlapping it), and the bank box is dropped when it
  // can't fit — the SoA-pack invoices still carry bank + sign in full.
  const t = totals(rows.map((r) => r.order), vatRate);
  const aspect = sig && sig.dataUrl ? sig.aspect || 0.45 : 0;
  const lineLimit = useLh ? PAGE.h - (letterhead.marginBottom || 20) - 8 : PAGE.h - 24;
  const minNeed = 31 + (aspect ? 22 * aspect + 9 : 18); // totals + smallest usable signature
  if (y + minNeed > lineLimit) {
    endPage();
    doc.addPage();
    if (useLh) drawLetterheadBg(doc, letterhead);
    else drawHeader(doc, seller, T);
    y = contTop;
  }
  let ty = y + 10;
  ink(doc, c.text);
  doc.setFont(T.font.body, "normal").setFontSize(9.5);
  doc.text("Subtotal", rightX - 55, ty);
  doc.text(`AED ${money(t.subtotal)}`, rightX, ty, { align: "right" });
  ty += 6;
  doc.text(`VAT (${vatRate}%)`, rightX - 55, ty);
  doc.text(`AED ${money(t.vat)}`, rightX, ty, { align: "right" });
  ty += 4;
  totalBox(doc, T, rightX - 80, ty, 80, 11, "GRAND TOTAL", `AED ${money(t.total)}`, 12);

  // stats line (left)
  const days = new Set(rows.map((r) => r.date)).size;
  ink(doc, T.minimal ? c.muted : c.primary);
  doc.setFont(T.font.body, "bold").setFontSize(8.5);
  doc.text(
    `Total Parcels: ${t.qty}    |    Total Invoices: ${rows.length}    |    Days: ${days}`,
    margin,
    ty + 6,
  );

  const totalsBottom = ty + 11; // bottom of the GRAND TOTAL box

  // signature (right column) — shrinks into the space left on this page
  const avail = lineLimit - totalsBottom - 6;
  const sigH = aspect ? Math.min(38 * aspect, avail) : 0;
  const sigLineY = aspect ? totalsBottom + 6 + sigH : Math.min(totalsBottom + 24, lineLimit);
  drawSignature(doc, sig, rightX, sigLineY, T, sigH || undefined);

  // beneficiary bank details (left column) — first thing to go when tight;
  // the SoA-pack invoices still print them in full
  const bank = seller.bank || {};
  const bankRows = ["bankName", "accountName", "accountNo", "iban", "swift"]
    .filter((k) => String(bank[k] || "").trim()).length;
  if (bankRows && ty + 12 + 10 + bankRows * 4.4 <= lineLimit + 4) {
    bankBox(doc, T, margin, ty + 12, 104, bank);
  }
  if (!useLh) drawFooter(doc, seller, T);
  return doc;
}

export function downloadWeekly(args) {
  const doc = buildWeekly(args);
  const start = args.periodStart.replace(/-/g, "");
  const end = args.periodEnd.replace(/-/g, "");
  doc.save(`BAM-Weekly-Statement-${start}-${end}.pdf`);
  return { fileName: dateLong(args.periodStart) };
}
