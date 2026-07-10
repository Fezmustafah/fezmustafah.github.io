// pdfShared.js — common chrome for the tracker PDFs (individual invoice +
// weekly statement): page setup, colour helpers, header, title, party boxes,
// table-header band, signature block and footer. jsPDF only (both layouts draw
// their tables manually for full control of the theme).
//
// THEMES: every drawing helper takes a theme object `T` (see constants.THEMES).
//   T.c       palette (primary / accent / panel / panelEdge / white / text / muted)
//   T.font    { display, body } jsPDF built-in font names
//   T.minimal true  -> corporate look: hairline rules, no filled bars, serif
//             false -> classic look:  filled navy/gold bars
// A single `settings.theme` therefore restyles the whole document.
import { jsPDF } from "jspdf";
import { COLORS, getTheme, resolveTheme } from "./constants.js";
import { money } from "./format.js";

export const PAGE = { w: 210, h: 297, margin: 14 };
export const C = COLORS; // legacy classic palette (kept for back-compat)
export { getTheme, resolveTheme };

export function newDoc() {
  return new jsPDF({ unit: "mm", format: "a4" });
}

// Render a saved letterhead image as the full-page background (A4). Used when
// the user opts to print on their official letterhead instead of the built-in
// drawn header/footer.
export function drawLetterheadBg(doc, lh) {
  if (!lh || !lh.dataUrl) return;
  let fmt = "JPEG";
  const m = /^data:image\/([a-z0-9+]+)/i.exec(lh.dataUrl);
  if (m) fmt = m[1].toUpperCase() === "PNG" ? "PNG" : "JPEG";
  try {
    doc.addImage(lh.dataUrl, fmt, 0, 0, PAGE.w, PAGE.h, undefined, "FAST");
  } catch {
    /* unsupported image — leave the page blank rather than crash */
  }
}

// colour helpers — keep call sites readable
export const fill = (doc, c) => doc.setFillColor(c.r, c.g, c.b);
export const stroke = (doc, c) => doc.setDrawColor(c.r, c.g, c.b);
export const ink = (doc, c) => doc.setTextColor(c.r, c.g, c.b);

// Top company header. Returns the y where the body may begin.
export function drawHeader(doc, seller, T) {
  const { w, margin } = PAGE;
  const c = T.c;
  const rx = w - margin;

  // ---- banner: full-width colour band, centered white wordmark ----
  if (T.layout && T.layout.header === "banner") {
    fill(doc, c.primary);
    doc.rect(0, 0, w, 30, "F");
    fill(doc, c.accent);
    doc.rect(0, 30, w, 1.4, "F");
    ink(doc, c.white);
    doc.setFont(T.font.display, "bold").setFontSize(21);
    doc.text("BAIT AL MADINA", w / 2, 15, { align: "center" });
    ink(doc, c.accent);
    doc.setFont(T.font.body, "normal").setFontSize(9);
    doc.setCharSpace?.(1.2);
    doc.text("TRADITIONAL KITCHEN", w / 2, 21.5, { align: "center" });
    doc.setCharSpace?.(0);
    ink(doc, c.text);
    doc.setFont(T.font.body, "normal").setFontSize(7.5);
    doc.text(`${seller.address}    |    ${seller.phone}    |    ${seller.email}`, w / 2, 37, { align: "center" });
    return 32;
  }

  if (T.minimal) {
    // ---- corporate: serif wordmark, grey caption, single hairline rule ----
    ink(doc, c.text);
    doc.setFont(T.font.display, "bold").setFontSize(19);
    doc.text("BAIT AL MADINA", margin, 20);
    ink(doc, c.muted);
    doc.setFont(T.font.body, "normal").setFontSize(7.5);
    doc.setCharSpace?.(0.8);
    doc.text("TRADITIONAL KITCHEN", margin, 25);
    doc.setCharSpace?.(0);

    // right contact block (right-aligned, muted)
    ink(doc, c.text);
    doc.setFont(T.font.body, "normal").setFontSize(8);
    doc.text(seller.address, rx, 15, { align: "right" });
    ink(doc, c.muted);
    doc.setFontSize(7.5);
    doc.text(seller.phone, rx, 19.5, { align: "right" });
    doc.text(seller.email, rx, 23.5, { align: "right" });

    stroke(doc, c.text);
    doc.setLineWidth(0.5);
    doc.line(margin, 30, rx, 30);
    return 30;
  }

  // ---- classic: gold top bar + navy wordmark + double separator ----
  fill(doc, c.accent);
  doc.rect(0, 0, w, 4, "F");

  ink(doc, c.primary);
  doc.setFont(T.font.display, "bold").setFontSize(18);
  doc.text("BAIT AL MADINA", margin, 21);
  ink(doc, c.accent);
  doc.setFont(T.font.body, "normal").setFontSize(10);
  doc.text("TRADITIONAL KITCHEN", margin, 26);
  stroke(doc, c.accent);
  doc.setLineWidth(0.5);
  doc.line(margin, 27.5, margin + 55, 27.5);

  ink(doc, c.primary);
  doc.setFont("helvetica", "bold").setFontSize(9);
  doc.text(seller.address, rx, 16, { align: "right" });
  ink(doc, c.text);
  doc.setFont("helvetica", "normal").setFontSize(8);
  doc.text(seller.phone, rx, 20.5, { align: "right" });
  doc.text(seller.email, rx, 24.5, { align: "right" });

  stroke(doc, c.primary);
  doc.setLineWidth(0.7);
  doc.line(margin, 31, w - margin, 31);
  stroke(doc, c.accent);
  doc.setLineWidth(0.3);
  doc.line(margin, 32, w - margin, 32);
  return 31;
}

