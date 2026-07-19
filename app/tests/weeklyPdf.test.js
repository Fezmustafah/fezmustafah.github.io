// weeklyPdf layout rules (the ones that keep regressing):
//   1. Totals + signature never sit on a page without table rows (no orphan
//      totals page).
//   2. When even the tight layout can't fit one page, rows split EVENLY
//      across two pages.
//   3. Bank box appears only when the roomy layout fits (user rule: no space
//      -> no bank info).
import { describe, it, expect } from "vitest";
import { buildWeekly } from "../src/features/tracker/weeklyPdf.js";
import { newDoc } from "../src/features/tracker/pdfShared.js";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const settings = {
  theme: "classic",
  vatRate: 5,
  seller: {
    name: "Bait Al Madina Traditional Kitchen",
    address: "Jebel Ali - 1, Dubai - U.A.E",
    phone: "+971 55 692 5963",
    email: "adnankhanbhutta786@gmail.com",
    trn: "100000000000003",
    bank: {
      bankName: "ADCB Islamic Banking",
      accountName: "Bait Al Madina Traditional Kitchen",
      accountNo: "13412181820001",
      iban: "AE790030013412181820001",
      swift: "ADCBAEAA",
    },
  },
  buyer: {
    name: "Client Co LLC",
    address: "Dubai",
    phone: "+971 50 000 0000",
    trn: "100000000000004",
  },
};

// screenshot scenario: official letterhead with a tall header + footer band
const letterhead = { dataUrl: TINY_PNG, marginTop: 50, marginBottom: 40 };

const DATES = [
  "2026-07-12", "2026-07-13", "2026-07-14", "2026-07-15",
  "2026-07-16", "2026-07-17", "2026-07-18",
];
const makeRows = (n) =>
  Array.from({ length: n }, (_, i) => ({
    date: DATES[i % DATES.length],
    index: i % 3,
    order: { location: `Camp ${i + 1}`, qty: 10 + i, amount: 100 + i * 10 },
  }));

// build on an instrumented doc: record every text() call with its page number
function render(n) {
  const doc = newDoc();
  const calls = [];
  const origText = doc.text.bind(doc);
  doc.text = (...args) => {
    calls.push({
      page: doc.getCurrentPageInfo().pageNumber,
      str: Array.isArray(args[0]) ? args[0].join(" ") : String(args[0]),
    });
    return origText(...args);
  };
  const rows = makeRows(n);
  buildWeekly({
    rows,
    settings,
    periodStart: "2026-07-12",
    periodEnd: "2026-07-18",
    sig: null,
    letterhead,
    doc,
  });
  return {
    pages: doc.getNumberOfPages(),
    calls,
    grandTotalPages: [...new Set(calls.filter((c) => c.str === "GRAND TOTAL").map((c) => c.page))],
    bankPages: [...new Set(calls.filter((c) => c.str === "BENEFICIARY BANK DETAILS").map((c) => c.page))],
    // one text call per row cell -> counting invoice-number strings on a page
    // counts the rows drawn on it (duplicate numbers still one call per row)
    rowTextsOn: (p) => calls.filter((c) => c.page === p && /^BAM-\d{8}-\d{2}$/.test(c.str)).length,
  };
}

describe("weekly statement pagination", () => {
  it("small statement: one page, roomy, bank box present", () => {
    const r = render(5);
    expect(r.pages).toBe(1);
    expect(r.grandTotalPages).toEqual([1]);
    expect(r.bankPages).toEqual([1]);
  });

  it("full-but-fits statement: one page, tight, bank box dropped", () => {
    const r = render(11);
    expect(r.pages).toBe(1);
    expect(r.grandTotalPages).toEqual([1]);
    expect(r.bankPages).toEqual([]); // no space -> no bank info
  });

  it("slightly over: row height compresses to keep one page", () => {
    const r = render(13);
    expect(r.pages).toBe(1);
    expect(r.grandTotalPages).toEqual([1]);
  });

  it("16-row overflow (the reported bug): even 8/8 split, totals with the table", () => {
    const r = render(16);
    expect(r.pages).toBe(2);
    expect(r.rowTextsOn(1)).toBe(8);
    expect(r.rowTextsOn(2)).toBe(8);
    // regression: GRAND TOTAL must share its page with table rows
    expect(r.grandTotalPages).toEqual([2]);
    expect(r.rowTextsOn(r.grandTotalPages[0])).toBeGreaterThan(0);
  });

  it("totals never orphaned for any realistic size", () => {
    for (const n of [1, 7, 12, 14, 18, 22, 30, 44]) {
      const r = render(n);
      expect(r.grandTotalPages.length).toBe(1);
      const gp = r.grandTotalPages[0];
      expect(r.rowTextsOn(gp)).toBeGreaterThan(0);
    }
  });
});
