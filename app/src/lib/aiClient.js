// aiClient.js — call the serverless generate function and turn the returned
// content blocks into positioned canvas elements.
import { makeText, makeRule, makeTable, A4 } from "../editor/model.js";

// Talks to the Supabase Edge Function (Deno). One endpoint for local + prod.
// The anon key is required by Supabase's gateway even for unauthenticated calls.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function generateDocument({ brief, docType, company }) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
    },
    body: JSON.stringify({ brief, docType, company }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Generation failed.");
  return data; // { title, blocks: [...] }
}

// rough line-count estimate for vertical spacing
function estLines(text, wMm, fontPt) {
  const cpl = Math.max(8, wMm / (fontPt * 0.19));
  return (text || "")
    .split("\n")
    .reduce((n, line) => n + Math.max(1, Math.ceil(line.length / cpl)), 0);
}

const MM_PER_PT = 1 / 2.834645669;

export function aiBlocksToElements(ai, letterhead) {
  const side = letterhead.marginSide;
  const accent = letterhead.accent;
  const W = A4.wMm - side * 2;
  const els = [];
  let y = letterhead.marginTop + 2;

  const advance = (text, wMm, fontPt, lh = 1.4, extra = 3) => {
    y += estLines(text, wMm, fontPt) * fontPt * MM_PER_PT * lh + extra;
  };

  if (ai.title) {
    els.push(makeText({ text: ai.title, xMm: side, yMm: y, wMm: W, fontPt: 20, bold: true, align: "center", color: accent }));
    y += 13;
  }

  const blocks = ai.blocks || [];
  const ref = blocks.find((b) => b.kind === "ref");
  const date = blocks.find((b) => b.kind === "date");
  if (ref || date) {
    if (ref) els.push(makeText({ text: ref.text, xMm: side, yMm: y, wMm: 100, fontPt: 10, bold: true, color: "#222" }));
    if (date) els.push(makeText({ text: date.text, xMm: side, yMm: y, wMm: W, fontPt: 10, bold: true, align: "right", color: "#222" }));
    y += 10;
  }

  for (const b of blocks) {
    if (b === ref || b === date) continue;
    const text = b.text || "";
    switch (b.kind) {
      case "recipient":
        els.push(makeText({ text, xMm: side, yMm: y, wMm: 110, fontPt: 10, color: "#222", lineHeight: 1.35 }));
        advance(text, 110, 10, 1.35, 4);
        break;
      case "subheading":
        els.push(makeText({ text, xMm: side, yMm: y, wMm: W, fontPt: 11.5, bold: true, color: accent }));
        advance(text, W, 11.5, 1.3, 4);
        break;
      case "paragraph":
        els.push(makeText({ text, xMm: side, yMm: y, wMm: W, fontPt: 10.5, color: "#222", lineHeight: 1.5 }));
        advance(text, W, 10.5, 1.5, 4);
        break;
      case "bullet":
        els.push(makeText({ text: "•  " + text, xMm: side + 4, yMm: y, wMm: W - 4, fontPt: 10.5, color: "#222", lineHeight: 1.4 }));
        advance(text, W - 4, 10.5, 1.4, 2);
        break;
      case "table": {
        const cols = (b.columns || []).map((c) =>
          typeof c === "string" ? { label: c, align: "left" } : { label: c.label || "", align: c.align || "left" }
        );
        const rows = (b.rows || []).map((r) => (Array.isArray(r) ? r.map((x) => String(x ?? "")) : []));
        els.push(makeTable({ xMm: side, yMm: y, wMm: W, accent, rows, columns: cols.length ? cols : undefined }));
        y += (rows.length + 1) * 6.2 + 5;
        break;
      }
      case "signoff":
        y += 4;
        els.push(makeText({ text, xMm: side, yMm: y, wMm: W, fontPt: 10.5, color: "#222" }));
        advance(text, W, 10.5, 1.4, 4);
        break;
      case "signature_name":
        y += 10;
        els.push(makeRule({ xMm: side, yMm: y, wMm: 60, color: "#888" }));
        y += 2;
        els.push(makeText({ text, xMm: side, yMm: y, wMm: 90, fontPt: 10, bold: true, color: "#222" }));
        y += 5;
        break;
      case "signature_title":
        els.push(makeText({ text, xMm: side, yMm: y, wMm: 90, fontPt: 8.5, color: "#666" }));
        y += 6;
        break;
      default:
        els.push(makeText({ text, xMm: side, yMm: y, wMm: W, fontPt: 10.5, color: "#222", lineHeight: 1.45 }));
        advance(text, W, 10.5, 1.45, 4);
    }
  }
  return els;
}
