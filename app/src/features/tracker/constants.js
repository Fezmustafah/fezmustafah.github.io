// constants.js — default seller / buyer / item data + theme colours for the
// Daily Invoice Tracker. Self-contained: nothing here is shared with the
// letterhead document generator.

// NO real company data lives in source. These are generic, blank placeholders
// so a guest (or any not-signed-in / fresh visitor) sees EMPTY fields — never
// someone else's email, TRN, phone or bank. Each user's real seller/buyer info
// lives only in their own saved settings (cloud when signed in, local else).
export const DEFAULT_BANK = {
  bankName: "",
  accountName: "",
  accountNo: "",
  iban: "",
  swift: "",
};

export const DEFAULT_SELLER = {
  name: "",
  nameAr: "",
  address: "",
  phone: "",
  email: "",
  trn: "",
  // beneficiary bank details printed on every invoice + the statement
  bank: { ...DEFAULT_BANK },
};

export const DEFAULT_BUYER = {
  name: "",
  // Registered billing address (tax notice) — shown on every invoice.
  address: "",
  phone: "",
  trn: "",
};

export const DEFAULT_ITEM = {
  description: "",
  unitPrice: 0,
};

export const DEFAULT_VAT_RATE = 5;

export const DEFAULT_SETTINGS = {
  // saved seller/beneficiary companies; `sellerId` marks the active one and
  // `seller` mirrors it (denormalised so PDFs keep reading settings.seller).
  // Each seller carries its OWN bank/beneficiary details.
  sellers: [{ id: "default", ...DEFAULT_SELLER }],
  sellerId: "default",
  seller: { ...DEFAULT_SELLER },
  // saved buyer companies; `buyerId` marks the active one and `buyer` mirrors it
  // (kept denormalised so the PDFs can keep reading settings.buyer unchanged).
  buyers: [{ id: "default", ...DEFAULT_BUYER }],
  buyerId: "default",
  buyer: { ...DEFAULT_BUYER },
  // multiple sellable items; each delivery picks one. VAT is a single global rate.
  items: [{ ...DEFAULT_ITEM }],
  vatRate: DEFAULT_VAT_RATE,
  // header style: built-in drawn header (default) OR one of the user's saved
  // letterheads rendered as the page background.
  header: { style: "drawn", letterheadId: null }, // "drawn" | "letterhead"
  // colour SKIN: one of the TEMPLATES keys (classic default).
  theme: "classic",
  // structural LAYOUT (where the blocks sit): one of LAYOUTS keys.
  layout: "standard", // "standard" | "sidebar" | "centered" | "compact"
};

// ---- invoice LAYOUTS (structure, orthogonal to the colour skin) ----------
// Each entry drives the invoice block arrangement (see invoiceLayouts.js).
export const LAYOUTS = [
  { key: "standard", name: "Default", desc: "Seller & buyer boxed side-by-side — the default format." },
  { key: "sidebar", name: "Sidebar", desc: "Coloured left rail (seller + pay-to bank); buyer & table on the right." },
  { key: "centered", name: "Centered", desc: "Seller in the header, buyer highlighted left, invoice details listed right." },
  { key: "compact", name: "Compact", desc: "Letter style: seller top-left, details top-right, single bill-to band." },
];

export function isLayout(key) {
  return LAYOUTS.some((l) => l.key === key);
}
export function resolveLayout(settings) {
  return settings && isLayout(settings.layout) ? settings.layout : "standard";
}

// Exact RGB values mirrored from the Tailwind tracker tokens (see tailwind.config.js).
export const COLORS = {
  navy:      { r: 27,  g: 42,  b: 91  }, // #1B2A5B — headers, text, boxes
  gold:      { r: 200, g: 169, b: 81  }, // #C8A951 — accents, lines, bars
  cream:     { r: 250, g: 248, b: 243 }, // #FAF8F3 — box fills, alt rows
  creamDark: { r: 224, g: 221, b: 213 }, // #E0DDD5 — borders
  white:     { r: 255, g: 255, b: 255 },
  text:      { r: 34,  g: 34,  b: 34  }, // #222222
  muted:     { r: 102, g: 102, b: 102 }, // #666666
  red:       { r: 192, g: 57,  b: 43  }, // #C0392B — delete buttons
};

// ---- PDF templates -------------------------------------------------------
// A TEMPLATE = a colour skin (`c` palette + `font`) + a LAYOUT (`minimal` for
// banded-vs-hairline chrome, plus `layout.header` and `layout.title` for
// structural variants). The drawing helpers in pdfShared read all of these, so
// one `settings.theme` key restyles AND relays out the whole document.
//   layout.header : "bar"    filled colour top bar + wordmark (classic)
//                   "banner" full-width colour band, centered white wordmark
//                   "rule"   minimal: wordmark + single hairline rule
//   layout.title  : "center" | "left"
// Two templates are "adaptive": their primary colour is pulled from the
// selected letterhead so the chrome blends with the page.
const WHITE = { r: 255, g: 255, b: 255 };
const RED = { r: 192, g: 57, b: 43 };
const CHAMPAGNE = { r: 176, g: 145, b: 90 }; // #B0915A — premium gold accent

