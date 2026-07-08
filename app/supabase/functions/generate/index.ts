// Supabase Edge Function — AI document generator.
// Same contract as the old Netlify function: POST { brief, docType, company } →
// { title, blocks[...] }. The Gemini key lives in this function's secret env,
// not in the browser bundle.
//
// Deploy: automatic via .github/workflows/functions.yml on push to main.
// Manual fallback:
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

type Fields = {
  refNo?: string;
  date?: string;
  trn?: string;
  vat?: boolean | string;
  currency?: string;
  payment?: string;
  notes?: string;
};

function fieldsBlock(f: Fields) {
  const lines: string[] = [];
  if (f.refNo) lines.push(`- Document number to USE EXACTLY: "${f.refNo}".`);
  else lines.push(`- No number given: invent a realistic sequential one for this doc type.`);
  if (f.date) lines.push(`- Date to USE EXACTLY: "${f.date}".`);
  else lines.push(`- No date given: use today's date in DD / MM / YYYY.`);
  if (f.trn) lines.push(`- Company TRN to show under the title or in a line: "${f.trn}".`);
  else lines.push(`- No TRN given: DO NOT invent one.`);
  const wantVat = f.vat === true || f.vat === "true" || f.vat === "yes";
  if (wantVat) lines.push(`- Apply UAE VAT at 5%: add Subtotal, VAT 5%, and Grand Total rows.`);
  else lines.push(`- Do NOT add VAT unless the brief explicitly mentions it.`);
  if (f.currency) lines.push(`- Use "${f.currency}" as the currency.`);
  if (f.payment) lines.push(`- Include these payment / bank details verbatim as a short block: "${f.payment}".`);
  if (f.notes) lines.push(`- Include this note/terms text: "${f.notes}".`);
  return lines.join("\n");
}

function buildPrompt(brief: string, docType: string, company: string, fields: Fields) {
  const label = DOC_LABEL[docType] || "business document";
  const cur = fields.currency || "AED";
  return `You are an experienced corporate document writer for a UAE company.
Write the BODY CONTENT for a ${label} that will be printed on the company's EXISTING
printed letterhead. The letterhead already shows the company logo, name, address,
phone, email and footer — so DO NOT repeat any header, logo, address block, or footer.
Only produce the content that goes in the middle of the page.

Company (for tone/signature only): ${company || "the company"}.

Brief from the user (may be rough/typo'd — interpret intent):
"""${brief}"""

INFER THE INDUSTRY from the company name and the brief, then make the content
specific and believable for that industry — never generic placeholders. Examples:
- An auto / car services company → line items like "Engine oil & filter change",
  "Brake pad replacement", "Wheel alignment", "Diagnostics", labour vs parts.
- A catering / food company → meal boxes, per-day delivery, headcount.
- A cleaning company → man-hours, frequency, areas covered.
- A trading company → product SKUs, quantities, unit prices.
Use real-sounding descriptions, sensible quantities and ${cur} prices that add up
correctly. Write the kind of wording a professional in that field would actually use.

FILL THE PAGE PROPERLY. A near-empty page looks unprofessional. Produce enough
substance to occupy a full A4 body: an opening line, the table/breakdown, and then
the appropriate supporting blocks (payment terms, validity, thank-you / confirmation
line, signature). Aim for a complete, balanced document — not one short table.

Field instructions (follow exactly):
${fieldsBlock(fields)}

Write clean, professional, human wording. Use ${cur} for currency. Realistic UAE
business phrasing.

Return ONLY JSON in exactly this shape:
{
  "title": "DOCUMENT TITLE IN CAPS or empty string",
  "blocks": [
    { "kind": "ref|date|recipient|subheading|paragraph|bullet|signoff|signature_name|signature_title", "text": "..." },
    { "kind": "table", "columns": [{"label":"Description","align":"left"},{"label":"Qty","align":"right"},{"label":"Unit Price","align":"right"},{"label":"Amount","align":"right"}], "rows": [["...","1","10.00","10.00"]] }
  ]
}
Rules:
- "ref" e.g. "Ref: ${fields.refNo || "Q-2026-001"}" (use the number rule above).
- "date" e.g. "Date: <per rule above>".
- "recipient" the addressee block (multi-line ok using \\n). If a client is named in
  the brief, address it to them; otherwise a believable client for that industry.
- "subheading" optional one-line subject/summary.
- "paragraph" normal text; multiple allowed. Use for opening line, payment terms,
  validity, notes, and a confirmation/thank-you line.
- "bullet" one item per block (no dash, just the text). Good for terms & conditions.
- "table" for ANY pricing, line items, or breakdown. Right-align numeric columns.
  Final TOTAL row(s) inside the rows. Thousands separators + 2 decimals.
- "signoff" closing like "Yours sincerely," or "We look forward to your confirmation.".
- "signature_name" / "signature_title".
For an invoice/quotation/proforma: include a "table" with line items + totals.
For a statement of account: a "table" of transactions with a running/closing balance.
For a salary certificate: a "table" with the salary breakdown.
For a plain letter: no table — proper paragraphs.
Order blocks top-to-bottom.`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Shared Gemini call: tries each model (with one retry on 429/503) and returns
// the raw JSON text from the first that responds, else throws with the reason.
async function askGemini(key: string, payload: unknown): Promise<string> {
  let lastErr = "No model responded.";
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        const data = await res.json();
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      }
      lastErr = (await res.text()).slice(0, 300);
      if (res.status === 429 || res.status === 503) { await sleep(700); continue; }
      break;
    }
  }
  throw new Error(lastErr);
}

