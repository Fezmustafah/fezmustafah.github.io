// aiClient.js — call the serverless generate function and turn the returned
// content blocks into positioned canvas elements.
//
// Layout philosophy: the body is VERTICALLY JUSTIFIED inside the letterhead's
// safe zone (between the header margin and the footer margin). Instead of
// stacking blocks from the top and leaving a blank lower half, we measure the
// natural height of every block, then distribute the leftover space into the
// gaps between sections — weighted so the signature sinks toward the bottom and
// the body breathes evenly. Result: a balanced, corporate page that fills the
// space defined by the user's header/footer/side margins.
import { makeText, makeRule, makeTable, A4 } from "../editor/model.js";

// Talks to the Supabase Edge Function (Deno). One endpoint for local + prod.
// The anon key is required by Supabase's gateway even for unauthenticated calls.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function generateDocument({ brief, docType, company, fields }) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
    },
    body: JSON.stringify({ brief, docType, company, fields: fields || {} }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Generation failed.");
  return data; // { title, blocks: [...] }
}

const MM_PER_PT = 1 / 2.834645669;

// rough line-count estimate for vertical spacing
function estLines(text, wMm, fontPt) {
  const cpl = Math.max(8, wMm / (fontPt * 0.19));
  return (text || "")
    .split("\n")
    .reduce((n, line) => n + Math.max(1, Math.ceil(line.length / cpl)), 0);
}

// height in mm a text block will occupy
function textH(text, wMm, fontPt, lh = 1.4) {
  return estLines(text, wMm, fontPt) * fontPt * MM_PER_PT * lh;
}

export function aiBlocksToElements(ai, letterhead) {
  const side = letterhead.marginSide;
  const accent = letterhead.accent;
  const W = A4.wMm - side * 2;

  // The vertical band the body may occupy — driven entirely by the letterhead.
  const zoneTop = letterhead.marginTop + 2;
  const zoneBottom = A4.hMm - letterhead.marginBottom;
  const zoneH = zoneBottom - zoneTop;

  // A "row" is one vertical band. els are built with yMm RELATIVE to the row
  // top (0); we offset them to absolute positions in the justify pass.
  // gapBase = minimum gap after the row; weight = its share of leftover space.
  const rows = [];
  const addRow = (els, h, gapBase, weight) => rows.push({ els, h, gapBase, weight });

  // boost the gap *before* the signature cluster so the signature sinks down
  let sigStarted = false;
  const markSignatureStart = () => {
    if (sigStarted) return;
    sigStarted = true;
    if (rows.length) rows[rows.length - 1].weight += 2.6;
  };

  if (ai.title) {
    const h = textH(ai.title, W, 20, 1.2);
    addRow([makeText({ text: ai.title, xMm: side, yMm: 0, wMm: W, fontPt: 20, bold: true, align: "center", color: accent })], h, 5, 1);
  }

  const blocks = ai.blocks || [];
  const ref = blocks.find((b) => b.kind === "ref");
  const date = blocks.find((b) => b.kind === "date");
  if (ref || date) {
    const els = [];
    if (ref) els.push(makeText({ text: ref.text, xMm: side, yMm: 0, wMm: 110, fontPt: 10, bold: true, color: "#222" }));
    if (date) els.push(makeText({ text: date.text, xMm: side, yMm: 0, wMm: W, fontPt: 10, bold: true, align: "right", color: "#222" }));
    addRow(els, textH(ref?.text || date?.text || "x", 110, 10), 3, 1.1);
  }

  for (const b of blocks) {
    if (b === ref || b === date) continue;
    const text = b.text || "";
    switch (b.kind) {
      case "recipient":
        addRow([makeText({ text, xMm: side, yMm: 0, wMm: 110, fontPt: 10, color: "#222", lineHeight: 1.35 })], textH(text, 110, 10, 1.35), 3, 1.2);
        break;
      case "subheading":
        addRow([makeText({ text, xMm: side, yMm: 0, wMm: W, fontPt: 11.5, bold: true, color: accent })], textH(text, W, 11.5, 1.3), 2, 1);
        break;
      case "paragraph":
        addRow([makeText({ text, xMm: side, yMm: 0, wMm: W, fontPt: 10.5, color: "#222", lineHeight: 1.5 })], textH(text, W, 10.5, 1.5), 2, 1);
        break;
      case "bullet":
        addRow([makeText({ text: "•  " + text, xMm: side + 4, yMm: 0, wMm: W - 4, fontPt: 10.5, color: "#222", lineHeight: 1.4 })], textH(text, W - 4, 10.5, 1.4), 1, 0.5);
        break;
      case "table": {
        const cols = (b.columns || []).map((c) =>
          typeof c === "string" ? { label: c, align: "left" } : { label: c.label || "", align: c.align || "left" }
        );
        const trows = (b.rows || []).map((r) => (Array.isArray(r) ? r.map((x) => String(x ?? "")) : []));
        addRow(
          [makeTable({ xMm: side, yMm: 0, wMm: W, accent, rows: trows, columns: cols.length ? cols : undefined })],
          (trows.length + 1) * 6.2,
          3,
          1.4
        );
        break;
      }
      case "signoff":
        markSignatureStart();
        addRow([makeText({ text, xMm: side, yMm: 0, wMm: W, fontPt: 10.5, color: "#222" })], textH(text, W, 10.5, 1.4), 2, 0.2);
        break;
      case "signature_name":
        markSignatureStart();
        addRow(
          [
            makeRule({ xMm: side, yMm: 0, wMm: 60, color: "#888" }),
            makeText({ text, xMm: side, yMm: 2, wMm: 90, fontPt: 10, bold: true, color: "#222" }),
          ],
          7,
          0,
          0.1
        );
        break;
      case "signature_title":
        addRow([makeText({ text, xMm: side, yMm: 0, wMm: 90, fontPt: 8.5, color: "#666" })], 4, 1, 0.1);
        break;
      default:
        addRow([makeText({ text, xMm: side, yMm: 0, wMm: W, fontPt: 10.5, color: "#222", lineHeight: 1.45 })], textH(text, W, 10.5, 1.45), 2, 1);
    }
  }

  if (!rows.length) return [];

  // ---- justify pass: spread leftover space into the inter-row gaps ----------
  const totalContent = rows.reduce((s, r) => s + r.h, 0);
  const inner = rows.slice(0, -1); // gaps only exist BETWEEN rows
  const totalBaseGap = inner.reduce((s, r) => s + r.gapBase, 0);
  const totalWeight = inner.reduce((s, r) => s + r.weight, 0);
  let slack = zoneH - totalContent - totalBaseGap;
  if (slack < 0) slack = 0; // content overflows: keep natural spacing, don't crush

  const els = [];
  let y = zoneTop;
  rows.forEach((r, i) => {
    for (const e of r.els) els.push({ ...e, yMm: e.yMm + y });
    y += r.h;
    if (i < rows.length - 1) {
      const extra = totalWeight > 0 ? slack * (r.weight / totalWeight) : 0;
      y += r.gapBase + extra;
    }
  });
  return els;
}
