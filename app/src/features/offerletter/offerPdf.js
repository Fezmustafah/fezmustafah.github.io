// offerPdf.js — renders the EMPLOYMENT OFFER LETTER to a print-ready A4 PDF,
// pixel-faithful to the LA MODA reference. Pure jsPDF, fully deterministic:
// the same form always produces the same document (no AI in this path).
//
// Layout model (mm, A4 210x297):
//   body text spans the full width 13..197
//   the info / remuneration / hours tables sit in a centred 40..170 block
//   accent magenta (#CC0066) drives section headings + table header bands
import { jsPDF } from "jspdf";
import {
  money, salaryTotal, formatOfferDate, who,
  parseRich, openingPara, dutiesPara, probationPara, benefitsPara,
  validityPara, wpsNote, SECTIONS,
} from "./offerModel.js";

const PW = 210, PH = 297;
const ML = 13, MR = 13;              // body margins
const BODY_L = ML, BODY_R = PW - MR; // 13 .. 197
const BODY_W = BODY_R - BODY_L;      // 184
const TBL_L = 40, TBL_R = 170;       // centred table block
const TBL_W = TBL_R - TBL_L;         // 130

function hexRgb(hex) {
  const h = String(hex || "#CC0066").replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
const setInk = (doc, c) => doc.setTextColor(c.r, c.g, c.b);
const setFill = (doc, c) => doc.setFillColor(c.r, c.g, c.b);
const setStroke = (doc, c) => doc.setDrawColor(c.r, c.g, c.b);

const INK = { r: 26, g: 26, b: 26 };
const SOFT = { r: 90, g: 90, b: 90 };
const GRID = { r: 214, g: 216, b: 220 };
const PANEL = { r: 244, g: 245, b: 247 };
const WHITE = { r: 255, g: 255, b: 255 };

// ---- justified inline-bold paragraph flow ---------------------------------
// Splits a rich string into words (each a list of bold/normal runs), greedily
// breaks lines to `w`, and full-justifies every line except the last.
function richWords(segs) {
  const words = [];
  let cur = null;
  const push = () => { if (cur) { words.push(cur); cur = null; } };
  for (const s of segs) {
    for (const ch of [...s.text]) {
      if (ch === " " || ch === "\n") { push(); continue; }
      if (!cur) cur = { runs: [] };
      const last = cur.runs[cur.runs.length - 1];
      if (last && last.bold === s.bold) last.text += ch;
      else cur.runs.push({ text: ch, bold: s.bold });
    }
  }
  push();
  return words;
}

function drawRich(doc, rich, x, y, w, opt = {}) {
  const size = opt.size ?? 8.4;
  const lh = opt.lh ?? 3.82;
  const font = opt.font ?? "helvetica";
  const color = opt.color ?? INK;
  const justify = opt.justify ?? true;
  const words = richWords(parseRich(rich));

  const wordW = (word) => {
    let s = 0;
    for (const r of word.runs) {
      doc.setFont(font, r.bold ? "bold" : "normal").setFontSize(size);
      s += doc.getTextWidth(r.text);
    }
    return s;
  };
  doc.setFont(font, "normal").setFontSize(size);
  const spaceW = doc.getTextWidth(" ");

  // greedy line break
  const lines = [];
  let line = [], lineW = 0;
  for (const word of words) {
    const ww = wordW(word);
    if (line.length && lineW + spaceW + ww > w) { lines.push(line); line = []; lineW = 0; }
    if (line.length) lineW += spaceW;
    line.push(word); lineW += ww;
  }
  if (line.length) lines.push(line);

  setInk(doc, color);
  let cy = y;
  lines.forEach((ln, i) => {
    const isLast = i === lines.length - 1;
    const raw = ln.reduce((s, wd) => s + wordW(wd), 0);
    const gap = justify && !isLast && ln.length > 1 ? (w - raw) / (ln.length - 1) : spaceW;
    let cx = x;
    ln.forEach((wd, wi) => {
      for (const r of wd.runs) {
        doc.setFont(font, r.bold ? "bold" : "normal").setFontSize(size);
        doc.text(r.text, cx, cy);
        cx += doc.getTextWidth(r.text);
      }
      if (wi < ln.length - 1) cx += gap;
    });
    cy += lh;
  });
  return cy - lh + lh; // bottom baseline advanced by one line
}

// ---- chrome ---------------------------------------------------------------
function drawLetterheadBg(doc, lh) {
  if (!lh || !lh.dataUrl) return;
  const m = /^data:image\/([a-z0-9+]+)/i.exec(lh.dataUrl);
  const fmt = m && m[1].toUpperCase() === "PNG" ? "PNG" : "JPEG";
  try { doc.addImage(lh.dataUrl, fmt, 0, 0, PW, PH, undefined, "FAST"); } catch { /* skip */ }
}

// Drawn header (used when NOT printing on a letterhead image). Optional logo at
// the left, company wordmark, magenta underline. Returns y at header bottom.
function drawHeader(doc, o, accent) {
  let nameX = PW / 2, align = "center";
  if (o.logoDataUrl) {
    try {
      doc.addImage(o.logoDataUrl, "PNG", ML, 8, 22, 22);
      nameX = ML + 27; align = "left";
    } catch { /* ignore bad logo */ }
  }
  setInk(doc, INK);
  doc.setFont("helvetica", "bold").setFontSize(o.logoDataUrl ? 15 : 17);
  doc.text(o.company, nameX, 20, { align });
  setStroke(doc, accent);
  doc.setLineWidth(1.1);
  doc.line(ML, 26, BODY_R, 26);
  return 31;
}

function drawFooter(doc, o, accent) {
  if (!o.footerLine1 && !o.footerLine2) return;
  setStroke(doc, accent);
  doc.setLineWidth(0.6);
  doc.line(ML, PH - 11, BODY_R, PH - 11);
  setInk(doc, SOFT);
  doc.setFont("helvetica", "normal").setFontSize(8);
  if (o.footerLine1) doc.text(o.footerLine1, PW / 2, PH - 6.8, { align: "center" });
  if (o.footerLine2) doc.text(o.footerLine2, PW / 2, PH - 2.8, { align: "center" });
}

// Magenta section heading "N. TITLE". Returns y below it.
function sectionHead(doc, n, title, y, accent) {
  setInk(doc, accent);
  doc.setFont("helvetica", "bold").setFontSize(9.3);
  doc.text(`${n}. ${title}`, BODY_L, y);
  return y + 4.8;
}

// A cell with border + optional fill.
function cell(doc, x, y, w, h, { fill } = {}) {
  if (fill) { setFill(doc, fill); doc.rect(x, y, w, h, "F"); }
  setStroke(doc, GRID);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h, "S");
}