// Document title. classic: centered navy bold + gold underline.
// corporate: centered serif, letter-spaced, thin grey rule. Returns y below.
export function drawTitle(doc, title, y, T) {
  const c = T.c;
  const left = T.layout && T.layout.title === "left";
  const cx = left ? PAGE.margin : PAGE.w / 2;
  const align = left ? undefined : { align: "center" };
  if (T.minimal) {
    ink(doc, c.text);
    doc.setFont(T.font.display, "bold").setFontSize(19);
    doc.setCharSpace?.(1.2);
    doc.text(title, cx, y, align);
    doc.setCharSpace?.(0);
    stroke(doc, c.muted);
    doc.setLineWidth(0.3);
    if (left) doc.line(cx, y + 3, cx + 32, y + 3);
    else doc.line(cx - 16, y + 3, cx + 16, y + 3);
    return y + 3;
  }
  ink(doc, c.primary);
  doc.setFont(T.font.display, "bold").setFontSize(20);
  doc.text(title, cx, y, align);
  stroke(doc, c.accent);
  doc.setLineWidth(0.6);
  if (left) doc.line(cx, y + 3, cx + 50, y + 3);
  else doc.line(cx - 25, y + 3, cx + 25, y + 3);
  return y + 3;
}

// A labelled party box (FROM / BILL TO ...). Fixed footprint (headerH+bodyH =
// 43mm) in BOTH themes so the surrounding layout maths is theme-independent.
//   classic   — primary header bar + panel body, bordered.
//   corporate — grey caps label over a hairline, plain text, no fills.
export const PARTY_HEADER_H = 7;
const PARTY_BODY_MIN = 36;
const lineStep = (ln) => (ln.size ? ln.size * 0.45 : 4.1);

// Measure the body height (mm) a set of lines needs, so two boxes can be sized
// to the taller of them (custom fields make line counts vary). Never shorter
// than PARTY_BODY_MIN. `doc` must have a font set; we set it per line to wrap
// accurately.
export function partyBodyHeight(doc, T, w, lines) {
  let sum = 0;
  for (const ln of lines) {
    if (!ln || !ln.text) continue;
    doc.setFont(T.font.body, ln.bold ? "bold" : "normal").setFontSize(ln.size || 8.5);
    const wrapped = doc.splitTextToSize(ln.text, T.minimal ? w : w - 8);
    sum += wrapped.length * lineStep(ln);
  }
  return Math.max(PARTY_BODY_MIN, 6 + sum + 4); // top pad + content + bottom pad
}

