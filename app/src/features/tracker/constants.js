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
  buyer: { ...DEFAULT_BUYER },
  // multiple sellable items; each delivery picks one. VAT is a single global rate.
  items: [{ ...DEFAULT_ITEM }],
  vatRate: DEFAULT_VAT_RATE,
  // header style: built-in drawn header (default) OR one of the user's saved
  // letterheads rendered as the page background.
  header: { style: "drawn", letterheadId: null }, // "drawn" | "letterhead"
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

// One full tracking period = 7 days (deliver daily, settle weekly).
export const PERIOD_DAYS = 7;
