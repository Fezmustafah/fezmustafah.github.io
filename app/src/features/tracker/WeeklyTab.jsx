// WeeklyTab — statement view. Lists the invoices inside the SELECTED billing
// period and builds the statement PDFs from exactly those rows.
//
// The period used to be a fixed 7-day window. It is now switchable — daily /
// weekly / monthly / custom / all time — with prev/next navigation, so past
// weeks and whole months can be re-issued without clearing anything.
import { useEffect, useRef, useState } from "react";
import { downloadWeekly } from "./weeklyPdf.js";
import { downloadStatementPack } from "./statementPack.js";
import { money, dateShort, invoiceNo, totals, todayIso } from "./format.js";
import { PERIOD_MODES, periodRange, shiftRange, inRange, rangeLabel, periodTitle } from "./period.js";
import SignatureStrip from "./SignatureStrip.jsx";
import EditInvoice from "./EditInvoice.jsx";

export default function WeeklyTab({
  rows, settings, mode, onMode, savedRange, onCustomRange,
  anchor, firstDate, lastDate,
  onClearPeriod, onRemove, onUpdate,
  signatures, activeSig, activeSigId, onPickSig, letterhead,
}) {
  const [editing, setEditing] = useState(null); // {date, index, order}
  const bounds = { anchor, first: firstDate, last: lastDate };
  // start on the period holding the most recent invoice (matches what the old
  // fixed window showed for a week in progress); a custom range is remembered
  // in meta, so it survives leaving the tab.
  const [range, setRange] = useState(() =>
    mode === "custom" && savedRange && savedRange.start && savedRange.end
      ? savedRange
      : periodRange(mode, lastDate, bounds));
  const applied = useRef(mode);

  // custom dates are persisted; the other cycles are recomputed from the mode.
  function setCustom(next) {
    setRange(next);
    onCustomRange(next);
  }

  // follow a mode change (the choice is persisted in meta, so it can also
  // arrive from another device): re-frame the period around the current one.
  useEffect(() => {
    if (applied.current === mode) return;
    applied.current = mode;
    if (mode === "custom") return; // keep whatever range is on screen
    setRange(periodRange(mode, range.start, bounds));
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // "all time" always spans the full data set
  useEffect(() => {
    if (mode === "all") setRange({ start: firstDate, end: lastDate });
  }, [mode, firstDate, lastDate]);

  const periodRows = rows.filter((r) => inRange(r.date, range));
  const t = totals(periodRows.map((r) => r.order), settings.vatRate);
  const days = new Set(periodRows.map((r) => r.date)).size;
  const title = periodTitle(mode);

  // Which company this statement is billed to. Defaults to the saved active
  // buyer but can be switched here per-download WITHOUT changing the saved
  // default (Settings owns that). Choosing here only affects the printed PDF.
  const buyers = settings.buyers && settings.buyers.length ? settings.buyers : [settings.buyer];
  const [weeklyBuyerId, setWeeklyBuyerId] = useState(settings.buyerId || buyers[0]?.id);
  const statementBuyer = buyers.find((b) => b.id === weeklyBuyerId) || settings.buyer;
  const [building, setBuilding] = useState(false);

  const pdfArgs = () => ({
    rows: periodRows,
    settings: { ...settings, buyer: { ...statementBuyer } },
    periodStart: range.start,
    periodEnd: range.end,
    title,
    sig: activeSig,
    letterhead,
  });

  function downloadStatement() {
    if (!periodRows.length) return;
    downloadWeekly(pdfArgs());
  }

  // Full pack: statement + a signed invoice for every line, in ONE PDF.
  function downloadPack() {
    if (!periodRows.length || building) return;
    setBuilding(true);
    // defer so the button repaints "Building…" before the synchronous build
    setTimeout(() => {
      try {
        downloadStatementPack(pdfArgs());
      } catch (err) {
        console.error("SoA pack failed", err);
        window.alert("Could not build the SoA bundle. Please try again.");
      } finally {
        setBuilding(false);
      }
    }, 20);
  }

  function pickMode(m) {
    if (m === mode) return;
    applied.current = m;
    if (m === "custom") {
      onMode(m, range); // keep the window on screen and remember it
      return;
    }
    setRange(periodRange(m, range.start, bounds));
    onMode(m);
  }

  function clearPeriod() {
    if (!periodRows.length) return;
    const msg = `Move the ${periodRows.length} invoice${periodRows.length === 1 ? "" : "s"} in ${rangeLabel(range)} to Deleted?\n\nThey stay recoverable from the Deleted tab.`;
    if (window.confirm(msg)) onClearPeriod(range);
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-tcreamDark py-12 text-center text-sm text-slate">
        No orders tracked yet. Add deliveries in the Daily tab and they will roll up here.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ---- period picker -------------------------------------------------- */}
      <div className="space-y-3 rounded-xl border border-tcreamDark bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {PERIOD_MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => pickMode(m.key)}
                className={
                  "rounded-lg px-3 py-1.5 text-xs font-bold transition " +
                  (mode === m.key
                    ? "bg-tnavy text-white"
                    : "border border-tcreamDark text-tnavy hover:bg-tcream")
                }
              >
                {m.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-tnavy/70">Bill to</span>
            <select
              value={weeklyBuyerId}
              onChange={(e) => setWeeklyBuyerId(e.target.value)}
              className="rounded-lg border border-tcreamDark bg-white px-3 py-1.5 text-sm text-tnavy outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30"
            >
              {buyers.map((b) => (
                <option key={b.id} value={b.id}>{b.name || "Unnamed company"}</option>
              ))}
            </select>
          </label>
        </div>

        {mode === "custom" ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">From</span>
              <input
                type="date" value={range.start} max={range.end}
                onChange={(e) => e.target.value && setCustom({ ...range, start: e.target.value })}
                className="rounded-lg border border-tcreamDark bg-white px-3 py-1.5 text-sm outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">To</span>
              <input
                type="date" value={range.end} min={range.start}
                onChange={(e) => e.target.value && setCustom({ ...range, end: e.target.value })}
                className="rounded-lg border border-tcreamDark bg-white px-3 py-1.5 text-sm outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30"
              />
            </label>
            <button
              onClick={() => setCustom({ start: firstDate, end: lastDate })}
              className="rounded-lg border border-tcreamDark px-3 py-1.5 text-xs font-semibold text-tnavy hover:bg-tcream"
            >
              Everything
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {mode !== "all" && (
              <button
                onClick={() => setRange((r) => shiftRange(mode, r, -1))}
                title="Previous period"
                className="rounded-lg border border-tcreamDark px-2.5 py-1.5 text-sm font-bold text-tnavy hover:bg-tcream"
              >
                ‹
              </button>
            )}
            <h3 className="text-sm font-bold text-tnavy">{rangeLabel(range)}</h3>
            {mode !== "all" && (
              <>
                <button
                  onClick={() => setRange((r) => shiftRange(mode, r, 1))}
                  title="Next period"
                  className="rounded-lg border border-tcreamDark px-2.5 py-1.5 text-sm font-bold text-tnavy hover:bg-tcream"
                >
                  ›
                </button>
                <button
                  onClick={() => setRange(periodRange(mode, todayIso(), bounds))}
                  className="rounded-lg border border-tcreamDark px-3 py-1.5 text-xs font-semibold text-tnavy hover:bg-tcream"
                >
                  Current
                </button>
              </>
            )}
            <span className="text-xs text-slate">
              {periodRows.length} of {rows.length} invoice{rows.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </div>

      {!periodRows.length ? (
        <div className="rounded-xl border border-dashed border-tcreamDark py-10 text-center text-sm text-slate">
          No invoices in {rangeLabel(range)}. Use ‹ › to move to another period, or switch to All time.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-tcreamDark">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-tnavy text-left text-xs uppercase tracking-wider text-white">
                  <th className="px-3 py-2.5 font-semibold">#</th>
                  <th className="px-3 py-2.5 font-semibold">Invoice No</th>
                  <th className="px-3 py-2.5 font-semibold">Date</th>
                  <th className="px-3 py-2.5 font-semibold">Location</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Qty</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Amount (AED)</th>
                  <th className="px-2 py-2.5" aria-label="Edit" />
                </tr>
              </thead>
              <tbody>
                {periodRows.map((r, i) => (
                  <tr key={r.date + ":" + r.order.id} className={i % 2 ? "bg-tcream" : "bg-white"}>
                    <td className="px-3 py-2 text-slate">{i + 1}</td>
                    <td className="px-3 py-2 font-mono text-xs text-tnavy">{invoiceNo(r.date, r.index)}</td>
                    <td className="px-3 py-2 text-slate">{dateShort(r.date)}</td>
                    <td className="px-3 py-2 text-tnavy">{r.order.location}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.order.qty}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-tnavy">{money(r.order.amount)}</td>
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => setEditing(r)}
                        title="Edit invoice — location, items, date, or delete"
                        className="rounded-md px-1.5 py-1 text-sm text-slate transition hover:bg-tgold/20 hover:text-tnavy"
                      >
                        ✎
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-tnavy bg-tcream">
                  <td colSpan={4} className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-slate">Subtotal</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.qty}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-tnavy">{money(t.subtotal)}</td>
                  <td />
                </tr>
                <tr className="bg-tcream">
                  <td colSpan={5} className="px-3 py-1.5 text-right text-xs font-semibold uppercase text-slate">VAT ({settings.vatRate}%)</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-tnavy">{money(t.vat)}</td>
                  <td />
                </tr>
                <tr className="bg-tnavy text-white">
                  <td colSpan={5} className="px-3 py-2.5 text-right text-sm font-bold uppercase">Grand Total</td>
                  <td className="px-3 py-2.5 text-right text-sm font-bold tabular-nums text-tgold">AED {money(t.total)}</td>
                  <td className="bg-tnavy" />
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-xs text-slate">
            Total Parcels: <b className="text-tnavy">{t.qty}</b> &nbsp;|&nbsp; Total Invoices:{" "}
            <b className="text-tnavy">{periodRows.length}</b> &nbsp;|&nbsp; Days: <b className="text-tnavy">{days}</b>
          </p>

          <SignatureStrip signatures={signatures} activeSigId={activeSigId} onPick={onPickSig} />

          <div className="flex flex-wrap gap-3">
            <button
              onClick={downloadStatement}
              className="flex-1 rounded-lg bg-tnavy px-4 py-3 text-sm font-bold text-white transition hover:bg-tnavy/90"
            >
              Download {title.toLowerCase().replace(/(^|\s)\w/g, (s) => s.toUpperCase())}
            </button>
            <button
              onClick={downloadPack}
              disabled={building}
              className="flex-1 rounded-lg border-2 border-tgold bg-tgold/10 px-4 py-3 text-sm font-bold text-tnavy transition hover:bg-tgold/20 disabled:cursor-wait disabled:opacity-60"
            >
              {building ? "Building bundle…" : "Download SoA + All Invoices"}
            </button>
            <button
              onClick={clearPeriod}
              className="rounded-lg border border-[#C0392B] px-4 py-3 text-sm font-semibold text-[#C0392B] transition hover:bg-red-50"
            >
              Clear This Period
            </button>
          </div>
          <p className="text-[11px] text-slate">
            <b className="text-tnavy">SoA + All Invoices</b> = the statement above followed by a signed tax invoice for
            every line, in one PDF the buyer can verify without asking for each invoice.
            <b className="text-tnavy"> Clear This Period</b> only removes the {periodRows.length} invoice
            {periodRows.length === 1 ? "" : "s"} shown, and they stay recoverable in the Deleted tab.
          </p>
        </>
      )}

      {editing && (
        <EditInvoice
          row={editing} settings={settings}
          onSave={onUpdate} onDelete={onRemove}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
