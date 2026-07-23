// period.js — billing-period maths for the tracker statement.
//
// The statement used to be a fixed rolling 7-day window anchored on the first
// delivery. It is now selectable: daily / weekly / monthly / custom / all.
// Weekly keeps the old behaviour exactly — a 7-day window measured from the
// tracking anchor — so existing periods still line up after this change.
import { addDays, daysBetween, dateShort, todayIso } from "./format.js";

export const PERIOD_MODES = [
  { key: "daily", label: "Daily", title: "DAILY STATEMENT", days: 1 },
  { key: "weekly", label: "Weekly", title: "WEEKLY STATEMENT", days: 7 },
  { key: "monthly", label: "Monthly", title: "MONTHLY STATEMENT", days: 30 },
  { key: "custom", label: "Custom", title: "STATEMENT OF ACCOUNT", days: 0 },
  { key: "all", label: "All time", title: "STATEMENT OF ACCOUNT", days: 0 },
];

export function isPeriodMode(key) {
  return PERIOD_MODES.some((m) => m.key === key);
}

export function periodMode(key) {
  return PERIOD_MODES.find((m) => m.key === key) || PERIOD_MODES[1];
}

export function periodTitle(mode) {
  return periodMode(mode).title;
}

const parts = (iso) => iso.split("-").map(Number);
const iso = (y, m, d) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// last day of month m (1-12) in year y
export function monthEnd(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// The period that CONTAINS `date`.
//   daily   — that single day
//   weekly  — the 7-day window measured from `anchor` (the tracking start)
//   monthly — the calendar month
//   custom  — whatever the caller already holds (returned unchanged)
//   all     — the caller's full data range (bounds passed in)
export function periodRange(mode, date, { anchor, first, last } = {}) {
  const d = date || todayIso();
  if (mode === "daily") return { start: d, end: d };
  if (mode === "monthly") {
    const [y, m] = parts(d);
    return { start: iso(y, m, 1), end: iso(y, m, monthEnd(y, m)) };
  }
  if (mode === "all") {
    return { start: first || d, end: last || d };
  }
  // weekly (and the fallback for custom without a stored range)
  const a = anchor || d;
  const offset = Math.floor(daysBetween(a, d) / 7) * 7;
  const start = addDays(a, offset);
  return { start, end: addDays(start, 6) };
}

// Move a range one period back (-1) or forward (+1).
export function shiftRange(mode, range, dir) {
  if (mode === "daily") {
    const s = addDays(range.start, dir);
    return { start: s, end: s };
  }
  if (mode === "monthly") {
    const [y, m] = parts(range.start);
    const nm = m + dir;
    const ny = y + Math.floor((nm - 1) / 12);
    const mm = ((nm - 1 + 12) % 12) + 1;
    return { start: iso(ny, mm, 1), end: iso(ny, mm, monthEnd(ny, mm)) };
  }
  if (mode === "weekly") {
    const s = addDays(range.start, 7 * dir);
    return { start: s, end: addDays(s, 6) };
  }
  // custom / all: slide by the range's own length
  const len = daysBetween(range.start, range.end) + 1;
  return { start: addDays(range.start, len * dir), end: addDays(range.end, len * dir) };
}

export function inRange(date, range) {
  return !!range && date >= range.start && date <= range.end;
}

export function rangeLabel(range) {
  if (!range) return "";
  return range.start === range.end
    ? dateShort(range.start)
    : `${dateShort(range.start)} — ${dateShort(range.end)}`;
}

// Statement is due the day after the period closes.
export function periodDue(range) {
  return addDays(range.end, 1);
}

export function periodLength(range) {
  return daysBetween(range.start, range.end) + 1;
}