const safeJson = (raw: string) => {
  try { return JSON.parse(raw); } catch { return JSON.parse(raw.replace(/```json|```/g, "").trim()); }
};

// Passport reader: pulls candidate identity fields from a passport image so the
// offer-letter form can autofill them. The image is passed to Gemini vision.
const PASSPORT_PROMPT = `You are a precise passport data extractor. Inspect BOTH the visual zone and the
machine-readable zone (the two < < < lines at the bottom) of this passport image.
Return ONLY JSON in exactly this shape:
{"salutation":"","candidateName":"","nationality":"","passportNo":"","dob":"","expiry":"","sex":""}
Rules:
- candidateName: full name in normal Title Case, given names then surname, e.g. "John Smith". No << or codes.
- sex: "M" or "F" exactly as printed.
- salutation: "Mr." if sex is M, otherwise "Ms.".
- nationality: the English demonym ADJECTIVE (e.g. "Indian", "Filipino", "British"), NOT the 3-letter code.
- passportNo: exactly as printed in the passport number field.
- dob and expiry: formatted "DD MMM YYYY" (e.g. "03 Jul 1995").
- If any field is genuinely unreadable, use an empty string. Never guess or fabricate.`;

async function handlePassport(key: string, image: string, mimeType: string) {
  const b64 = image.includes(",") ? image.split(",")[1] : image; // strip data URL prefix
  const payload = {
    contents: [{ parts: [{ inline_data: { mime_type: mimeType || "image/jpeg", data: b64 } }, { text: PASSPORT_PROMPT }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json" },
  };
  const raw = await askGemini(key, payload);
  const p = safeJson(raw) || {};
  const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "");
  const passport = {
    salutation: clean(p.salutation) || (clean(p.sex).toUpperCase() === "F" ? "Ms." : "Mr."),
    candidateName: clean(p.candidateName),
    nationality: clean(p.nationality),
    passportNo: clean(p.passportNo),
    dob: clean(p.dob),
    expiry: clean(p.expiry),
    sex: clean(p.sex),
  };
  return new Response(JSON.stringify({ passport }), { status: 200, headers: CORS });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: CORS });

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return new Response(JSON.stringify({ error: "AI is not configured (GEMINI_API_KEY missing)." }), { status: 500, headers: CORS });

  let body: { mode?: string; image?: string; mimeType?: string; brief?: string; docType?: string; company?: string; fields?: Fields } = {};
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Bad request body." }), { status: 400, headers: CORS }); }

  // ---- passport vision path ----
  if (body.mode === "passport") {
    if (!body.image) return new Response(JSON.stringify({ error: "No passport image provided." }), { status: 400, headers: CORS });
    try { return await handlePassport(key, body.image, body.mimeType || "image/jpeg"); }
    catch (e) { return new Response(JSON.stringify({ error: "Could not read the passport — try a clearer photo.", detail: String(e).slice(0, 300) }), { status: 502, headers: CORS }); }
  }

  // ---- text document path ----
  const { brief = "", docType = "letter", company = "", fields = {} } = body;
  if (!brief.trim()) return new Response(JSON.stringify({ error: "Describe what to write first." }), { status: 400, headers: CORS });

  const payload = {
    contents: [{ parts: [{ text: buildPrompt(brief, docType, company, fields) }] }],
    generationConfig: { temperature: 0.4, responseMimeType: "application/json" },
  };
  try {
    const parsed = safeJson(await askGemini(key, payload));
    if (!parsed || !Array.isArray(parsed.blocks)) return new Response(JSON.stringify({ error: "AI returned an unexpected shape." }), { status: 502, headers: CORS });
    return new Response(JSON.stringify(parsed), { status: 200, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: "AI is busy right now — try again in a moment.", detail: String(e).slice(0, 300) }), { status: 502, headers: CORS });
  }
});
