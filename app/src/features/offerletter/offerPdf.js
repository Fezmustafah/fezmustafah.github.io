// offerPdf.js — renders the EMPLOYMENT OFFER LETTER to a print-ready A4 PDF,
// faithful to the LA MODA reference. Pure jsPDF, fully deterministic.
//
// ONE PAGE, ALWAYS: the body is measured, then a single scale factor shrinks
// every font / line-height / gap / table row just enough for the whole letter
// + the signature block to fit on a single A4 between the header and footer
// zones. No second page is ever produced.
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
const SIG_H = 38;                    // signature block footprint (unscaled, measured)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
  return cy;
}

// ---- chrome ---------------------------------------------------------------
function drawLetterheadBg(doc, lh) {
  if (!lh || !lh.dataUrl) return;
  const m = /^data:image\/([a-z0-9+]+)/i.exec(lh.dataUrl);
  const fmt = m && m[1].toUpperCase() === "PNG" ? "PNG" : "JPEG";
  try { doc.addImage(lh.dataUrl, fmt, 0, 0, PW, PH, undefined, "FAST"); } catch { /* skip */ }
}

// Drawn header (used when NOT printing on a letterhead image).
function drawHeader(doc, o, accent) {
  let nameX = PW / 2, align = "center";
  if (o.logoDataUrl) {
    try { doc.addImage(o.logoDataUrl, "PNG", ML, 8, 22, 22); nameX = ML + 27; align = "left"; }
    catch { /* ignore */ }
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

function sectionHead(doc, n, title, y, accent, S) {
  setInk(doc, accent);
  doc.setFont("helvetica", "bold").setFontSize(9.3 * S);
  doc.text(`${n}. ${title}`, BODY_L, y);
  return y + 4.8 * S;
}

function cell(doc, x, y, w, h, { fill } = {}) {
  if (fill) { setFill(doc, fill); doc.rect(x, y, w, h, "F"); }
  setStroke(doc, GRID);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h, "S");
}

// ---- body layout (scaled by S) — returns the y at the bottom of the body ----
function layoutBody(doc, o, accent, S, top) {
  let y = top;

  // title block
  setInk(doc, INK);
  doc.setFont("helvetica", "bold").setFontSize(13 * S);
  doc.text("EMPLOYMENT OFFER LETTER", PW / 2, y, { align: "center" });
  y += 4.6 * S;
  setInk(doc, SOFT);
  doc.setFont("helvetica", "italic").setFontSize(8.2 * S);
  doc.text("Strictly Private & Confidential", PW / 2, y, { align: "center" });
  y += 3.4 * S;
  setStroke(doc, accent);
  doc.setLineWidth(0.7);
  doc.line(BODY_L, y, BODY_R, y);
  y += 4.6 * S;

  // info grid
  const rows = [
    ["Date", formatOfferDate(o.date), "Ref. No.", o.refNo],
    ["Candidate", who(o), "Nationality", o.nationality],
    ["Passport No.", o.passportNo, "Position", o.position],
  ];
  const RH = 6.4 * S;
  const cx = { l1: TBL_L, v1: TBL_L + 24, l2: TBL_L + 65, v2: TBL_L + 89 };
  const cw = { l1: 24, v1: 41, l2: 24, v2: 41 };
  rows.forEach((r, i) => {
    const ry = y + i * RH;
    cell(doc, cx.l1, ry, cw.l1, RH, { fill: PANEL });
    cell(doc, cx.v1, ry, cw.v1, RH);
    cell(doc, cx.l2, ry, cw.l2, RH, { fill: PANEL });
    cell(doc, cx.v2, ry, cw.v2, RH);
    const ty = ry + RH * 0.64;
    doc.setFontSize(8.3 * S);
    setInk(doc, INK);
    doc.setFont("helvetica", "bold");
    doc.text(r[0], cx.l1 + 2.5, ty);
    doc.text(r[2], cx.l2 + 2.5, ty);
    setInk(doc, SOFT);
    doc.setFont("helvetica", "normal");
    doc.text(String(r[1] || ""), cx.v1 + 2.5, ty);
    doc.text(String(r[3] || ""), cx.v2 + 2.5, ty);
  });
  y += rows.length * RH + 5 * S;

  // salutation + opening
  const bodySize = 8.4 * S, bodyLh = 3.82 * S;
  const para = (rich, opt = {}) => drawRich(doc, rich, BODY_L, y, BODY_W, { size: bodySize, lh: bodyLh, ...opt });
  setInk(doc, INK);
  doc.setFont("helvetica", "normal").setFontSize(8.6 * S);
  doc.text(`Dear ${who(o)},`, BODY_L, y);
  y += 4.2 * S;
  y = para(openingPara(o)) + 2.2 * S;

  // 1. duties
  y = sectionHead(doc, 1, SECTIONS[0].title, y, accent, S);
  y = para(dutiesPara(o)) + 2.4 * S;

  // 2. remuneration
  y = sectionHead(doc, 2, SECTIONS[1].title, y, accent, S);
  y = remunerationTable(doc, o, y, accent, S) + 1.3 * S;
  setInk(doc, INK);
  y = para(wpsNote, { justify: false }) + 2.2 * S;

  // 3. probation
  y = sectionHead(doc, 3, SECTIONS[2].title, y, accent, S);
  y = para(probationPara(o)) + 2.4 * S;

  // 4. working hours & leave
  y = sectionHead(doc, 4, SECTIONS[3].title, y, accent, S);
  y = leaveTable(doc, o.leave, y, accent, S) + 2.4 * S;

  // 5. benefits
  y = sectionHead(doc, 5, SECTIONS[4].title, y, accent, S);
  y = para(benefitsPara(o)) + 2.4 * S;

  // 6. governing law / validity
  y = sectionHead(doc, 6, SECTIONS[5].title, y, accent, S);
  y = para(validityPara(o));

  // 7+. custom clauses
  (o.customSections || []).forEach((s, i) => {
    if (!s || (!s.title && !s.body)) return;
    y += 2.4 * S;
    y = sectionHead(doc, 7 + i, (s.title || "ADDITIONAL TERMS").toUpperCase(), y, accent, S);
    y = para(s.body || "");
  });

  return y;
}

// ---- main builder ---------------------------------------------------------
// opts.drawAssets=false skips the signature/stamp images (used by the on-screen
// placement editor, which shows draggable overlays instead).
export function buildOffer(o, ctx = {}, opts = {}) {
  const drawAssets = opts.drawAssets !== false;
  const accent = hexRgb(o.accent);
  const letterhead = o.useLetterhead ? ctx.letterhead : null;
  const onLetterhead = !!(letterhead && letterhead.dataUrl);

  // body sits BETWEEN the header/footer zones — explicit on a letterhead so it
  // never runs over the printed logo/footer; fixed for the drawn header.
  const top = (onLetterhead ? (Number(o.headerSpace) || 46) : 35) + (Number(o.contentOffset) || 0);
  const footerReserve = onLetterhead ? Math.max(10, Number(o.footerSpace) || 22) : 15;
  const sigTop = PH - footerReserve - SIG_H;
  const target = sigTop - 3; // body must end above the signature block

  // ---- fit pass: shrink until the body ends above the signature zone ----
  let S = 1;
  for (let i = 0; i < 10; i++) {
    const scratch = new jsPDF({ unit: "mm", format: "a4" });
    const bottom = layoutBody(scratch, o, accent, S, top);
    if (bottom <= target) break;
    const factor = (target - top) / (bottom - top); // < 1 when overflowing
    if (factor >= 0.999) break;
    S = clamp(S * Math.max(factor, 0.92), 0.55, 1); // step down gently, floor 0.55
    if (S <= 0.55) break;
  }

  // ---- final draw ----
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  if (onLetterhead) drawLetterheadBg(doc, letterhead);
  else drawHeader(doc, o, accent);
  layoutBody(doc, o, accent, S, top);
  signatures(doc, o, sigTop, accent, ctx, drawAssets);
  if (!onLetterhead) drawFooter(doc, o, accent);
  return doc;
}

function remunerationTable(doc, o, y, accent, S) {
  const HH = 7.2 * S, RH = 6.6 * S, amtX = TBL_R - 3;
  setFill(doc, accent);
  doc.rect(TBL_L, y, TBL_W, HH, "F");
  setInk(doc, WHITE);
  doc.setFont("helvetica", "bold").setFontSize(8.6 * S);
  doc.text("Component", TBL_L + 3, y + HH * 0.64);
  doc.text(`Monthly (${o.currency})`, amtX, y + HH * 0.64, { align: "right" });
  let ry = y + HH;
  o.salary.forEach((r) => {
    setInk(doc, INK);
    doc.setFont("helvetica", "normal").setFontSize(8.6 * S);
    doc.text(r.label, TBL_L + 3, ry + RH * 0.62);
    doc.text(money(r.amount), amtX, ry + RH * 0.62, { align: "right" });
    setStroke(doc, GRID);
    doc.setLineWidth(0.2);
    doc.line(TBL_L, ry + RH, TBL_R, ry + RH);
    ry += RH;
  });
  setFill(doc, PANEL);
  doc.rect(TBL_L, ry, TBL_W, HH, "F");
  setStroke(doc, accent);
  doc.setLineWidth(0.5);
  doc.line(TBL_L, ry, TBL_R, ry);
  setInk(doc, INK);
  doc.setFont("helvetica", "bold").setFontSize(8.8 * S);
  doc.text("Total Gross Salary", TBL_L + 3, ry + HH * 0.64);
  doc.text(money(salaryTotal(o.salary)), amtX, ry + HH * 0.64, { align: "right" });
  setStroke(doc, GRID);
  doc.setLineWidth(0.2);
  doc.rect(TBL_L, y, TBL_W, HH + o.salary.length * RH + HH, "S");
  return ry + HH;
}

function leaveTable(doc, rows, y, accent, S) {
  const HH = 6.4 * S, RH = 6.4 * S, itemW = 52, detX = TBL_L + itemW;
  const data = (rows || []).filter((r) => r && (r.item || r.detail));
  setFill(doc, accent);
  doc.rect(TBL_L, y, TBL_W, HH, "F");
  setInk(doc, WHITE);
  doc.setFont("helvetica", "bold").setFontSize(8.4 * S);
  doc.text("Item", TBL_L + 3, y + HH * 0.64);
  doc.text("Detail", detX + 3, y + HH * 0.64);
  let ry = y + HH;
  data.forEach(({ item, detail }) => {
    setInk(doc, INK);
    doc.setFont("helvetica", "bold").setFontSize(8.4 * S);
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
  doc.line(detX, y, detX, ry);
  return ry;
}

// draw an asset centred on (cx, baseline y), scaled to a target box (auto mode)
function drawStampImage(doc, asset, cx, y, maxW, maxH) {
  if (!asset || !asset.dataUrl) return;
  const aspect = asset.aspect || 0.5;
  let w = maxW, h = w * aspect;
  if (h > maxH) { h = maxH; w = h / aspect; }
  try { doc.addImage(asset.dataUrl, "PNG", cx - w / 2, y - h, w, h); } catch { /* skip */ }
}

// draw an asset at a free page-fraction placement {x,y,w} (top-left + width).
function drawPlacedAsset(doc, asset, place) {
  if (!asset || !asset.dataUrl || !place) return;
  const w = clamp(place.w, 0.04, 1) * PW;
  const h = w * (asset.aspect || 0.5);
  const x = clamp(place.x, 0, 1) * PW;
  const y = clamp(place.y, 0, 1) * PH;
  try { doc.addImage(asset.dataUrl, "PNG", x, y, w, h); } catch { /* skip */ }
}

function fillField(doc, x, y, right, label, value) {
  setInk(doc, INK);
  doc.setFont("helvetica", "normal").setFontSize(8);
  doc.text(label, x, y);
  const lx = x + doc.getTextWidth(label) + 1;
  if (value) { setInk(doc, SOFT); doc.text(String(value), lx, y); }
  else { setStroke(doc, GRID); doc.setLineWidth(0.25); doc.line(lx, y + 0.6, right, y + 0.6); }
}

function signatures(doc, o, y, accent, ctx = {}, drawAssets = true) {
  setStroke(doc, accent);
  doc.setLineWidth(0.7);
  doc.line(BODY_L, y, BODY_R, y);
  y += 5;

  const LX = TBL_L, RX = 115, colR = 168, sigW = 60;
  setInk(doc, INK);
  doc.setFont("helvetica", "bold").setFontSize(8.6);
  doc.text(`For ${o.company}`, LX, y);
  doc.text("Accepted & Acknowledged by Candidate", RX, y);

  const sy = y + 9;
  // signature / stamp images: free placement when set, else auto above the line.
  if (drawAssets) {
    if (o.stampPlace) drawPlacedAsset(doc, ctx.stamp, o.stampPlace);
    else drawStampImage(doc, ctx.stamp, LX + sigW / 2, sy - 0.5, 30, 26);
    if (o.sigPlace) drawPlacedAsset(doc, ctx.signature, o.sigPlace);
    else drawStampImage(doc, ctx.signature, LX + sigW / 2, sy - 0.5, sigW - 6, 16);
  }
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
