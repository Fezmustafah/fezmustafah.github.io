// offerModel.js — data model, defaults, theme and text templates for the
// EMPLOYMENT OFFER LETTER generator. This is a DETERMINISTIC document: every
// field maps to a fixed place in the PDF, so the output is identical every time
// (no AI / Gemini variance). Modelled 1:1 on the LA MODA reference letter.

// Magenta accent sampled from the reference PDF header/section bands.
export const OFFER_ACCENT = "#CC0066";

// Light UI palette tokens (kept local so the page has no external theme dep).
export const UI = {
  accent: OFFER_ACCENT,
  ink: "#1A1A1A",
  soft: "#666",
  panel: "#F4F5F7",
  line: "#E3E4E8",
};

// ---- salary helpers -------------------------------------------------------
export const money = (n) =>
  (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const salaryTotal = (rows) =>
  (rows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);

// "2026-07-03" -> "03 July 2026". Falls back to the raw string if unparseable.
export function formatOfferDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d)) return iso;
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---- default form -----------------------------------------------------------
// Company / legal / salary carry sensible defaults (reusable template).
// Candidate personal fields (name, nationality, passport) start BLANK — the
// form asks for them each time, and they are never committed to the repo.
export const DEFAULT_OFFER = {
  // branding
  company: "LA MODA BEAUTY SALOON L.L.C S.O.C",
  companyCity: "Dubai, U.A.E.",
  accent: OFFER_ACCENT,
  logoDataUrl: "",           // optional logo for the drawn header
  useLetterhead: false,      // true -> print on a saved letterhead image
  letterheadId: "",
  footerLine1: "",           // e.g. "Mob.: 054 444 1530, Dubai, UAE, Email : ..."
  footerLine2: "",           // e.g. "Dubai-U.A.E"

  // meta
  date: todayIso(),
  refNo: "",

  // candidate
  salutation: "Mr.",
  candidateName: "",
  nationality: "",
  passportNo: "",
  position: "Ladies Hairdresser",
  reportingTo: "Salon Manager",

  // 1. duties
  duties:
    "professional hairdressing, cutting, styling, colouring and related hair-care services for the Salon's clientele in accordance with Dubai Municipality health and hygiene standards, client consultation, maintaining strict hygiene protocols, and full adherence to all Company policies and service standards",

  // 2. remuneration
  currency: "AED",
  salary: [
    { label: "Basic Salary", amount: 4000 },
    { label: "Transportation Allowance", amount: 2000 },
    { label: "Other Allowance", amount: 2000 },
  ],

  // 3. probation / visa
  probationMonths: "two (2)",
  noticeDays: "fourteen (14)",
  lawRef: "Federal Decree-Law No. 33 of 2021",
  probationArticle: "Article 9",

  // 4. working hours & leave — an editable list of {item, detail} rows, so the
  // user can add their own conditions (e.g. Maternity Leave) in the same style.
  leave: [
    { item: "Working Hours", detail: "10:00 AM – 10:00 PM (12 hours/day, 7 days/week)" },
    { item: "Sick Leave", detail: "As per Federal Decree-Law No. 33 of 2021" },
  ],

  // 5. benefits
  benefits:
    "(i) UAE Emirates ID; and (ii) Dubai Health Authority (DHA)-compliant medical insurance",

  // 6. governing law / validity
  validityDays: "fourteen (14)",

  // extra numbered clauses appended after section 6, each {title, body}. Empty
  // by default; this is the "suggest an edit / add a block" mechanism.
  customSections: [],

  // branding colour behaviour + sign-off assets + fine positioning
  useLetterheadColors: true,   // accent follows the picked letterhead
  signatureId: "",             // saved signature stamped above "Authorized Signatory"
  stampId: "",                 // saved company stamp near "[ Company Stamp ]"
  contentOffset: 0,            // mm nudge of the whole body (fit to letterhead)
};