// ---- main builder ---------------------------------------------------------
export function buildOffer(o, ctx = {}) {
  const accent = hexRgb(o.accent);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const letterhead = o.useLetterhead ? ctx.letterhead : null;

  let y;
  if (letterhead && letterhead.dataUrl) {
    drawLetterheadBg(doc, letterhead);
    y = (letterhead.marginTop || 30) + 5;
  } else {
    y = drawHeader(doc, o, accent) + 4;
  }
  y += Number(o.contentOffset) || 0; // fine vertical nudge to fit the letterhead

  // ---- title block ----
  setInk(doc, INK);
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text("EMPLOYMENT OFFER LETTER", PW / 2, y, { align: "center" });
  y += 4.6;
  setInk(doc, SOFT);
  doc.setFont("helvetica", "italic").setFontSize(8.2);
  doc.text("Strictly Private & Confidential", PW / 2, y, { align: "center" });
  y += 3.4;
  setStroke(doc, accent);
  doc.setLineWidth(0.7);
  doc.line(BODY_L, y, BODY_R, y);
  y += 4.6;

  // ---- info grid (Date/Ref, Candidate/Nationality, Passport/Position) ----
  const rows = [
    ["Date", formatOfferDate(o.date), "Ref. No.", o.refNo],
    ["Candidate", who(o), "Nationality", o.nationality],
    ["Passport No.", o.passportNo, "Position", o.position],
  ];
  const RH = 6.4;
  const cx = { l1: TBL_L, v1: TBL_L + 24, l2: TBL_L + 65, v2: TBL_L + 89 };
  const cw = { l1: 24, v1: 41, l2: 24, v2: 41 };
  rows.forEach((r, i) => {
    const ry = y + i * RH;
    cell(doc, cx.l1, ry, cw.l1, RH, { fill: PANEL });
    cell(doc, cx.v1, ry, cw.v1, RH);
    cell(doc, cx.l2, ry, cw.l2, RH, { fill: PANEL });
    cell(doc, cx.v2, ry, cw.v2, RH);
    const ty = ry + RH * 0.64;
    doc.setFontSize(8.3);
    setInk(doc, INK);
    doc.setFont("helvetica", "bold");
    doc.text(r[0], cx.l1 + 2.5, ty);
    doc.text(r[2], cx.l2 + 2.5, ty);
    setInk(doc, SOFT);
    doc.setFont("helvetica", "normal");
    doc.text(String(r[1] || ""), cx.v1 + 2.5, ty);
    doc.text(String(r[3] || ""), cx.v2 + 2.5, ty);
  });
  y += rows.length * RH + 5;

  // ---- salutation + opening ----
  setInk(doc, INK);
  doc.setFont("helvetica", "normal").setFontSize(8.6);
  doc.text(`Dear ${who(o)},`, BODY_L, y);
  y += 4.2;
  y = drawRich(doc, openingPara(o), BODY_L, y, BODY_W) + 2.2;

  // ---- 1. POSITION & DUTIES ----
  y = sectionHead(doc, 1, SECTIONS[0].title, y, accent);
  y = drawRich(doc, dutiesPara(o), BODY_L, y, BODY_W) + 2.4;

  // ---- 2. REMUNERATION ----
  y = sectionHead(doc, 2, SECTIONS[1].title, y, accent);
  y = remunerationTable(doc, o, y, accent);
  y += 1.3;
  setInk(doc, INK);
  y = drawRich(doc, wpsNote, BODY_L, y, BODY_W, { justify: false }) + 2.2;

  // ---- 3. PROBATION / VISA ----
  y = sectionHead(doc, 3, SECTIONS[2].title, y, accent);
  y = drawRich(doc, probationPara(o), BODY_L, y, BODY_W) + 2.4;

  // ---- 4. WORKING HOURS & LEAVE ----
  y = sectionHead(doc, 4, SECTIONS[3].title, y, accent);
  y = leaveTable(doc, o.leave, y, accent) + 2.4;

  // ---- 5. BENEFITS ----
  y = sectionHead(doc, 5, SECTIONS[4].title, y, accent);
  y = drawRich(doc, benefitsPara(o), BODY_L, y, BODY_W) + 2.4;

  // ---- 6. GOVERNING LAW / VALIDITY ----
  y = sectionHead(doc, 6, SECTIONS[5].title, y, accent);
  y = drawRich(doc, validityPara(o), BODY_L, y, BODY_W);

  // ---- 7+. custom clauses (same design, continued numbering) ----
  (o.customSections || []).forEach((s, i) => {
    if (!s || (!s.title && !s.body)) return;
    y += 2.4;
    y = sectionHead(doc, 7 + i, (s.title || "ADDITIONAL TERMS").toUpperCase(), y, accent);
    y = drawRich(doc, s.body || "", BODY_L, y, BODY_W);
  });

  // ---- signatures ---- anchored above the footer so they never collide; sits
  // lower with a clean gap when the body is short (matches the reference). If
  // the body is long (extra clauses), overflow the block to a second page so it
  // never crashes into the footer.
  const SIG_BLOCK_H = 34, FOOT_TOP = PH - 14;
  let sigTop = Math.max(y + 5, PH - 47);
  if (sigTop + SIG_BLOCK_H > FOOT_TOP) {
    doc.addPage();
    if (letterhead && letterhead.dataUrl) drawLetterheadBg(doc, letterhead);
    sigTop = (letterhead && letterhead.dataUrl ? (letterhead.marginTop || 30) + 10 : 30);
  }
  signatures(doc, o, sigTop, accent, ctx);

  // footer on every page (drawn mode only — letterhead images carry their own)
  if (!(letterhead && letterhead.dataUrl)) {
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) { doc.setPage(p); drawFooter(doc, o, accent); }
  }
  return doc;
}

