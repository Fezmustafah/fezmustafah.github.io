// Supabase Edge Function — AI document generator.
// Same contract as the old Netlify function: POST { brief, docType, company } →
// { title, blocks[...] }. The Gemini key lives in this function's secret env,
// not in the browser bundle.
//
// Deploy:
//   supabase functions deploy generate
//   supabase secrets set GEMINI_API_KEY=<key> GEMINI_MODEL=gemini-2.5-flash

const MODELS = [
  Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
].filter((v, i, a) => v && a.indexOf(v) === i);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const DOC_LABEL: Record<string, string> = {
  "tax-invoice": "Tax Invoice",
  invoice: "Invoice",
  quotation: "Quotation",
  proforma: "Proforma Invoice",
  statement: "Statement of Account",
  letter: "Letter / official correspondence",
};

function buildPrompt(brief: string, docType: string, company: string) {
  const label = DOC_LABEL[docType] || "business document";
  return `You are an experienced corporate document writer for a UAE company.
Write the BODY CONTENT for a ${label} that will be printed on the company's EXISTING
printed letterhead. The letterhead already shows the company logo, name, address,
phone, email and footer — so DO NOT repeat any header, logo, address block, or footer.
Only produce the content that goes in the middle of the page.

Company (for tone/signature only): ${company || "the company"}.

Brief from the user (may be rough/typo'd — interpret intent):
"""${brief}"""

Write clean, professional, human wording. Concise. Use AED for currency. Use realistic
UAE business phrasing. If the brief implies amounts or items, lay them out as readable
lines. If it's a letter, write proper paragraphs. Do not invent sensitive data (TRN,
bank, license) unless given in the brief.

Return ONLY JSON in exactly this shape:
{
  "title": "DOCUMENT TITLE IN CAPS or empty string",
  "blocks": [
    { "kind": "ref|date|recipient|subheading|paragraph|bullet|signoff|signature_name|signature_title", "text": "..." },
    { "kind": "table", "columns": [{"label":"Description","align":"left"},{"label":"Qty","align":"right"},{"label":"Unit Price","align":"right"},{"label":"Amount","align":"right"}], "rows": [["...","1","10.00","10.00"]] }
  ]
}
Rules:
- "ref" e.g. "Ref: Q-2026-001" (make a sensible number if not given).
- "date" e.g. "Date: <today or given>".
- "recipient" the addressee block (multi-line ok using \\n).
- "subheading" optional one-line subject/summary.
- "paragraph" normal text; multiple allowed.
- "bullet" one item per block (no dash, just the text).
- "table" for ANY pricing, line items, or breakdown. Right-align numeric columns. Final TOTAL row inside the rows. Thousands separators + 2 decimals.
- "signoff" closing like "Yours sincerely," or "We look forward to your confirmation.".
- "signature_name" / "signature_title".
For an invoice/quotation: include a "table" with line items + totals.
For a salary certificate: a "table" with the salary breakdown.
For a plain letter: no table.
Order blocks top-to-bottom. Keep it tight and well-spaced.`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: CORS });

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return new Response(JSON.stringify({ error: "AI is not configured (GEMINI_API_KEY missing)." }), { status: 500, headers: CORS });

  let body: { brief?: string; docType?: string; company?: string } = {};
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Bad request body." }), { status: 400, headers: CORS }); }
  const { brief = "", docType = "letter", company = "" } = body;
  if (!brief.trim()) return new Response(JSON.stringify({ error: "Describe what to write first." }), { status: 400, headers: CORS });

  const payload = {
    contents: [{ parts: [{ text: buildPrompt(brief, docType, company) }] }],
    generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
  };

  let lastErr = "No model responded.";
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        const data = await res.json();
        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        let parsed;
        try { parsed = JSON.parse(raw); } catch { parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
        if (!parsed || !Array.isArray(parsed.blocks)) return new Response(JSON.stringify({ error: "AI returned an unexpected shape." }), { status: 502, headers: CORS });
        return new Response(JSON.stringify(parsed), { status: 200, headers: CORS });
      }
      lastErr = (await res.text()).slice(0, 300);
      if (res.status === 429 || res.status === 503) { await sleep(700); continue; }
      break;
    }
  }
  return new Response(JSON.stringify({ error: "AI is busy right now — try again in a moment.", detail: lastErr }), { status: 502, headers: CORS });
});
