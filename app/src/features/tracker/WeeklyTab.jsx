// WeeklyTab — table of every tracked invoice + consolidated statement download.
import { downloadWeekly } from "./weeklyPdf.js";
import { money, dateShort, invoiceNo, totals } from "./format.js";
import SignatureStrip from "./SignatureStrip.jsx";

export default function WeeklyTab({
  rows, settings, onClearWeek, periodStart, periodEnd,
  signatures, activeSig, activeSigId, onPickSig,
}) {
  const { item } = settings;
  const t = totals(rows.map((r) => r.order), item.vatRate);
  const days = new Set(rows.map((r) => r.date)).size;

  function downloadStatement() {
    if (!rows.length) return;
    downloadWeekly({ rows, settings, periodStart, periodEnd, sig: activeSig });
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
        <span className="text-xs text-slate">{settings.buyer.name}</span>
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
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-tnavy bg-tcream">
              <td colSpan={4} className="px-3 py-2.5 text-right text-xs font-semibold uppercase text-slate">Subtotal</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{t.qty}</td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-tnavy">{money(t.subtotal)}</td>
            </tr>
            <tr className="bg-tcream">
              <td colSpan={5} className="px-3 py-1.5 text-right text-xs font-semibold uppercase text-slate">VAT ({item.vatRate}%)</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-tnavy">{money(t.vat)}</td>
            </tr>
            <tr className="bg-tnavy text-white">
              <td colSpan={5} className="px-3 py-2.5 text-right text-sm font-bold uppercase">Grand Total</td>
              <td className="px-3 py-2.5 text-right text-sm font-bold tabular-nums text-tgold">AED {money(t.total)}</td>
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
          onClick={clearWeek}
          className="rounded-lg border border-[#C0392B] px-4 py-3 text-sm font-semibold text-[#C0392B] transition hover:bg-red-50"
        >
          Clear Week &amp; Start New
        </button>
      </div>
    </div>
  );
}