function remunerationTable(doc, o, y, accent) {
  const HH = 7.2, RH = 6.6, amtX = TBL_R - 3;
  // header band
  setFill(doc, accent);
  doc.rect(TBL_L, y, TBL_W, HH, "F");
  setInk(doc, WHITE);
  doc.setFont("helvetica", "bold").setFontSize(8.6);
  doc.text("Component", TBL_L + 3, y + HH * 0.64);
  doc.text(`Monthly (${o.currency})`, amtX, y + HH * 0.64, { align: "right" });
  let ry = y + HH;
  // data rows
  o.salary.forEach((r) => {
    setInk(doc, INK);
    doc.setFont("helvetica", "normal").setFontSize(8.6);
    doc.text(r.label, TBL_L + 3, ry + RH * 0.62);
    doc.text(money(r.amount), amtX, ry + RH * 0.62, { align: "right" });
    setStroke(doc, GRID);
    doc.setLineWidth(0.2);
    doc.line(TBL_L, ry + RH, TBL_R, ry + RH);
    ry += RH;
  });
  // total row
  setFill(doc, PANEL);
  doc.rect(TBL_L, ry, TBL_W, HH, "F");
  setStroke(doc, accent);
  doc.setLineWidth(0.5);
  doc.line(TBL_L, ry, TBL_R, ry);
  setInk(doc, INK);
  doc.setFont("helvetica", "bold").setFontSize(8.8);
  doc.text("Total Gross Salary", TBL_L + 3, ry + HH * 0.64);
  doc.text(money(salaryTotal(o.salary)), amtX, ry + HH * 0.64, { align: "right" });
  // outer border
  setStroke(doc, GRID);
  doc.setLineWidth(0.2);
  doc.rect(TBL_L, y, TBL_W, HH + o.salary.length * RH + HH, "S");
  return ry + HH;
}

