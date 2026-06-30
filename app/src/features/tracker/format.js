// format.js — small pure helpers shared by the tracker UI and the PDF builders.
// Kept separate so invoice numbers / money / dates are formatted identically
// everywhere (table, screen, and both PDFs).

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "2026-06-25" -> "25 June 2026"
export function dateLong(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// "2026-06-25" -> "25 Jun 2026"
export function dateShort(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

// money(1234.5) -> "1,234.50"  (always 2 dp, comma thousands)
export function money(n) {
  return Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Invoice number for the n-th delivery on a given date.
// invoiceNo("2026-06-25", 0) -> "BAM-20260625-01"
export function invoiceNo(iso, index) {
  return `BAM-${iso.replace(/-/g, "")}-${String(index + 1).padStart(2, "0")}`;
}

// Today as a local ISO date (YYYY-MM-DD), not UTC — so a delivery added at
// 1am Dubai time files under today, not yesterday.
export function todayIso() {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 10);
}

// add N days to an ISO date -> ISO date
export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// whole days from a -> b (b - a)
export function daysBetween(a, b) {
  const da = Date.UTC(...a.split("-").map(Number).map((v, i) => (i === 1 ? v - 1 : v)));
  const db = Date.UTC(...b.split("-").map(Number).map((v, i) => (i === 1 ? v - 1 : v)));
  return Math.round((db - da) / 86400000);
}

// An order can hold several line items. Older orders stored a single
// item/qty/unitPrice/amount; normalise both shapes to a lines array.
export function orderLines(order) {
  if (Array.isArray(order.lines) && order.lines.length) return order.lines;
  return [{ item: order.item, qty: order.qty, unitPrice: order.unitPrice, amount: order.amount }];
}
export function orderQty(order) {
  return orderLines(order).reduce((s, l) => s + (Number(l.qty) || 0), 0);
}
export function orderAmount(order) {
  return orderLines(order).reduce((s, l) => s + (Number(l.amount) || 0), 0);
}

// Map a party's custom fields (seller/buyer `extra: [{label,value}]`) to PDF
// body lines. Blank entries are dropped; label is optional.
export function extraLines(party) {
  const ex = (party && Array.isArray(party.extra)) ? party.extra : [];
  return ex
    .filter((f) => f && (f.value || f.label))
    .map((f) => ({ text: f.label ? `${f.label}: ${f.value || ""}` : String(f.value || "") }));
}

// VAT / totals across a list of orders (each order may have multiple lines).
export function totals(orders, vatRate) {
  const subtotal = orders.reduce((s, o) => s + orderAmount(o), 0);
  const vat = subtotal * (vatRate / 100);
  const qty = orders.reduce((s, o) => s + orderQty(o), 0);
  return { subtotal, vat, total: subtotal + vat, qty };
}
