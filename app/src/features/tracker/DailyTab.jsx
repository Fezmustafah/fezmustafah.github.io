// DailyTab — order entry + per-day order list for the selected date.
import { useState } from "react";
import { downloadInvoice } from "./invoicePdf.js";
import { money, dateLong, invoiceNo, totals } from "./format.js";
import SignatureStrip from "./SignatureStrip.jsx";

export default function DailyTab({
  date, setDate, dayOrders, settings,
  onAdd, onRemove, signatures, activeSig, activeSigId, onPickSig,
}) {
  const [qty, setQty] = useState("");
  const [location, setLocation] = useState("");
  const { item } = settings;

  function submit() {
    const q = Number(qty);
    if (!q || q <= 0 || !location.trim()) return;
    onAdd(date, q, location.trim());
    setQty("");
    setLocation("");
  }

  const t = totals(dayOrders, item.vatRate);

  function downloadOne(order, index) {
    downloadInvoice({ order, date, index, settings, sig: activeSig });
  }
  async function downloadAll() {
    for (let i = 0; i < dayOrders.length; i++) {
      downloadOne(dayOrders[i], i);
      await new Promise((r) => setTimeout(r, 300)); // stagger so the browser allows each download
    }
  }

  return (
    <div className="space-y-5">
      {/* date picker */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">Delivery date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-tcreamDark bg-white px-3 py-2 text-sm font-semibold text-tnavy outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30"
          />
        </label>
        <span className="text-sm text-slate">{dateLong(date)}</span>
      </div>

      {/* add order row */}
      <div className="rounded-xl border border-tcreamDark bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[100px_1fr_auto]">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">Quantity</span>
            <input
              type="number" min="1" inputMode="numeric"
              value={qty} onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-tcreamDark bg-white px-3 py-2 text-sm outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">Delivery site</span>
            <input
              type="text" value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="e.g. Luminar 2, JVT Area"
              className="w-full rounded-lg border border-tcreamDark bg-white px-3 py-2 text-sm outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30"
            />
          </label>
          <button
            onClick={submit}
            className="self-end rounded-lg bg-tnavy px-5 py-2 text-sm font-semibold text-white transition hover:bg-tnavy/90"
          >
            Add
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate/70">Item</span>
            <input disabled value={item.description}
              className="w-full rounded-lg border border-tcreamDark bg-tcream px-3 py-2 text-sm text-slate" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate/70">Unit price (AED)</span>
            <input disabled value={money(item.unitPrice)}
              className="w-full rounded-lg border border-tcreamDark bg-tcream px-3 py-2 text-sm text-slate" />
          </label>
        </div>
      </div>

      <SignatureStrip signatures={signatures} activeSigId={activeSigId} onPick={onPickSig} />

      {/* order list */}
      {dayOrders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-tcreamDark py-10 text-center text-sm text-slate">
          No deliveries logged for this date yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {dayOrders.map((o, i) => (
            <li
              key={o.id}
              className="flex items-center gap-3 rounded-lg border border-tcreamDark border-l-4 border-l-tgold bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-tnavy">
                  {o.qty} × {o.item}
                </p>
                <p className="truncate text-xs text-slate">{o.location}</p>
                <p className="mt-0.5 text-[11px] font-mono text-slate/60">{invoiceNo(date, i)}</p>
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums text-tnavy">
                AED {money(o.amount)}
              </span>
              <button
                onClick={() => downloadOne(o, i)}
                title="Download invoice PDF"
                className="shrink-0 rounded-lg border border-tcreamDark px-2.5 py-1.5 text-sm hover:border-tgold hover:bg-tcream"
              >
                📄
              </button>
              <button
                onClick={() => onRemove(date, o.id)}
                title="Remove"
                className="shrink-0 rounded-lg px-2 py-1.5 text-lg font-bold text-[#C0392B] hover:bg-red-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* day summary */}
      {dayOrders.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-tnavy text-white sm:grid-cols-4">
            <Stat label="Parcels" value={t.qty} />
            <Stat label="Subtotal" value={`AED ${money(t.subtotal)}`} />
            <Stat label={`VAT ${item.vatRate}%`} value={`AED ${money(t.vat)}`} />
            <Stat label="Day total" value={`AED ${money(t.total)}`} strong />
          </div>
          <button
            onClick={downloadAll}
            className="w-full rounded-lg bg-tgold px-4 py-3 text-sm font-bold text-tnavy transition hover:brightness-105"
          >
            Download All Daily Invoices ({dayOrders.length})
          </button>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, strong }) {
  return (
    <div className="bg-tnavy px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">{label}</p>
      <p className={"tabular-nums " + (strong ? "text-base font-bold text-tgold" : "text-sm font-semibold")}>{value}</p>
    </div>
  );
}
