// WeeklyTab — table of every tracked invoice + consolidated statement download.
import { useState } from "react";
import { downloadWeekly } from "./weeklyPdf.js";
import { downloadStatementPack } from "./statementPack.js";
import { money, dateShort, invoiceNo, totals } from "./format.js";
import SignatureStrip from "./SignatureStrip.jsx";
import EditInvoice from "./EditInvoice.jsx";

export default function WeeklyTab({
  rows, settings, onClearWeek, onRemove, onUpdate, periodStart, periodEnd,
  signatures, activeSig, activeSigId, onPickSig, letterhead,
}) {
  const [editing, setEditing] = useState(null); // {date, index, order}
  const t = totals(rows.map((r) => r.order), settings.vatRate);
  const days = new Set(rows.map((r) => r.date)).size;

  // Which company this statement is billed to. Defaults to the saved active
  // buyer but can be switched here per-download WITHOUT changing the saved
  // default (Settings owns that). Choosing here only affects the printed PDF.
  const buyers = settings.buyers && settings.buyers.length ? settings.buyers : [settings.buyer];
  const [weeklyBuyerId, setWeeklyBuyerId] = useState(settings.buyerId || buyers[0]?.id);
  const statementBuyer = buyers.find((b) => b.id === weeklyBuyerId) || settings.buyer;
  const [building, setBuilding] = useState(false);

  function downloadStatement() {
    if (!rows.length) return;
    const stSettings = { ...settings, buyer: { ...statementBuyer } };
    downloadWeekly({ rows, settings: stSettings, periodStart, periodEnd, sig: activeSig, letterhead });
  }

  // Full pack: statement + a signed invoice for every line, in ONE PDF.
  function downloadPack() {
    if (!rows.length || building) return;
    const stSettings = { ...settings, buyer: { ...statementBuyer } };
    setBuilding(true);
    // defer so the button repaints "Building…" before the synchronous build
    setTimeout(() => {
      try {
        downloadStatementPack({ rows, settings: stSettings, periodStart, periodEnd, sig: activeSig, letterhead });
      } catch (err) {
        console.error("SoA pack failed", err);
        window.alert("Could not build the SoA bundle. Please try again.");
      } finally {
        setBuilding(false);
      }
    }, 20);
  }
  function clearWeek() {
    if (window.confirm("Clear all tracked orders and start a new week? This cannot be undone.")) {
      onClearWeek();
    }
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-tnavy">
          Period: {dateShort(periodStart)} — {dateShort(periodEnd)}
        </h3>
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
            {rows.map((r, i) => (
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
        <b className="text-tnavy">{rows.length}</b> &nbsp;|&nbsp; Days: <b className="text-tnavy">{days}</b>
      </p>

      <SignatureStrip signatures={signatures} activeSigId={activeSigId} onPick={onPickSig} />

      <div className="flex flex-wrap gap-3">
        <button
          onClick={downloadStatement}
          className="flex-1 rounded-lg bg-tnavy px-4 py-3 text-sm font-bold text-white transition hover:bg-tnavy/90"
        >
          Download Weekly Statement
        </button>
        <button
          onClick={downloadPack}
          disabled={building}
          className="flex-1 rounded-lg border-2 border-tgold bg-tgold/10 px-4 py-3 text-sm font-bold text-tnavy transition hover:bg-tgold/20 disabled:cursor-wait disabled:opacity-60"
        >
          {building ? "Building bundle…" : "Download SoA + All Invoices"}
        </button>
        <button
          onClick={clearWeek}
          className="rounded-lg border border-[#C0392B] px-4 py-3 text-sm font-semibold text-[#C0392B] transition hover:bg-red-50"
        >
          Clear Week &amp; Start New
        </button>
      </div>
      <p className="text-[11px] text-slate">
        <b className="text-tnavy">SoA + All Invoices</b> = the statement above followed by a signed tax invoice for
        every line, in one PDF the buyer can verify without asking for each invoice.
      </p>

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
