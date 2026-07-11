// DailyTab — build an invoice from one or more item lines for a delivery site,
// then list the day's invoices. Each invoice (order) can carry several items.
import { useState } from "react";
import { downloadInvoice } from "./invoicePdf.js";
import { money, dateLong, invoiceNo, totals, orderLines } from "./format.js";
import SignatureStrip from "./SignatureStrip.jsx";
import EditInvoice from "./EditInvoice.jsx";

export default function DailyTab({
  date, setDate, dayOrders, settings,
  onAdd, onRemove, onUpdate, signatures, activeSig, activeSigId, onPickSig, letterhead,
}) {
  const [location, setLocation] = useState("");
  const [editing, setEditing] = useState(null); // {date, index, order}
  const [qty, setQty] = useState("");
  const [itemIdx, setItemIdx] = useState(0);
  const [lines, setLines] = useState([]); // pending lines for the invoice being built
  const items = settings.items || [];
  const selected = items[Math.min(itemIdx, items.length - 1)] || items[0] || { description: "", unitPrice: 0 };

  function addLine() {
    const q = Number(qty);
    if (!q || q <= 0) return;
    setLines((ls) => [...ls, { item: selected.description, qty: q, unitPrice: Number(selected.unitPrice) || 0 }]);
    setQty("");
  }
  function removeLine(i) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }
  function createInvoice() {
    // allow a quick single-line add: if a qty is typed but not yet "added", include it
    let pending = lines;
    const q = Number(qty);
    if (q > 0) pending = [...lines, { item: selected.description, qty: q, unitPrice: Number(selected.unitPrice) || 0 }];
    if (!location.trim() || pending.length === 0) return;
    onAdd(date, location.trim(), pending);
    setLines([]);
    setLocation("");
    setQty("");
  }

  const pendingSubtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
    + (Number(qty) > 0 ? Number(qty) * (Number(selected.unitPrice) || 0) : 0);

  const t = totals(dayOrders, settings.vatRate);

  function downloadOne(order, index) {
    downloadInvoice({ order, date, index, settings, sig: activeSig, letterhead });
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

      {/* invoice builder */}
      <div className="rounded-xl border border-tcreamDark bg-white p-4">
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">Delivery site</span>
          <input
            type="text" value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Luminar 2, JVT Area"
            className="w-full rounded-lg border border-tcreamDark bg-white px-3 py-2 text-sm outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30"
          />
        </label>

        {/* add-line row */}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_90px_auto]">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">Item</span>
            <select
              value={itemIdx}
              onChange={(e) => setItemIdx(Number(e.target.value))}
              className="w-full rounded-lg border border-tcreamDark bg-white px-3 py-2 text-sm text-tnavy outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30"
            >
              {items.map((it, i) => (
                <option key={i} value={i}>{it.description} — AED {money(it.unitPrice)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">Quantity</span>
            <input
              type="number" min="1" inputMode="numeric"
              value={qty} onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLine()}
              placeholder="0"
              className="w-full rounded-lg border border-tcreamDark bg-white px-3 py-2 text-sm outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30"
            />
          </label>
          <button
            onClick={addLine}
            className="self-end rounded-lg border border-tnavy px-4 py-2 text-sm font-semibold text-tnavy transition hover:bg-tcream"
          >
            + Add item
          </button>
        </div>

        {/* pending lines on this invoice */}
        {lines.length > 0 && (
          <ul className="mt-3 space-y-1.5 rounded-lg bg-tcream/60 p-2">
            {lines.map((l, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-tnavy">
                  <b>{l.qty}</b> × {l.item}
                </span>
                <span className="tabular-nums text-slate">AED {money(l.qty * l.unitPrice)}</span>
                <button onClick={() => removeLine(i)} title="Remove line" className="px-1.5 text-[#C0392B] hover:text-red-700">×</button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-slate">
            {lines.length > 0 || Number(qty) > 0 ? (
              <>Invoice subtotal: <b className="text-tnavy">AED {money(pendingSubtotal)}</b></>
            ) : (
              "Add one or more items, then create the invoice."
            )}
          </span>
          <button
            onClick={createInvoice}
            disabled={!location.trim() || (lines.length === 0 && Number(qty) <= 0)}
            className="rounded-lg bg-tnavy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-tnavy/90 disabled:opacity-40"
          >
            Create invoice
          </button>
        </div>
      </div>

      <SignatureStrip signatures={signatures} activeSigId={activeSigId} onPick={onPickSig} />

      {/* invoice list */}
      {dayOrders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-tcreamDark py-10 text-center text-sm text-slate">
          No deliveries logged for this date yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {dayOrders.map((o, i) => {
            const ols = orderLines(o);
            return (
              <li
                key={o.id}
                className="rounded-lg border border-tcreamDark border-l-4 border-l-tgold bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-tnavy">{o.location}</p>
                    <p className="mt-0.5 text-[11px] font-mono text-slate/60">{invoiceNo(date, i)}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-tnavy">AED {money(o.amount)}</span>
                  <button
                    onClick={() => downloadOne(o, i)}
                    title="Download invoice PDF"
                    className="shrink-0 rounded-lg border border-tcreamDark px-2.5 py-1.5 text-sm hover:border-tgold hover:bg-tcream"
                  >
                    📄
                  </button>
                  <button
                    onClick={() => setEditing({ date, index: i, order: o })}
                    title="Edit invoice"
                    className="shrink-0 rounded-lg border border-tcreamDark px-2.5 py-1.5 text-sm hover:border-tgold hover:bg-tcream"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => onRemove(date, o.id)}
                    title="Remove"
                    className="shrink-0 rounded-lg px-2 py-1.5 text-lg font-bold text-[#C0392B] hover:bg-red-50"
                  >
                    ×
                  </button>
                </div>
                <ul className="mt-1.5 space-y-0.5 border-t border-tcreamDark pt-1.5">
                  {ols.map((l, li) => (
                    <li key={li} className="flex justify-between text-xs text-slate">
                      <span><b className="text-tnavy">{l.qty}</b> × {l.item}</span>
                      <span className="tabular-nums">AED {money(l.amount ?? l.qty * l.unitPrice)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}

      {/* day summary */}
      {dayOrders.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-tnavy text-white sm:grid-cols-4">
            <Stat label="Parcels" value={t.qty} />
            <Stat label="Subtotal" value={`AED ${money(t.subtotal)}`} />
            <Stat label={`VAT ${settings.vatRate}%`} value={`AED ${money(t.vat)}`} />
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

function Stat({ label, value, strong }) {
  return (
    <div className="bg-tnavy px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">{label}</p>
      <p className={"tabular-nums " + (strong ? "text-base font-bold text-tgold" : "text-sm font-semibold")}>{value}</p>
    </div>
  );
}
