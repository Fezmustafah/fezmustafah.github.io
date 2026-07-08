// offerToElements.js — "explode" the offer letter into free editor blocks so the
// user gets FULL Canva-style control: every heading, paragraph, table, rule,
// signature and stamp becomes an independent element they can drag, resize,
// edit, duplicate or delete on the studio canvas. Returns { elements, letterhead }
// ready for dispatch({type:"SET_ELEMENTS"}) + dispatch({type:"SET_LETTERHEAD"}).
//
// Like the PDF builder, it SHRINK-TO-FITs: the blocks are measured and scaled so
// the whole letter lands between the letterhead header and footer (one page) —
// then the user can freely rearrange from there.
import { makeText, makeRule, makeTable, makeImage } from "../../editor/model.js";
import {
  who, money, salaryTotal, formatOfferDate,
  openingPara, dutiesPara, probationPara, benefitsPara, validityPara, wpsNote, SECTIONS,
} from "./offerModel.js";

const PT_PER_MM = 2.834645669;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const plain = (s) => String(s || "").replace(/\*\*/g, ""); // editor text has no inline bold
const lineMm = (fontPt, lh) => (fontPt / PT_PER_MM) * lh;
function estLines(text, wMm, fontPt) {
  const cpl = Math.max(8, wMm / (fontPt * 0.19));
  return String(text).split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / cpl)), 0);
}
const textH = (text, wMm, fontPt, lh) => estLines(text, wMm, fontPt) * lineMm(fontPt, lh);

