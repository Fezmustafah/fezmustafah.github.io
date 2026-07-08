// vendorPdf.js — Vendor "Statement of Account" PDF, rendered on the user's saved
// letterhead. Self-contained (jsPDF only; no cross-feature imports) so the
// Vendor tool shares nothing with the tracker or the document generator.
//
// Layout: letterhead image as full-page background (repeated on every page),
// content inside the letterhead's safe zone, a Date/Description/Debit/Credit/
// Running-Balance ledger table, then a reconciliation band with the NET.
import { jsPDF } from "jspdf";
import { ledgerRows } from "./netting.js";

const PW = 210, PH = 297;

function money(n) {
  return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function hexToRgb(hex) {
  const h = String(hex || "#1F4E8C").replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const i = parseInt(n || "1f4e8c", 16);
  return [(i >> 16) & 255, (i >> 8) & 255, i & 255];
}
function drawLetterheadBg(doc, lh) {
  if (!lh || !lh.dataUrl) return;
  let fmt = "JPEG";
  const m = /^data:image\/([a-z0-9+]+)/i.exec(lh.dataUrl);
  if (m) fmt = m[1].toUpperCase() === "PNG" ? "PNG" : "JPEG";
  try { doc.addImage(lh.dataUrl, fmt, 0, 0, PW, PH, undefined, "FAST"); } catch {}
}
// running balance from OUR perspective: >0 they owe us (Dr), <0 we owe them (Cr).
const bal = (n) => `${money(Math.abs(n))} ${n < 0 ? "Cr" : "Dr"}`;

/**
 * @param {Object} a
 *   vendor      { name }
 *   periodLabel "September 2026"
 *   openingBalance number
 *   lines       signed AR/AP lines (see netting.js)
 *   summary     computeNet(...) result
 *   letterhead  { dataUrl, marginTop, marginBottom, marginSide, accent }
 *   seller      optional { name } printed as the issuer
 *   currency    "AED"
 */
export function buildVendorStatement(a) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const lh = a.letterhead || {};
  const mSide = Number(lh.marginSide) || 18;
  const mTop = Number(lh.marginTop) || 46;
  const mBottom = Number(lh.marginBottom) || 24;
  const accent = hexToRgb(lh.accent || "#1F4E8C");
  const NAVY = [31, 41, 60], MUTED = [110, 110, 118], RED = [192, 57, 43], WHITE = [255, 255, 255];
  const cur = a.currency || "AED";

  const left = mSide;
  const right = PW - mSide;
  const cw = right - left;
  // columns: Date | Description | Debit | Credit | Balance
  const cDate = left;
  const cBalR = right; // right edge of balance
  const wBal = 30, wCredit = 26, wDebit = 26;
  const cBalX = right; // right-aligned
  const cCreditX = right - wBal;
  const cDebitX = cCreditX - wCredit;
  const cDescX = cDate + 24;
  const descW = cDebitX - wDebit - cDescX - 2;

  let y = mTop;

  function bg() { drawLetterheadBg(doc, lh); }
  function tableHead(yy) {
    doc.setFillColor(...accent);
    doc.rect(left, yy, cw, 7, "F");
    doc.setTextColor(...WHITE).setFont("helvetica", "bold").setFontSize(8.5);
    doc.text("DATE", cDate + 1, yy + 4.8);
    doc.text("DESCRIPTION", cDescX, yy + 4.8);
    doc.text("DEBIT", cDebitX, yy + 4.8, { align: "right" });
    doc.text("CREDIT", cCreditX, yy + 4.8, { align: "right" });
    doc.text("BALANCE", cBalX, yy + 4.8, { align: "right" });
    return yy + 7;
  }

  bg();

  // ---- title ----
  doc.setTextColor(...accent).setFont("helvetica", "bold").setFontSize(18);
  doc.text("STATEMENT OF ACCOUNT", PW / 2, y, { align: "center" });
  doc.setDrawColor(...accent).setLineWidth(0.5);
  doc.line(PW / 2 - 34, y + 2.5, PW / 2 + 34, y + 2.5);
  y += 9;

  // ---- account / period meta ----
  doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(...NAVY);
  doc.text(`Account: ${a.vendor?.name || "Vendor"}`, left, y);
  doc.text(`Period: ${a.periodLabel || ""}`, right, y, { align: "right" });
  y += 5;
  doc.setTextColor(...MUTED).setFontSize(8.5);
  if (a.seller?.name) doc.text(`Issued by: ${a.seller.name}`, left, y);
  doc.text(`Currency: ${cur}`, right, y, { align: "right" });
  y += 6;

  // ---- table ----
  const rows = ledgerRows(a.lines || [], Number(a.openingBalance) || 0);
  y = tableHead(y);
  const rowH = 6;
  const pageBottom = PH - mBottom - 2;

  doc.setFont("helvetica", "normal").setFontSize(8.5);
  rows.forEach((r, i) => {
    if (y + rowH > pageBottom) {
      doc.addPage();
      bg();
      y = mTop;
      y = tableHead(y);
      doc.setFont("helvetica", "normal").setFontSize(8.5);
    }
    if (i % 2 === 1) {
      doc.setFillColor(244, 246, 250);
      doc.rect(left, y, cw, rowH, "F");
    }
    doc.setTextColor(...NAVY);
    doc.text(String(r.date || ""), cDate + 1, y + 4);
    const desc = doc.splitTextToSize(String(r.label || ""), descW)[0] || "";
    doc.text(desc, cDescX, y + 4);
    if (r.debit) doc.text(money(r.debit), cDebitX, y + 4, { align: "right" });
    if (r.credit) doc.text(money(r.credit), cCreditX, y + 4, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(bal(r.running), cBalX, y + 4, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += rowH;
  });

  // divider under table
  doc.setDrawColor(...accent).setLineWidth(0.4);
  doc.line(left, y + 1, right, y + 1);
  y += 6;

  // ---- reconciliation summary ----
  const s = a.summary || {};
  const boxW = 92;
  const boxX = right - boxW;
  if (y + 34 > pageBottom) { doc.addPage(); bg(); y = mTop; }

  const row = (label, val, opts = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal").setFontSize(opts.size || 9);
    doc.setTextColor(...(opts.color || NAVY));
    doc.text(label, boxX, y);
    doc.text(`${cur} ${money(val)}`, right, y, { align: "right" });
    y += opts.gap || 5;
  };
  row("They owe us (our vehicles / services)", s.theyOweUs || 0);
  row("We owe them (purchases)", s.weOweThem || 0);
  if (s.opening) row("Opening balance", s.opening);
  y += 1;

  // NET band — red when WE pay the vendor (money leaving us), accent when they pay us.
  const payable = (s.direction === "payable");
  const bandColor = payable ? RED : accent;
  const netLabel = payable ? "NET PAYABLE — WE PAY VENDOR" : s.direction === "receivable" ? "NET RECEIVABLE — VENDOR PAYS US" : "NET — SETTLED";
  doc.setFillColor(...bandColor);
  doc.roundedRect(boxX, y, boxW, 10, 1.5, 1.5, "F");
  doc.setTextColor(...WHITE).setFont("helvetica", "bold");
  doc.setFontSize(7.6);
  doc.text(netLabel, boxX + 3, y + 4);
  doc.setFontSize(11);
  doc.text(`${cur} ${money(s.absNet ?? Math.abs(s.net || 0))}`, right - 3, y + 7, { align: "right" });
  y += 16;

  // ---- footer note ----
  doc.setTextColor(...MUTED).setFont("helvetica", "italic").setFontSize(7.8);
  doc.text("This statement is issued for account reconciliation purposes. Cash is netted; where VAT applies each supply is invoiced separately.", left, Math.min(y, PH - mBottom + 2), { maxWidth: cw });

  return doc;
}

export function downloadVendorStatement(a) {
  const doc = buildVendorStatement(a);
  const per = (a.periodLabel || "statement").replace(/\s+/g, "-");
  const name = (a.vendor?.name || "Vendor").replace(/\s+/g, "_");
  doc.save(`Statement_${name}_${per}.pdf`);
}