// Merge a saved draft over the defaults without dropping keys added later.
export function normalizeOffer(saved) {
  const o = { ...DEFAULT_OFFER, ...(saved || {}) };
  o.salary = Array.isArray(o.salary) && o.salary.length ? o.salary : DEFAULT_OFFER.salary;
  // migrate the old fixed workingHours/sickLeave pair into the leave[] list
  if (!Array.isArray(o.leave) || !o.leave.length) {
    o.leave = [
      { item: "Working Hours", detail: o.workingHours || DEFAULT_OFFER.leave[0].detail },
      { item: "Sick Leave", detail: o.sickLeave || DEFAULT_OFFER.leave[1].detail },
    ];
  }
  o.customSections = Array.isArray(o.customSections) ? o.customSections : [];
  return o;
}

// ---- rich text ------------------------------------------------------------
// Paragraphs use **double asterisks** to mark bold runs. parseRich turns a
// string into [{text, bold}] segments for the justified inline-bold renderer.
export function parseRich(str) {
  const out = [];
  const parts = String(str).split("**");
  parts.forEach((p, i) => {
    if (p) out.push({ text: p, bold: i % 2 === 1 });
  });
  return out.length ? out : [{ text: "", bold: false }];
}

// Salutation + name, e.g. "Mr. Alaa Naddaf".
export const who = (o) => `${o.salutation || ""} ${o.candidateName || ""}`.trim();

// ---- section body builders (interpolate the form into the legal clauses) ---
// Each returns a rich string (with ** bold markers) ready for parseRich.
export function openingPara(o) {
  return `On behalf of **${o.company}**, ${o.companyCity}, we are pleased to formally offer you employment on the terms stated herein, in full compliance with **UAE ${o.lawRef}** on the Regulation of Labour Relations and the directives of the **Ministry of Human Resources & Emiratisation (MOHRE)**.`;
}

export function dutiesPara(o) {
  return `You are offered the position of **${o.position}**, reporting directly to the ${o.reportingTo}. Your responsibilities shall include ${o.duties}.`;
}

export function probationPara(o) {
  return `Your employment is subject to a mandatory **${o.probationMonths} month probationary period** commencing from your official joining date, during which your performance, professional conduct and overall suitability for the role shall be formally evaluated. Upon your signed acceptance of this Offer Letter, the Company shall **immediately initiate** the processing of your UAE Employment Entry Permit, Residence Visa, Emirates ID and Work Permit under Company sponsorship. The probationary period runs entirely under this official sponsorship and shall not be construed as a pre-visa trial period. All statutory visa and Emirates ID costs are borne by the Company. Either party may terminate during probation with a minimum of **${o.noticeDays} days' written notice** pursuant to ${o.probationArticle} of ${o.lawRef}.`;
}

export function benefitsPara(o) {
  return `The Company shall provide the following upon successful completion of visa processing: ${o.benefits}.`;
}

export function validityPara(o) {
  return `This Offer is valid for **${o.validityDays} days** from the date hereof and is governed by the laws of the **UAE and the Emirate of Dubai**. It shall be superseded by the formal MOHRE-registered Employment Contract upon your arrival and issuance of your Work Permit. Kindly sign below to confirm unconditional acceptance of all terms.`;
}

export const wpsNote =
  "Salary shall be disbursed monthly in UAE Dirhams through the **Wages Protection System (WPS)** as mandated by MOHRE.";

export const SECTIONS = [
  { n: 1, title: "POSITION & DUTIES" },
  { n: 2, title: "REMUNERATION" },
  { n: 3, title: "PROBATIONARY PERIOD, VISA & WORK PERMIT" },
  { n: 4, title: "WORKING HOURS & LEAVE" },
  { n: 5, title: "BENEFITS & ENTITLEMENTS" },
  { n: 6, title: "GOVERNING LAW, VALIDITY & ACCEPTANCE" },
];