// A labelled party box (FROM / BILL TO ...). `bodyH` lets the caller fix both
// boxes to the same (tallest) height; omitted -> PARTY_BODY_MIN.
//   classic   — primary header bar + panel body, bordered.
//   corporate — (minimal flag) grey caps label over a hairline, plain text.
export function partyBox(doc, T, x, y, w, title, lines, bodyH = PARTY_BODY_MIN) {
  const c = T.c;

  if (T.minimal) {
    ink(doc, c.muted);
    doc.setFont(T.font.body, "bold").setFontSize(7.5);
    doc.setCharSpace?.(0.6);
    doc.text(title, x, y + 4);
    doc.setCharSpace?.(0);
    stroke(doc, c.panelEdge);
    doc.setLineWidth(0.3);
    doc.line(x, y + 6, x + w, y + 6);
    let ly = y + 11;
    for (const ln of lines) {
      if (!ln || !ln.text) continue;
      ink(doc, ln.bold ? c.text : c.muted);
      doc.setFont(T.font.body, ln.bold ? "bold" : "normal").setFontSize(ln.size || 8.5);
      const wrapped = doc.splitTextToSize(ln.text, w);
      doc.text(wrapped, x, ly);
      ly += wrapped.length * lineStep(ln);
    }
    return y + PARTY_HEADER_H + bodyH;
  }

  // classic
  fill(doc, c.primary);
  doc.roundedRect(x, y, w, PARTY_HEADER_H, 1.5, 1.5, "F");
  ink(doc, c.white);
  doc.setFont("helvetica", "bold").setFontSize(8.5);
  doc.text(title, x + 4, y + 4.8);

  fill(doc, c.panel);
  stroke(doc, c.panelEdge);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y + PARTY_HEADER_H, w, bodyH, 1.5, 1.5, "FD");

  let ly = y + PARTY_HEADER_H + 6;
  for (const ln of lines) {
    if (!ln || !ln.text) continue;
    ink(doc, ln.gold ? c.primary : c.text);
    doc.setFont("helvetica", ln.bold ? "bold" : "normal").setFontSize(ln.size || 8.5);
    const wrapped = doc.splitTextToSize(ln.text, w - 8);
    doc.text(wrapped, x + 4, ly);
    ly += wrapped.length * lineStep(ln);
  }
  return y + PARTY_HEADER_H + bodyH;
}

// Table header band. `cols` = [{text, x, align}]. classic fills a primary bar
// with white text + gold underline; corporate uses uppercase ink text framed
// by two hairline rules. Returns the y at the band's bottom edge.
export function tableHeadBand(doc, T, x, y, w, h, cols) {
  const c = T.c;
  if (T.minimal) {
    stroke(doc, c.text);
    doc.setLineWidth(0.4);
    doc.line(x, y, x + w, y);
    doc.line(x, y + h, x + w, y + h);
    ink(doc, c.text);
    doc.setFont(T.font.body, "bold").setFontSize(8);
  } else {
    fill(doc, c.primary);
    doc.rect(x, y, w, h, "F");
    ink(doc, c.white);
    doc.setFont("helvetica", "bold").setFontSize(8.5);
  }
  for (const col of cols) {
    doc.text(col.text, col.x, y + h * 0.66, col.align ? { align: col.align } : undefined);
  }
  if (!T.minimal) {
    stroke(doc, c.accent);
    doc.setLineWidth(0.6);
    doc.line(x, y + h, x + w, y + h);
  }
  return y + h;
}

// Grand total / total chip. classic: filled primary pill + white text.
// corporate: double rule above, bold ink label + value, no fill.
export function totalBox(doc, T, x, y, w, h, label, value, fontPt) {
  const c = T.c;
  if (T.minimal) {
    stroke(doc, c.text);
    doc.setLineWidth(0.5);
    doc.line(x, y - 1.5, x + w, y - 1.5);
    doc.setLineWidth(0.2);
    doc.line(x, y - 0.6, x + w, y - 0.6);
    ink(doc, c.text);
    doc.setFont(T.font.body, "bold").setFontSize(fontPt);
    doc.text(label, x + 1, y + h * 0.62);
    doc.text(value, x + w - 1, y + h * 0.62, { align: "right" });
    return;
  }
  fill(doc, c.primary);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, "F");
  ink(doc, c.white);
  doc.setFont("helvetica", "bold").setFontSize(fontPt);
  doc.text(label, x + 4, y + h * 0.66);
  doc.text(value, x + w - 4, y + h * 0.66, { align: "right" });
}

