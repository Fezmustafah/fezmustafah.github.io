// pdfShared.js — common chrome for the tracker PDFs (individual invoice +
// weekly statement): page setup, colour helpers, header, separator, title,
// signature block and footer. jsPDF only (no autotable here — both layouts
// draw their tables manually for full control of the navy/gold theme).
import { jsPDF } from "jspdf";
import { COLORS } from "./constants.js";
import { money } from "./format.js";

export const PAGE = { w: 210, h: 297, margin: 14 };
export const C = COLORS;

export function newDoc() {
  return new jsPDF({ unit: "mm", format: "a4" });
}

// colour helpers — keep call sites readable
export const fill = (doc, c) => doc.setFillColor(c.r, c.g, c.b);
export const stroke = (doc, c) => doc.setDrawColor(c.r, c.g, c.b);
export const ink = (doc, c) => doc.setTextColor(c.r, c.g, c.b);

// Top gold bar + company header. Returns the y where the body may begin.
export function drawHeader(doc, seller) {
  const { w, margin } = PAGE;

  // gold bar across the very top
  fill(doc, C.gold);
  doc.rect(0, 0, w, 4, "F");

  // left wordmark
  ink(doc, C.navy);
  doc.setFont("helvetica", "bold").setFontSize(18);
  doc.text("BAIT AL MADINA", margin, 21);
  ink(doc, C.gold);
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text("TRADITIONAL KITCHEN", margin, 26);
  stroke(doc, C.gold);
  doc.setLineWidth(0.5);
  doc.line(margin, 27.5, margin + 55, 27.5);

  // right contact block (right-aligned)
  const rx = w - margin;
  ink(doc, C.navy);
  doc.setFont("helvetica", "bold").setFontSize(9);
  doc.text(seller.address, rx, 16, { align: "right" });
  ink(doc, C.text);
  doc.setFont("helvetica", "normal").setFontSize(8);
  doc.text(seller.phone, rx, 20.5, { align: "right" });
  doc.text(seller.email, rx, 24.5, { align: "right" });

  // separator: navy line + thin gold line beneath
  stroke(doc, C.navy);
  doc.setLineWidth(0.7);
  doc.line(margin, 31, w - margin, 31);
  stroke(doc, C.gold);
  doc.setLineWidth(0.3);
  doc.line(margin, 32, w - margin, 32);

  return 31;
}

// Centered document title with a centered gold underline. Returns y below it.
export function drawTitle(doc, title, y) {
  ink(doc, C.navy);
  doc.setFont("helvetica", "bold").setFontSize(20);
  doc.text(title, PAGE.w / 2, y, { align: "center" });
  stroke(doc, C.gold);
  doc.setLineWidth(0.6);
  doc.line(PAGE.w / 2 - 25, y + 3, PAGE.w / 2 + 25, y + 3);
  return y + 3;
}

// Right-aligned signature: optional saved-signature image above a grey line
// with "Authorized Signatory" beneath. rightX = right edge of the block.
export function drawSignature(doc, sig, rightX, lineY) {
  if (sig && sig.dataUrl) {
    const wmm = 38;
    const hmm = wmm * (sig.aspect || 0.45);
    try {
      doc.addImage(sig.dataUrl, "PNG", rightX - wmm, lineY - hmm - 1.5, wmm, hmm);
    } catch {
      /* malformed data url — skip the image, keep the line */
    }
  }
  stroke(doc, C.muted);
  doc.setLineWidth(0.3);
  doc.line(rightX - 50, lineY, rightX, lineY);
  ink(doc, C.muted);
  doc.setFont("helvetica", "normal").setFontSize(8);
  doc.text("Authorized Signatory", rightX, lineY + 4, { align: "right" });
}

// Navy footer bar pinned to the page bottom with a gold top edge.
export function drawFooter(doc, seller) {
  const { w, h } = PAGE;
  const top = h - 10;
  fill(doc, C.navy);
  doc.rect(0, top, w, 10, "F");
  fill(doc, C.gold);
  doc.rect(0, top, w, 0.6, "F");
  ink(doc, C.white);
  doc.setFont("helvetica", "normal").setFontSize(7.5);
  const line = `${seller.name}    |    ${seller.phone}    |    TRN ${seller.trn}`;
  doc.text(line, w / 2, top + 6.2, { align: "center" });
}

// Right-aligned "label .... value" money row used in totals stacks.
export function moneyRow(doc, label, value, rightX, y, opts = {}) {
  const labelX = opts.labelX ?? rightX - 55;
  ink(doc, opts.color || C.text);
  doc.setFont("helvetica", opts.bold ? "bold" : "normal").setFontSize(opts.size || 9.5);
  doc.text(label, labelX, y);
  doc.text(`AED ${money(value)}`, rightX, y, { align: "right" });
}