function leaveTable(doc, rows, y, accent) {
  const HH = 6.4, RH = 6.4, itemW = 52, detX = TBL_L + itemW;
  const data = (rows || []).filter((r) => r && (r.item || r.detail));
  setFill(doc, accent);
  doc.rect(TBL_L, y, TBL_W, HH, "F");
  setInk(doc, WHITE);
  doc.setFont("helvetica", "bold").setFontSize(8.4);
  doc.text("Item", TBL_L + 3, y + HH * 0.64);
  doc.text("Detail", detX + 3, y + HH * 0.64);
  let ry = y + HH;
  data.forEach(({ item, detail }) => {
    setInk(doc, INK);
    doc.setFont("helvetica", "bold").setFontSize(8.4);
    doc.text(String(item || ""), TBL_L + 3, ry + RH * 0.62);
    doc.setFont("helvetica", "normal");
    setInk(doc, SOFT);
    doc.text(String(detail || ""), detX + 3, ry + RH * 0.62);
    setStroke(doc, GRID);
    doc.setLineWidth(0.2);
    doc.line(TBL_L, ry + RH, TBL_R, ry + RH);
    ry += RH;
  });
  setStroke(doc, GRID);
  doc.setLineWidth(0.2);
  doc.rect(TBL_L, y, TBL_W, HH + data.length * RH, "S");
  doc.line(detX, y, detX, ry); // column divider
  return ry;
}

// draw a saved signature / stamp image centred on (cx, baseY-ish), scaled to a
// target width, keeping aspect. `above` places it sitting on the y line.
function drawStampImage(doc, asset, cx, y, maxW, maxH) {
  if (!asset || !asset.dataUrl) return;
  const aspect = asset.aspect || 0.5; // h/w
  let w = maxW, h = w * aspect;
  if (h > maxH) { h = maxH; w = h / aspect; }
  try { doc.addImage(asset.dataUrl, "PNG", cx - w / 2, y - h, w, h); } catch { /* skip */ }
}

// label + fill-in line (or the value when known)
function fillField(doc, x, y, right, label, value) {
  setInk(doc, INK);
  doc.setFont("helvetica", "normal").setFontSize(8);
  doc.text(label, x, y);
  const lx = x + doc.getTextWidth(label) + 1;
  if (value) {
    setInk(doc, SOFT);
    doc.text(String(value), lx, y);
  } else {
    setStroke(doc, GRID);
    doc.setLineWidth(0.25);
    doc.line(lx, y + 0.6, right, y + 0.6);
  }
}

function signatures(doc, o, y, accent, ctx = {}) {
  setStroke(doc, accent);
  doc.setLineWidth(0.7);
  doc.line(BODY_L, y, BODY_R, y);
  y += 5;

  const LX = TBL_L, RX = 115, colR = 168, sigW = 60;
  setInk(doc, INK);
  doc.setFont("helvetica", "bold").setFontSize(8.6);
  doc.text(`For ${o.company}`, LX, y);
  doc.text("Accepted & Acknowledged by Candidate", RX, y);

  // signature lines
  const sy = y + 9;
  // stamp the saved company stamp + authorized signature above the left line
  drawStampImage(doc, ctx.stamp, LX + sigW / 2, sy - 0.5, 30, 26);
  drawStampImage(doc, ctx.signature, LX + sigW / 2, sy - 0.5, sigW - 6, 16);
  setStroke(doc, INK);
  doc.setLineWidth(0.3);
  doc.line(LX, sy, LX + sigW, sy);
  doc.line(RX, sy, RX + sigW, sy);

  let ly = sy + 4;
  setInk(doc, SOFT);
  doc.setFont("helvetica", "normal").setFontSize(8);
  doc.text("Authorized Signatory", LX, ly);
  doc.text(who(o) || "Candidate", RX, ly);
  ly += 4.1;
  fillField(doc, LX, ly, LX + sigW, "Name: ", "");
  fillField(doc, RX, ly, colR, "Passport No.: ", o.passportNo);
  ly += 4.1;
  fillField(doc, LX, ly, LX + sigW, "Designation: ", "");
  fillField(doc, RX, ly, colR, "Date: ", "");
  ly += 4.1;
  fillField(doc, LX, ly, LX + sigW, "Date: ", "");
  fillField(doc, RX, ly, colR, "Place: ", "");
  ly += 4.8;
  setInk(doc, INK);
  doc.setFont("helvetica", "bold").setFontSize(8);
  doc.text("[ Company Stamp ]", LX, ly);
  return ly;
}
