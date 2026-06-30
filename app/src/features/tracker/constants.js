// constants.js — default seller / buyer / item data + theme colours for the
// Daily Invoice Tracker. Self-contained: nothing here is shared with the
// letterhead document generator.

export const DEFAULT_SELLER = {
  name: "Bait Al Madina Traditional Kitchen",
  nameAr: "مطبخ بيت المدينة الشعبي",
  address: "Jebel Ali - 1, Dubai, U.A.E",
  phone: "+971 55 692 5963 / +971 54 448 6615",
  email: "adnankhanbhutta786@gmail.com",
  trn: "104213822000003",
};

export const DEFAULT_BUYER = {
  name: "D S C A Building Contracting L.L.C",
  // Registered billing address from the tax notice — fixed, shown on every invoice.
  address: "Prime Commercial Holdings A 304,\nAl Barsha South Fourth, Dubai, U.A.E",
  phone: "+971 58 999 7842",
  trn: "104168815900003",
};

export const DEFAULT_ITEM = {
  description: "Chicken Biryani (Parcel)",
  unitPrice: 10,
};

export const DEFAULT_VAT_RATE = 5;

export const DEFAULT_SETTINGS = {
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
  // document look: "classic" = navy/gold/cream colourful theme (default),
  // "corporate" = minimal monochrome, serif display font, hairline rules.
  theme: "classic", // "classic" | "corporate"
};

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

// ---- PDF themes ----------------------------------------------------------
// Each theme is a palette (`c`) + font choices (`font`) + a `minimal` flag.
// The shared PDF chrome (pdfShared.js) and both builders branch on these so a
// single `settings.theme` switch restyles every generated document.
//   classic   — the original navy/gold/cream: filled bars, colourful.
//   corporate — minimal monochrome: serif display font, hairline rules, no
//               filled blocks. Reads cleaner / more formal on plain paper.
const WHITE = { r: 255, g: 255, b: 255 };
const RED = { r: 192, g: 57, b: 43 };

export const THEMES = {
  classic: {
    key: "classic",
    minimal: false,
    c: {
      primary: COLORS.navy, // bars, headings, table header fill
      accent: COLORS.gold, // rules, edges, underlines
      panel: COLORS.cream, // box fills, alt rows
      panelEdge: COLORS.creamDark, // box borders
      white: WHITE,
      text: COLORS.text,
      muted: COLORS.muted,
      red: RED,
    },
    font: { display: "helvetica", body: "helvetica" },
  },
  corporate: {
    key: "corporate",
    minimal: true,
    c: {
      primary: { r: 26, g: 26, b: 26 }, // near-black ink for headings/rules
      accent: { r: 130, g: 130, b: 130 }, // grey hairlines / labels
      panel: { r: 248, g: 248, b: 246 }, // barely-there alt row tint
      panelEdge: { r: 219, g: 217, b: 213 }, // hairline borders
      white: WHITE,
      text: { r: 26, g: 26, b: 26 },
      muted: { r: 118, g: 118, b: 118 },
      red: RED,
    },
    // Times (serif) for display lines reads more corporate/editorial; the body
    // stays Helvetica for clean tabular figures.
    font: { display: "times", body: "helvetica" },
  },
};

export function getTheme(name) {
  return THEMES[name] || THEMES.classic;
}

// One full tracking period = 7 days (deliver daily, settle weekly).
export const PERIOD_DAYS = 7;