// Right-aligned signature: optional saved-signature image above a line with
// "Authorized Signatory" beneath. rightX = right edge of the block.
export function drawSignature(doc, sig, rightX, lineY, T, maxH) {
  const c = T.c;
  if (sig && sig.dataUrl) {
    const aspect = sig.aspect || 0.45;
    // maxH (mm) shrinks the image into tight space (weekly statement one-pager)
    const wmm = Math.min(38, (maxH || 38 * aspect) / aspect);
    const hmm = wmm * aspect;
    try {
      doc.addImage(sig.dataUrl, "PNG", rightX - wmm, lineY - hmm - 1.5, wmm, hmm);
    } catch {
      /* malformed data url — skip the image, keep the line */
    }
  }
  stroke(doc, T.minimal ? c.muted : c.muted);
  doc.setLineWidth(0.3);
  doc.line(rightX - 50, lineY, rightX, lineY);
  ink(doc, c.muted);
  doc.setFont(T.font.body, "normal").setFontSize(8);
  doc.text("Authorized Signatory", rightX, lineY + 4, { align: "right" });
}

// Footer. classic: navy bar + gold edge + white text. corporate: hairline rule
// + small grey centered line.
export function drawFooter(doc, seller, T) {
  const { w, h } = PAGE;
  const c = T.c;
  const line = `${seller.name}    |    ${seller.phone}    |    TRN ${seller.trn}`;
  if (T.minimal) {
    stroke(doc, c.panelEdge);
    doc.setLineWidth(0.3);
    doc.line(PAGE.margin, h - 12, w - PAGE.margin, h - 12);
    ink(doc, c.muted);
    doc.setFont(T.font.body, "normal").setFontSize(7.5);
    doc.text(line, w / 2, h - 7, { align: "center" });
    return;
  }
  const top = h - 10;
  fill(doc, c.primary);
  doc.rect(0, top, w, 10, "F");
  fill(doc, c.accent);
  doc.rect(0, top, w, 0.6, "F");
  ink(doc, c.white);
  doc.setFont("helvetica", "normal").setFontSize(7.5);
  doc.text(line, w / 2, top + 6.2, { align: "center" });
}

// Beneficiary / bank details block (bottom-left of invoices + statement).
// Rows with a blank value are dropped; the whole block is skipped when the
// seller has no bank details at all. Returns the y at the block's bottom.
//   classic   — primary title bar + panel body, bordered.
//   corporate — grey caps label over a hairline, plain rows, no fills.
export function bankBox(doc, T, x, y, w, bank) {
  const c = T.c;
  const rows = [
    ["Bank", bank && bank.bankName],
    ["Account Name", bank && bank.accountName],
    ["Account No", bank && bank.accountNo],
    ["IBAN", bank && bank.iban],
    ["SWIFT", bank && bank.swift],
  ].filter(([, v]) => v && String(v).trim());
  if (!rows.length) return y;

  const headerH = 6;
  const rowH = 4.4;
  const bodyH = rows.length * rowH + 4;

  if (T.minimal) {
    ink(doc, c.muted);
    doc.setFont(T.font.body, "bold").setFontSize(7.5);
    doc.setCharSpace?.(0.6);
    doc.text("BENEFICIARY BANK DETAILS", x, y + 4);
    doc.setCharSpace?.(0);
    stroke(doc, c.panelEdge);
    doc.setLineWidth(0.3);
    doc.line(x, y + headerH, x + w, y + headerH);
  } else {
    fill(doc, c.primary);
    doc.roundedRect(x, y, w, headerH, 1.2, 1.2, "F");
    ink(doc, c.white);
    doc.setFont("helvetica", "bold").setFontSize(7.5);
    doc.text("BENEFICIARY BANK DETAILS", x + 3, y + 4.2);
    fill(doc, c.panel);
    stroke(doc, c.panelEdge);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y + headerH, w, bodyH, 1.2, 1.2, "FD");
  }

  let ly = y + headerH + 4;
  const labelX = x + (T.minimal ? 0 : 3);
  const valX = x + (T.minimal ? 28 : 30);
  for (const [label, value] of rows) {
    ink(doc, c.muted);
    doc.setFont(T.font.body, "normal").setFontSize(7.5);
    doc.text(`${label}`, labelX, ly);
    ink(doc, c.text);
    doc.setFont(T.font.body, "bold").setFontSize(7.5);
    doc.text(String(value), valX, ly);
    ly += rowH;
  }
  return y + headerH + bodyH;
}

// Right-aligned "label .... value" money row used in totals stacks.
export function moneyRow(doc, label, value, rightX, y, opts = {}) {
  const labelX = opts.labelX ?? rightX - 55;
  ink(doc, opts.color || C.text);
  doc.setFont(opts.font || "helvetica", opts.bold ? "bold" : "normal").setFontSize(opts.size || 9.5);
  doc.text(label, labelX, y);
  doc.text(`AED ${money(value)}`, rightX, y, { align: "right" });
}
