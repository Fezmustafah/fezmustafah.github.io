// EditInvoice — modal to fix an invoice after it was created: rename the
// delivery location, move the date, edit/add/remove item lines, or delete the
// whole invoice. PDFs are built from the stored data on download, so an edit
// here flows into the daily invoice and the weekly statement automatically.
import { useState } from "react";
import { money, invoiceNo, orderLines } from "./format.js";

export default function EditInvoice({ row, settings, onSave, onDelete, onClose }) {
  const { order } = row;
  const [date, setDate] = useState(row.date);
  const [location, setLocation] = useState(order.location || "");
  const [lines, setLines] = useState(
    orderLines(order).map((l) => ({
      item: l.item || "",
      qty: String(l.qty ?? ""),
      unitPrice: String(l.unitPrice ?? ""),
    })),
  );

  const items = settings.items || [];
  const valid = lines
    .map((l) => ({ item: l.item.trim(), qty: Number(l.qty), unitPrice: Number(l.unitPrice) || 0 }))
    .filter((l) => l.item && l.qty > 0);
  const subtotal = valid.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const canSave = location.trim() && valid.length > 0 && date;

  function setLine(i, key, value) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)));
  }
  function addLine() {
    const first = items[0] || { description: "", unitPrice: 0 };
    setLines((ls) => [...ls, { item: first.description, qty: "", unitPrice: String(first.unitPrice) }]);
  }
  function removeLine(i) {
    setLines((ls) => ls.filter((_, idx) => idx !== i));
  }
  function save() {
    if (!canSave) return;
    onSave(row.date, order.id, { date, location: location.trim(), lines: valid });
    onClose();
  }
  function del() {
    if (window.confirm("Delete this invoice? It moves to the Deleted tab and can be restored.")) {
      onDelete(row.date, order.id);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tnavy/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-tnavy">Edit invoice</h3>
            <p className="mt-0.5 font-mono text-[11px] text-slate/70">{invoiceNo(row.date, row.index)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-lg font-bold text-slate hover:bg-tcream">×</button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">Date</span>
            <input
              type="date" value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-tcreamDark bg-white px-3 py-2 text-sm outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">Delivery site / location</span>
            <input
              type="text" value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Luminar 2, JVT Area"
              className="w-full rounded-lg border border-tcreamDark bg-white px-3 py-2 text-sm outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30"
            />
          </label>
        </div>
        {date !== row.date && (
          <p className="mt-2 rounded-lg bg-tgold/15 px-3 py-2 text-xs text-tnavy">
            Moving the date re-files this invoice under {date} — its invoice number follows the new date.
          </p>
        )}

        <div className="mt-4">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">Items</span>
          <ul className="space-y-2">
            {lines.map((l, i) => (
              <li key={i} className="grid grid-cols-[1fr_64px_84px_auto] items-center gap-2">
                <input
                  type="text" value={l.item} list="edit-inv-items"
                  onChange={(e) => setLine(i, "item", e.target.value)}
                  placeholder="Item"
                  className="rounded-lg border border-tcreamDark px-2.5 py-1.5 text-sm outline-none focus:border-tgold"
                />
                <input
                  type="number" min="1" inputMode="numeric" value={l.qty}
                  onChange={(e) => setLine(i, "qty", e.target.value)}
                  placeholder="Qty"
                  className="rounded-lg border border-tcreamDark px-2.5 py-1.5 text-sm outline-none focus:border-tgold"
                />
                <input
                  type="number" min="0" step="0.01" inputMode="decimal" value={l.unitPrice}
                  onChange={(e) => setLine(i, "unitPrice", e.target.value)}
                  placeholder="Price"
                  className="rounded-lg border border-tcreamDark px-2.5 py-1.5 text-sm outline-none focus:border-tgold"
                />
                <button onClick={() => removeLine(i)} title="Remove line" className="px-1.5 text-[#C0392B] hover:text-red-700">×</button>
              </li>
            ))}
          </ul>
          <datalist id="edit-inv-items">
            {items.map((it, i) => <option key={i} value={it.description} />)}
          </datalist>
          <div className="mt-2 flex items-center justify-between">
            <button onClick={addLine} className="rounded-lg border border-tnavy px-3 py-1.5 text-xs font-semibold text-tnavy hover:bg-tcream">
              + Add item
            </button>
            <span className="text-xs text-slate">
              Subtotal: <b className="text-tnavy">AED {money(subtotal)}</b>
            </span>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2 border-t border-tcreamDark pt-4">
          <button onClick={del} className="rounded-lg border border-[#C0392B] px-3 py-2 text-sm font-semibold text-[#C0392B] hover:bg-red-50">
            Delete invoice
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="rounded-lg border border-tcreamDark px-4 py-2 text-sm font-semibold text-tnavy hover:bg-tcream">
            Cancel
          </button>
          <button
            onClick={save} disabled={!canSave}
            className="rounded-lg bg-tnavy px-5 py-2 text-sm font-semibold text-white hover:bg-tnavy/90 disabled:opacity-40"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
