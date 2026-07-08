// netting.js — PURE vendor-netting core (data in → totals out). No React, no
// storage, no imports — mirrors the "pure lib" discipline of the tracker PDFs.
//
// THE MODEL (matches both existing sheets — Ocean vehicle grid & Haseeb ledger):
//   Every money event with a vendor is ONE signed line on that vendor's ledger.
//   side = "AR"  → they owe us   (our vehicles they used, our services sold to them)
//   side = "AP"  → we owe them   (safari camps, yacht, cruise seats we bought)
//   amount may be NEGATIVE within a side to represent a correction / refund
//     (Haseeb's "CAMP REFUND -10400" is an AP line with amount -10400 → it
//      reduces what we owe, exactly like the sheet's negative cost cell).
//
//   NET (from OUR perspective) = openingBalance + Σ(AR) − Σ(AP)
//     NET > 0  → they pay us      (receivable — issue statement / invoice)
//     NET < 0  → we pay them      (payable)
//     NET = 0  → settled
//   openingBalance sign: >0 = they carried in owing us; <0 = we carried in owing them.

export const AR = "AR"; // they owe us
export const AP = "AP"; // we owe them

// kinds are for grouping/reporting only; they do NOT change the math (side does).
export const KIND = {
  VEHICLE: "vehicle", // our vehicle they used            (AR)
  SERVICE: "service", // any other service we sold them    (AR)
  CAMP: "camp", // desert-safari camp we bought      (AP)
  YACHT: "yacht", // yacht we bought                   (AP)
  CRUISE: "cruise", // cruise seats we bought            (AP)
  PURCHASE: "purchase", // generic "we bought"           (AP)
  ADJUSTMENT: "adjustment", // manual correction (either side, signed)
  REFUND: "refund", // money back (usually AP, negative)
  OPENING: "opening", // carried-forward balance
};

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100; // 2dp (fils)
const amt = (line) => Number(line.amount) || 0;

/**
 * Compute the month's net for one vendor.
 * @param {Array} lines  [{ date, side:"AR"|"AP", kind, label, qty, rate, amount }]
 * @param {Object} opts  { openingBalance?:number, currency?:string }
 */
export function computeNet(lines = [], opts = {}) {
  const opening = r2(opts.openingBalance);
  let theyOweUs = 0;
  let weOweThem = 0;
  const byKind = {};

  for (const l of lines) {
    const a = amt(l);
    const isAP = l.side === AP;
    if (isAP) weOweThem += a;
    else theyOweUs += a; // default/any non-AP treated as AR
    const k = l.kind || "other";
    byKind[k] = r2((byKind[k] || 0) + (isAP ? -a : a));
  }

  theyOweUs = r2(theyOweUs);
  weOweThem = r2(weOweThem);
  const net = r2(opening + theyOweUs - weOweThem);

  return {
    theyOweUs,
    weOweThem,
    opening,
    net,
    absNet: r2(Math.abs(net)),
    direction: net > 0 ? "receivable" : net < 0 ? "payable" : "settled",
    currency: opts.currency || "AED",
    byKind,
    lineCount: lines.length,
  };
}

/**
 * Expand a cruise-style vehicle count grid into AR ledger lines using a rate card.
 * Mirrors the "Ocean Cruise Invoice" sheet: per day, count × rate per vehicle type.
 * @param {Array} grid      [{ date, counts: { [typeId]: number } }]
 * @param {Array} rateCard  [{ id, label, rate }]
 */
export function vehicleLinesFromGrid(grid = [], rateCard = []) {
  const rateById = Object.fromEntries(rateCard.map((t) => [t.id, t]));
  const out = [];
  for (const day of grid) {
    for (const [typeId, qtyRaw] of Object.entries(day.counts || {})) {
      const qty = Number(qtyRaw) || 0;
      if (!qty) continue;
      const t = rateById[typeId];
      if (!t) continue; // unknown vehicle type → skip (surfaced in UI)
      out.push({
        date: day.date,
        side: AR,
        kind: KIND.VEHICLE,
        label: t.label,
        qty,
        rate: Number(t.rate) || 0,
        amount: r2(qty * (Number(t.rate) || 0)),
      });
    }
  }
  return out;
}

/**
 * Build ledger rows with a running balance, for the statement PDF / table.
 * Running balance is from OUR perspective (positive = they owe us).
 * @returns {Array} [{ date, label, kind, debit, credit, running }]
 *   debit  = increases what they owe us (AR amount, or a negative AP i.e. refund)
 *   credit = increases what we owe them (AP amount)
 */
export function ledgerRows(lines = [], openingBalance = 0) {
  let running = r2(openingBalance);
  const rows = [];
  if (openingBalance) {
    rows.push({
      date: "",
      label: "Opening balance",
      kind: KIND.OPENING,
      debit: openingBalance > 0 ? r2(openingBalance) : 0,
      credit: openingBalance < 0 ? r2(-openingBalance) : 0,
      running,
    });
  }
  const sorted = [...lines].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const l of sorted) {
    const a = amt(l);
    const arDelta = l.side === AP ? -a : a; // effect on "they owe us"
    running = r2(running + arDelta);
    rows.push({
      date: l.date || "",
      label: l.label || l.kind || "",
      kind: l.kind || "other",
      debit: arDelta > 0 ? r2(arDelta) : 0,
      credit: arDelta < 0 ? r2(-arDelta) : 0,
      running,
    });
  }
  return rows;
}