export function offerToElements(o, ctx = {}) {
  const accent = o.accent || "#CC0066";
  const letterhead = o.useLetterhead ? ctx.letterhead : null;
  const onLetterhead = !!(letterhead && letterhead.dataUrl);
  const SIDE = 14, W = 210 - SIDE * 2, RCOL = 112, cur = o.currency || "AED";
  const top = onLetterhead ? (Number(o.headerSpace) || 46) : 26;
  const footerReserve = onLetterhead ? Math.max(10, Number(o.footerSpace) || 22) : 14;
  const target = 297 - footerReserve; // the sign-off must end above this

  // Build the whole block list at a given vertical scale S (fonts, gaps, table
  // rows, sign-off offsets all scale). Returns { els, bottom }.
  function build(S) {
    const els = [];
    let y = top;
    const push = (el) => els.push(el);
    const addText = (text, opt = {}) => {
      const wMm = opt.wMm ?? W, fontPt = (opt.fontPt ?? 9.5) * S, lh = opt.lineHeight ?? 1.4;
      push(makeText({ text: plain(text), xMm: opt.xMm ?? SIDE, yMm: y, wMm, fontPt, bold: opt.bold, italic: opt.italic, align: opt.align, color: opt.color ?? "#222222", lineHeight: lh }));
      y += textH(text, wMm, fontPt, lh) + (opt.after ?? 2.5) * S;
    };
    const section = (n, title, body) => {
      addText(`${n}. ${title}`, { fontPt: 10.5, bold: true, color: accent, after: 1.5 });
      if (body) addText(body, { fontPt: 9.5, lineHeight: 1.42, after: 3 });
    };
    const tableH = (rows, fontPt) => (rows + 1) * (fontPt / PT_PER_MM * 1.9 + 2);

    // drawn header (only when NOT on a letterhead image)
    if (!onLetterhead) {
      addText(o.company, { fontPt: 16, bold: true, align: "center", color: "#1A1A1A", after: 1 });
      push(makeRule({ xMm: SIDE, yMm: y, wMm: W, color: accent, thicknessMm: 0.8 })); y += 5 * S;
    }

    // title block
    addText("EMPLOYMENT OFFER LETTER", { fontPt: 15, bold: true, align: "center", color: "#1A1A1A", after: 1 });
    addText("Strictly Private & Confidential", { fontPt: 8.5, italic: true, align: "center", color: "#666666", after: 1.5 });
    push(makeRule({ xMm: SIDE, yMm: y, wMm: W, color: accent, thicknessMm: 0.6 })); y += 4 * S;

    // info (two columns)
    const infoL = `Date:  ${formatOfferDate(o.date)}\nCandidate:  ${who(o)}\nPassport No.:  ${o.passportNo}`;
    const infoR = `Ref. No.:  ${o.refNo}\nNationality:  ${o.nationality}\nPosition:  ${o.position}`;
    const infoFont = 9.5 * S;
    push(makeText({ text: infoL, xMm: SIDE, yMm: y, wMm: 92, fontPt: infoFont, color: "#222222", lineHeight: 1.5 }));
    push(makeText({ text: infoR, xMm: RCOL, yMm: y, wMm: 84, fontPt: infoFont, color: "#222222", lineHeight: 1.5 }));
    y += textH(infoL, 92, infoFont, 1.5) + 3 * S;

    // salutation + opening
    addText(`Dear ${who(o)},`, { fontPt: 9.5, color: "#222222", after: 1.5 });
    addText(openingPara(o), { fontPt: 9.5, lineHeight: 1.42, after: 3 });

    // 1. duties
    section(1, SECTIONS[0].title, dutiesPara(o));

    // 2. remuneration + WPS note
    addText(`2. ${SECTIONS[1].title}`, { fontPt: 10.5, bold: true, color: accent, after: 1.5 });
    const remRows = [...o.salary.map((r) => [r.label, money(r.amount)]), ["Total Gross Salary", money(salaryTotal(o.salary))]];
    push(makeTable({ xMm: SIDE, yMm: y, wMm: W, accent, fontPt: 9 * S, columns: [{ label: "Component", align: "left" }, { label: `Monthly (${cur})`, align: "right" }], colFlex: [3, 1], rows: remRows }));
    y += tableH(remRows.length, 9 * S) + 3 * S;
    addText(wpsNote, { fontPt: 9, lineHeight: 1.4, color: "#333333", after: 3 });

    // 3. probation
    section(3, SECTIONS[2].title, probationPara(o));

    // 4. working hours & leave
    addText(`4. ${SECTIONS[3].title}`, { fontPt: 10.5, bold: true, color: accent, after: 1.5 });
    const leaveRows = (o.leave || []).filter((r) => r && (r.item || r.detail)).map((r) => [r.item, r.detail]);
    push(makeTable({ xMm: SIDE, yMm: y, wMm: W, accent, fontPt: 9 * S, columns: [{ label: "Item", align: "left" }, { label: "Detail", align: "left" }], colFlex: [2, 3], rows: leaveRows }));
    y += tableH(leaveRows.length, 9 * S) + 3 * S;

    // 5. benefits, 6. validity
    section(5, SECTIONS[4].title, benefitsPara(o));
    section(6, SECTIONS[5].title, validityPara(o));

    // 7+. custom clauses
    (o.customSections || []).forEach((s, i) => {
      if (!s || (!s.title && !s.body)) return;
      section(7 + i, (s.title || "ADDITIONAL TERMS").toUpperCase(), s.body || "");
    });

    // signatures
    y += 1 * S;
    push(makeRule({ xMm: SIDE, yMm: y, wMm: W, color: accent, thicknessMm: 0.6 })); y += 4 * S;
    const sigY = y;
    push(makeText({ text: `For ${o.company}`, xMm: SIDE, yMm: sigY, wMm: 92, fontPt: 9 * S, bold: true, color: "#1A1A1A" }));
    push(makeText({ text: "Accepted & Acknowledged by Candidate", xMm: RCOL, yMm: sigY, wMm: 84, fontPt: 9 * S, bold: true, color: "#1A1A1A" }));
    const lineY = sigY + 14 * S;
    push(makeRule({ xMm: SIDE, yMm: lineY, wMm: 56, color: "#555555", thicknessMm: 0.3 }));
    push(makeRule({ xMm: RCOL, yMm: lineY, wMm: 56, color: "#555555", thicknessMm: 0.3 }));
    push(makeText({ text: "Authorized Signatory", xMm: SIDE, yMm: lineY + 2 * S, wMm: 70, fontPt: 8.5 * S, color: "#666666" }));
    push(makeText({ text: who(o) || "Candidate", xMm: RCOL, yMm: lineY + 2 * S, wMm: 70, fontPt: 8.5 * S, color: "#666666" }));
    push(makeText({ text: "Name: ____________________\nDesignation: ________________\nDate: ____________________", xMm: SIDE, yMm: lineY + 7 * S, wMm: 84, fontPt: 8.5 * S, color: "#444444", lineHeight: 1.7 }));
    push(makeText({ text: `Passport No.:  ${o.passportNo}\nDate: ____________________\nPlace: ___________________`, xMm: RCOL, yMm: lineY + 7 * S, wMm: 84, fontPt: 8.5 * S, color: "#444444", lineHeight: 1.7 }));
    const stampY = lineY + 25 * S;
    push(makeText({ text: "[ Company Stamp ]", xMm: SIDE, yMm: stampY, wMm: 60, fontPt: 8.5 * S, bold: true, color: "#1A1A1A" }));

    // signature / stamp images (placed near the sign-off — drag anywhere after)
    if (ctx.signature?.dataUrl) push(makeImage({ dataUrl: ctx.signature.dataUrl, aspect: ctx.signature.aspect || 0.45, xMm: SIDE + 2, yMm: lineY - 14 * S, wMm: 44 * S, label: "Signature" }));
    if (ctx.stamp?.dataUrl) push(makeImage({ dataUrl: ctx.stamp.dataUrl, aspect: ctx.stamp.aspect || 1, xMm: SIDE + 58, yMm: lineY + 6 * S, wMm: 26 * S, label: "Stamp" }));

    return { els, bottom: stampY + 4 * S };
  }

  // measure at full size, then scale down so the sign-off ends above the footer
  const measured = build(1).bottom;
  let S = 1;
  if (measured > target) S = clamp((target - top) / (measured - top), 0.6, 1);
  const { els } = build(S);

  // drawn footer (fixed at the page bottom — not scaled)
  if (!onLetterhead && (o.footerLine1 || o.footerLine2)) {
    if (o.footerLine1) els.push(makeText({ text: o.footerLine1, xMm: SIDE, yMm: 286, wMm: W, fontPt: 8, align: "center", color: "#666666" }));
    if (o.footerLine2) els.push(makeText({ text: o.footerLine2, xMm: SIDE, yMm: 291, wMm: W, fontPt: 8, align: "center", color: "#666666" }));
  }

  const lhPatch = onLetterhead
    ? { id: letterhead.id, name: letterhead.name || "Letterhead", dataUrl: letterhead.dataUrl, accent, marginTop: top, marginBottom: footerReserve, marginSide: SIDE }
    : { id: "", name: o.company || "Offer Letter", dataUrl: "", accent, marginTop: 12, marginBottom: 14, marginSide: SIDE };

  return { elements: els, letterhead: lhPatch };
}