// --- small colour helpers (no deps) ---
function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "");
  const n = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
  const i = parseInt(n || "2a3550", 16);
  return { r: (i >> 16) & 255, g: (i >> 8) & 255, b: i & 255 };
}
const clamp = (x) => Math.max(0, Math.min(255, Math.round(x)));
function mix(a, b, t) {
  return { r: clamp(a.r + (b.r - a.r) * t), g: clamp(a.g + (b.g - a.g) * t), b: clamp(a.b + (b.b - a.b) * t) };
}
function luma(c) {
  return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
}
// Darken a colour until it's deep enough for white text to read on it, while
// preserving its hue — so a pale brand colour still gives a usable bar.
function ensureDeep(c, max = 0.42) {
  const L = luma(c);
  if (L <= max || L === 0) return c;
  const k = max / L;
  return { r: clamp(c.r * k), g: clamp(c.g * k), b: clamp(c.b * k) };
}

// Fixed skin palette from a few hexes.
function palette({ primary, accent, panel, panelEdge, text = "#222222", muted = "#666666" }) {
  return {
    primary: hexToRgb(primary),
    accent: hexToRgb(accent),
    panel: hexToRgb(panel),
    panelEdge: hexToRgb(panelEdge),
    white: WHITE,
    text: hexToRgb(text),
    muted: hexToRgb(muted),
    red: RED,
  };
}

// Adaptive palette built around a letterhead's brand colour (hex) — deep slate
// default when no letterhead is in play.
function adaptivePalette(brandHex) {
  const brand = ensureDeep(hexToRgb(brandHex || "#2A3550"));
  return {
    primary: brand,
    accent: CHAMPAGNE,
    panel: mix(brand, WHITE, 0.94),
    panelEdge: mix(brand, WHITE, 0.74),
    white: WHITE,
    text: { r: 31, g: 31, b: 36 },
    muted: { r: 107, g: 107, b: 115 },
    red: RED,
  };
}

// The six templates. `swatch` [primary, accent] drives the Settings preview.
export const THEMES = {
  classic: {
    key: "classic", name: "Classic", minimal: false, adaptive: false,
    desc: "Navy & gold, filled bars. The default style.",
    c: palette({ primary: "#1B2A5B", accent: "#C8A951", panel: "#FAF8F3", panelEdge: "#E0DDD5" }),
    font: { display: "helvetica", body: "helvetica" },
    layout: { header: "bar", title: "center" },
    swatch: ["#1B2A5B", "#C8A951"],
  },
  royal: {
    key: "royal", name: "Royal", minimal: false, adaptive: false,
    desc: "Indigo banner header, gold accents, serif headings.",
    c: palette({ primary: "#2E1A6B", accent: "#C8A951", panel: "#F3F1FA", panelEdge: "#DAD3EC" }),
    font: { display: "times", body: "helvetica" },
    layout: { header: "banner", title: "center" },
    swatch: ["#2E1A6B", "#C8A951"],
  },
  emerald: {
    key: "emerald", name: "Emerald", minimal: false, adaptive: false,
    desc: "Deep green & gold, filled bars.",
    c: palette({ primary: "#0F5132", accent: "#C8A951", panel: "#F1F6F2", panelEdge: "#D6E3DA" }),
    font: { display: "helvetica", body: "helvetica" },
    layout: { header: "bar", title: "center" },
    swatch: ["#0F5132", "#C8A951"],
  },
  maroon: {
    key: "maroon", name: "Maroon", minimal: false, adaptive: false,
    desc: "Deep maroon & gold, serif headings.",
    c: palette({ primary: "#6E1423", accent: "#C8A951", panel: "#F7F0F0", panelEdge: "#E4D3D3" }),
    font: { display: "times", body: "helvetica" },
    layout: { header: "bar", title: "center" },
    swatch: ["#6E1423", "#C8A951"],
  },
  graphite: {
    key: "graphite", name: "Graphite", minimal: true, adaptive: false,
    desc: "Minimal monochrome, hairline rules, left-aligned title.",
    c: palette({ primary: "#23272E", accent: "#8A8F98", panel: "#F4F5F6", panelEdge: "#DEE1E4" }),
    font: { display: "helvetica", body: "helvetica" },
    layout: { header: "rule", title: "left" },
    swatch: ["#23272E", "#8A8F98"],
  },
  corporate: {
    key: "corporate", name: "Corporate", minimal: true, adaptive: true,
    desc: "Premium minimal that matches your letterhead colour, serif headings.",
    c: adaptivePalette(null),
    font: { display: "times", body: "helvetica" },
    layout: { header: "rule", title: "center" },
    swatch: ["#2A3550", "#B0915A"],
  },
};

// Order shown in the Settings picker (Classic first = default).
export const TRACKER_TEMPLATES = [
  THEMES.classic, THEMES.royal, THEMES.emerald, THEMES.maroon, THEMES.graphite, THEMES.corporate,
];

export function isTemplate(name) {
  return !!(name && THEMES[name]);
}

export function getTheme(name) {
  return THEMES[name] || THEMES.classic;
}

// Resolve the template to draw with, given settings + the letterhead in use.
// Adaptive templates (corporate) pull their primary colour from the letterhead.
export function resolveTheme(settings, letterhead) {
  const tpl = getTheme(settings && settings.theme);
  if (tpl.adaptive) {
    return { ...tpl, c: adaptivePalette(letterhead && letterhead.accent ? letterhead.accent : null) };
  }
  return tpl;
}

// One full tracking period = 7 days (deliver daily, settle weekly).
export const PERIOD_DAYS = 7;
