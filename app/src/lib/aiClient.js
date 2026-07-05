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

// Talks to the Supabase Edge Function (Deno). The function is deployed with
// verify_jwt=false, so we send a CORS "simple request": Content-Type text/plain
// and NO apikey/Authorization headers. That avoids the OPTIONS preflight (which
// the Supabase gateway 500s) — the preflight was the "Failed to fetch" cause.
// The function still parses the body as JSON regardless of content-type.
const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL;

export async function generateDocument({ brief, docType, company, fields }) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ brief, docType, company, fields: fields || {} }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Generation failed.");
  return data; // { title, blocks: [...] }
}

// Whether the cloud AI endpoint is configured (prod has VITE_SUPABASE_URL; the
// dev clone has no .env, so passport scanning is a prod-only feature).
export const aiConfigured = () => !!SUPABASE_URL;

// Downscale an image file to a JPEG data URL (max edge ~1600px) so the passport
// upload stays small and reliable. Returns { dataUrl, mimeType }.
async function downscaleImage(file, maxEdge = 1600, quality = 0.85) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    // fallback: send the raw file as a data URL
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(file); });
    return { dataUrl, mimeType: file.type || "image/jpeg" };
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  return { dataUrl: canvas.toDataURL("image/jpeg", quality), mimeType: "image/jpeg" };
}

// Read a passport image via the Gemini vision endpoint. The image is sent to the
// edge function (which forwards it to Google). Returns the extracted fields.
export async function scanPassport(file) {
  if (!SUPABASE_URL) throw new Error("Passport scanning needs the live app (cloud AI). It works on the deployed site, not this local build.");
  const { dataUrl, mimeType } = await downscaleImage(file);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ mode: "passport", image: dataUrl, mimeType }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Passport scan failed.");
  return data.passport || {};
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

  // remember where the signature cluster begins so we can sink it toward the
  // footer (the gap BEFORE it absorbs the most slack).
  let sigIndex = null;
  const markSignatureStart = () => {
    if (sigIndex != null) return;
    sigIndex = rows.length;
    if (rows.length) rows[rows.length - 1].weight += 3; // claim the pre-signature slack
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
        addRow([makeText({ text, xMm: side, yMm: 0, wMm: W, fontPt: 10.5, color: "#222", lineHeight: 1.5 })], textH(text, W, 10.5, 1.5), 3, 1);
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
          4,
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

  // ---- layout pass: fill the header→footer zone, professionally ----
  // Body gaps stay TIGHT and EVEN (each capped), so paragraphs are never
  // stretched apart. The leftover slack is pushed entirely into the gap BEFORE
  // the signature cluster, anchoring the signature just above the footer — so
  // the page fills the margins instead of trailing off with blank space, while
  // the body keeps a clean, even rhythm (the big gap reads as signing space).
  const MAX_GAP_EXTRA = 10; // mm any normal inter-row gap may absorb

  const totalContent = rows.reduce((s, r) => s + r.h, 0);
  const inner = rows.slice(0, -1); // gaps only exist BETWEEN rows
  const totalBaseGap = inner.reduce((s, r) => s + r.gapBase, 0);
  const totalWeight = inner.reduce((s, r) => s + r.weight, 0) || 1;
  let slack = zoneH - totalContent - totalBaseGap;
  if (slack < 0) slack = 0; // content overflows: keep natural spacing, don't crush

  const sigGap = sigIndex != null && sigIndex > 0 ? sigIndex - 1 : -1;

  // 1) even, capped extra for every gap except the pre-signature one
  const extras = inner.map((r, i) =>
    i === sigGap ? 0 : Math.min(slack * (r.weight / totalWeight), MAX_GAP_EXTRA)
  );
  // 2) the pre-signature gap takes ALL the rest, sinking the signature to the
  //    footer so the document fills the page. (No signature → leftover stays as
  //    a modest bottom margin, which is correct for that case.)
  if (sigGap >= 0) {
    const used = extras.reduce((a, b) => a + b, 0);
    extras[sigGap] = Math.max(0, slack - used);
  }

  const els = [];
  let y = zoneTop;
  rows.forEach((r, i) => {
    for (const e of r.els) els.push({ ...e, yMm: e.yMm + y });
    y += r.h;
    if (i < rows.length - 1) y += r.gapBase + extras[i];
  });
  return els;
}
