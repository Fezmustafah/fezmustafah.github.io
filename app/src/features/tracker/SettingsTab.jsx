// SettingsTab — editable seller / buyer / item defaults, persisted to IndexedDB.
import { useState } from "react";
import { TRACKER_TEMPLATES, LAYOUTS } from "./constants.js";

// Tiny wireframe preview of each invoice layout (pure divs).
function LayoutThumb({ kind }) {
  const bar = "rounded-sm bg-tnavy/80";
  const soft = "rounded-sm bg-tnavy/15";
  if (kind === "sidebar") {
    return (
      <div className="flex h-14 gap-1">
        <div className="w-1/3 rounded-sm bg-tnavy/80" />
        <div className="flex flex-1 flex-col gap-1">
          <div className={"h-2 w-2/3 self-end " + bar} />
          <div className={"h-1.5 w-1/2 " + soft} />
          <div className={"mt-auto h-4 w-full " + soft} />
        </div>
      </div>
    );
  }
  if (kind === "centered") {
    return (
      <div className="flex h-14 flex-col gap-1">
        <div className={"mx-auto h-2 w-1/2 " + bar} />
        <div className="flex gap-1">
          <div className={"h-3 w-1/2 " + soft} />
          <div className={"h-3 w-1/2 " + soft} />
        </div>
        <div className={"mt-auto h-4 w-full " + soft} />
        <div className={"h-1.5 w-1/3 self-end " + bar} />
      </div>
    );
  }
  if (kind === "compact") {
    return (
      <div className="flex h-14 flex-col gap-1">
        <div className="flex justify-between">
          <div className={"h-2 w-1/3 " + bar} />
          <div className={"h-2 w-1/4 " + soft} />
        </div>
        <div className={"h-2.5 w-full " + soft} />
        <div className={"mt-auto h-4 w-full " + soft} />
        <div className={"h-1.5 w-1/3 self-end " + bar} />
      </div>
    );
  }
  // standard
  return (
    <div className="flex h-14 flex-col gap-1">
      <div className="flex gap-1">
        <div className={"h-4 w-1/2 " + soft} />
        <div className={"h-4 w-1/2 " + soft} />
      </div>
      <div className={"h-4 w-full " + soft} />
      <div className={"mt-auto h-1.5 w-1/3 self-end " + bar} />
    </div>
  );
}

function Field({ label, value, onChange, type = "text", multiline = false, placeholder = "" }) {
  const cls =
    "w-full rounded-lg border border-tcreamDark bg-white px-3 py-2 text-sm outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30";
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">{label}</span>
      {multiline ? (
        <textarea rows={2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cls + " resize-none"} />
      ) : (
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
          className={cls}
        />
      )}
    </label>
  );
}

function Card({ title, children }) {
  return (
    <div className="rounded-xl border border-tcreamDark bg-white p-4">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-tnavy">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// Editable list of custom label/value fields for a party. Empty rows are kept
// while editing and dropped from the PDF (see format.extraLines).
function ExtraFields({ fields, onChange }) {
  const inputCls =
    "rounded-lg border border-tcreamDark bg-white px-3 py-2 text-sm outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30";
  const set = (i, key, v) => onChange(fields.map((f, idx) => (idx === i ? { ...f, [key]: v } : f)));
  const add = () => onChange([...fields, { label: "", value: "" }]);
  const remove = (i) => onChange(fields.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2 border-t border-tcreamDark pt-3">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">Custom fields</span>
      {fields.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={f.label}
            onChange={(e) => set(i, "label", e.target.value)}
            placeholder="Label (e.g. Phone 2)"
            className={inputCls + " w-2/5"}
          />
          <input
            value={f.value}
            onChange={(e) => set(i, "value", e.target.value)}
            placeholder="Value"
            className={inputCls + " flex-1"}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            title="Remove field"
            className="rounded-lg px-2.5 py-2 text-lg font-bold text-[#C0392B] hover:bg-red-50"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-lg border border-tnavy px-3 py-1.5 text-sm font-semibold text-tnavy hover:bg-tcream"
      >
        + Add field
      </button>
    </div>
  );
}

export default function SettingsTab({ settings, onSave, letterheads = [] }) {
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(false);

  const set = (group, key) => (v) => {
    setDraft((d) => ({ ...d, [group]: { ...d[group], [key]: v } }));
    setSaved(false);
  };
  const header = draft.header || { style: "drawn", letterheadId: null };
  const setHeader = (patch) => {
    setDraft((d) => ({ ...d, header: { ...d.header, ...patch } }));
    setSaved(false);
  };
  const theme = draft.theme || "classic";
  const setTheme = (t) => { setDraft((d) => ({ ...d, theme: t })); setSaved(false); };
  const layout = draft.layout || "standard";
  const setLayout = (l) => { setDraft((d) => ({ ...d, layout: l })); setSaved(false); };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---- seller / beneficiary roster (each seller keeps its OWN bank) ----
  const sellers = draft.sellers || [];
  const activeSeller = sellers.find((se) => se.id === draft.sellerId) || sellers[0] || { id: "default", bank: {} };
  const pickSeller = (id) => { setDraft((d) => ({ ...d, sellerId: id })); setSaved(false); };
  const setSellerField = (key) => (v) => {
    setDraft((d) => ({ ...d, sellers: d.sellers.map((se) => (se.id === d.sellerId ? { ...se, [key]: v } : se)) }));
    setSaved(false);
  };
  const setSellerExtra = (next) => {
    setDraft((d) => ({ ...d, sellers: d.sellers.map((se) => (se.id === d.sellerId ? { ...se, extra: next } : se)) }));
    setSaved(false);
  };
  const addSeller = () => {
    const id = uid();
    setDraft((d) => ({ ...d, sellers: [...d.sellers, { id, name: "New Company", nameAr: "", address: "", phone: "", email: "", trn: "", extra: [], bank: { bankName: "", accountName: "", accountNo: "", iban: "", swift: "" } }], sellerId: id }));
    setSaved(false);
  };
  const removeSeller = () => {
    setDraft((d) => {
      if (d.sellers.length <= 1) return d;
      const sellers = d.sellers.filter((se) => se.id !== d.sellerId);
      return { ...d, sellers, sellerId: sellers[0].id };
    });
    setSaved(false);
  };

  const setBuyerExtra = (next) => {
    setDraft((d) => ({ ...d, buyers: d.buyers.map((b) => (b.id === d.buyerId ? { ...b, extra: next } : b)) }));
    setSaved(false);
  };

  // active seller's beneficiary bank details
  const bank = activeSeller.bank || {};
  const setBank = (key) => (v) => {
    setDraft((d) => ({ ...d, sellers: d.sellers.map((se) => (se.id === d.sellerId ? { ...se, bank: { ...(se.bank || {}), [key]: v } } : se)) }));
    setSaved(false);
  };

  const items = draft.items || [];
  const setItem = (i, key, v) => {
    setDraft((d) => ({
      ...d,
      items: d.items.map((it, idx) => (idx === i ? { ...it, [key]: key === "unitPrice" ? Number(v) : v } : it)),
    }));
    setSaved(false);
  };
  const addItem = () => {
    setDraft((d) => ({ ...d, items: [...d.items, { description: "", unitPrice: 0 }] }));
    setSaved(false);
  };
  const removeItem = (i) => {
    setDraft((d) => ({ ...d, items: d.items.length > 1 ? d.items.filter((_, idx) => idx !== i) : d.items }));
    setSaved(false);
  };
  const setVat = (v) => {
    setDraft((d) => ({ ...d, vatRate: Number(v) }));
    setSaved(false);
  };

  // ---- buyer roster ----
  const buyers = draft.buyers || [];
  const activeBuyer = buyers.find((b) => b.id === draft.buyerId) || buyers[0] || { id: "default" };
  const pickBuyer = (id) => { setDraft((d) => ({ ...d, buyerId: id })); setSaved(false); };
  const setBuyerField = (key) => (v) => {
    setDraft((d) => ({
      ...d,
      buyers: d.buyers.map((b) => (b.id === d.buyerId ? { ...b, [key]: v } : b)),
    }));
    setSaved(false);
  };
  const addBuyer = () => {
    const id = uid();
    setDraft((d) => ({ ...d, buyers: [...d.buyers, { id, name: "New Company", address: "", phone: "", trn: "" }], buyerId: id }));
    setSaved(false);
  };
  const removeBuyer = () => {
    setDraft((d) => {
      if (d.buyers.length <= 1) return d;
      const buyers = d.buyers.filter((b) => b.id !== d.buyerId);
      return { ...d, buyers, buyerId: buyers[0].id };
    });
    setSaved(false);
  };

  function save() {
    // mirror the active seller + buyer into `seller`/`buyer` so the PDFs use them immediately
    const activeB = (draft.buyers || []).find((b) => b.id === draft.buyerId) || draft.buyer;
    const activeS = (draft.sellers || []).find((se) => se.id === draft.sellerId) || draft.seller;
    onSave({ ...draft, seller: { ...activeS }, buyer: { ...activeB } });
    setSaved(true);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Seller / Beneficiary">
          <div className="flex items-end gap-2">
            <label className="block flex-1">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">Company</span>
              <select
                value={draft.sellerId}
                onChange={(e) => pickSeller(e.target.value)}
                className="w-full rounded-lg border border-tcreamDark bg-white px-3 py-2 text-sm text-tnavy outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30"
              >
                {sellers.map((se) => (
                  <option key={se.id} value={se.id}>{se.name || "Unnamed company"}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={addSeller} title="Add a company"
              className="rounded-lg border border-tnavy px-3 py-2 text-sm font-semibold text-tnavy hover:bg-tcream">+ New</button>
            <button type="button" onClick={removeSeller} disabled={sellers.length <= 1} title="Remove this company"
              className="rounded-lg px-2.5 py-2 text-lg font-bold text-[#C0392B] disabled:opacity-30 hover:bg-red-50">×</button>
          </div>
          <Field label="Name" value={activeSeller.name || ""} onChange={setSellerField("name")} placeholder="Your company name" />
          <Field label="Name (Arabic)" value={activeSeller.nameAr || ""} onChange={setSellerField("nameAr")} placeholder="اسم شركتك (اختياري)" />
          <Field label="Address" value={activeSeller.address || ""} onChange={setSellerField("address")} placeholder="Street, area, city, country" />
          <Field label="Phone" value={activeSeller.phone || ""} onChange={setSellerField("phone")} placeholder="+971 5X XXX XXXX" />
          <Field label="Email" value={activeSeller.email || ""} onChange={setSellerField("email")} placeholder="you@company.com" />
          <Field label="TRN" value={activeSeller.trn || ""} onChange={setSellerField("trn")} placeholder="15-digit tax number" />
          <ExtraFields fields={activeSeller.extra || []} onChange={setSellerExtra} />
          <p className="text-[11px] text-slate">Each company keeps its own bank details below. Switching here changes which one prints.</p>
        </Card>
        <Card title="Buyer">
          <div className="flex items-end gap-2">
            <label className="block flex-1">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">Company</span>
              <select
                value={draft.buyerId}
                onChange={(e) => pickBuyer(e.target.value)}
                className="w-full rounded-lg border border-tcreamDark bg-white px-3 py-2 text-sm text-tnavy outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30"
              >
                {buyers.map((b) => (
                  <option key={b.id} value={b.id}>{b.name || "Unnamed company"}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={addBuyer} title="Add a company"
              className="rounded-lg border border-tnavy px-3 py-2 text-sm font-semibold text-tnavy hover:bg-tcream">+ New</button>
            <button type="button" onClick={removeBuyer} disabled={buyers.length <= 1} title="Remove this company"
              className="rounded-lg px-2.5 py-2 text-lg font-bold text-[#C0392B] disabled:opacity-30 hover:bg-red-50">×</button>
          </div>
          <Field label="Name" value={activeBuyer.name || ""} onChange={setBuyerField("name")} placeholder="Customer company name" />
          <Field label="Registered address (tax notice)" value={activeBuyer.address || ""} onChange={setBuyerField("address")} multiline placeholder="Registered billing address" />
          <Field label="Phone" value={activeBuyer.phone || ""} onChange={setBuyerField("phone")} placeholder="+971 5X XXX XXXX" />
          <Field label="TRN" value={activeBuyer.trn || ""} onChange={setBuyerField("trn")} placeholder="15-digit tax number" />
          <ExtraFields fields={activeBuyer.extra || []} onChange={setBuyerExtra} />
          <p className="text-[11px] text-slate">The selected company is used on all invoices &amp; the weekly statement.</p>
        </Card>
      </div>

      <Card title={`Beneficiary bank details — ${activeSeller.name || "seller"}`}>
        <p className="text-[11px] text-slate">
          Bank details for the seller company selected above. Printed on its invoices &amp; statement so the buyer can pay. Leave all blank to hide the block.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bank name" value={bank.bankName || ""} onChange={setBank("bankName")} />
          <Field label="Account name" value={bank.accountName || ""} onChange={setBank("accountName")} />
          <Field label="Account number" value={bank.accountNo || ""} onChange={setBank("accountNo")} />
          <Field label="IBAN" value={bank.iban || ""} onChange={setBank("iban")} />
          <Field label="SWIFT / BIC" value={bank.swift || ""} onChange={setBank("swift")} />
        </div>
      </Card>

      <Card title="Items & VAT">
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">{i === 0 ? "Item" : `Item ${i + 1}`}</span>
                <input
                  value={it.description}
                  onChange={(e) => setItem(i, "description", e.target.value)}
                  placeholder="e.g. Mutton Biryani (Parcel)"
                  className="w-full rounded-lg border border-tcreamDark bg-white px-3 py-2 text-sm outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30"
                />
              </div>
              <div className="w-28">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">Price (AED)</span>
                <input
                  type="number"
                  value={it.unitPrice}
                  onChange={(e) => setItem(i, "unitPrice", e.target.value)}
                  className="w-full rounded-lg border border-tcreamDark bg-white px-3 py-2 text-sm outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30"
                />
              </div>
              <button
                type="button"
                onClick={() => removeItem(i)}
                disabled={items.length <= 1}
                title="Remove item"
                className="mb-0.5 rounded-lg px-2.5 py-2 text-lg font-bold text-[#C0392B] disabled:opacity-30 hover:bg-red-50"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <button
            type="button"
            onClick={addItem}
            className="rounded-lg border border-tnavy px-3 py-1.5 text-sm font-semibold text-tnavy hover:bg-tcream"
          >
            + Add item
          </button>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">VAT rate (%)</span>
            <input
              type="number"
              value={draft.vatRate}
              onChange={(e) => setVat(e.target.value)}
              className="w-28 rounded-lg border border-tcreamDark bg-white px-3 py-2 text-sm outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30"
            />
          </label>
        </div>
      </Card>

      <Card title="Layout">
        <style>{`@keyframes tmplPop{0%{transform:scale(0) rotate(-30deg);opacity:0}70%{transform:scale(1.25) rotate(0)}100%{transform:scale(1);opacity:1}}`}</style>
        <p className="text-[11px] text-slate">Where each block sits on the page. Changes structure — pair with any colour below.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LAYOUTS.map((l) => {
            const active = layout === l.key;
            return (
              <button
                key={l.key}
                type="button"
                onClick={() => setLayout(l.key)}
                title={l.name}
                className={
                  "group relative overflow-hidden rounded-xl border p-2.5 text-left transition-all duration-300 ease-out " +
                  (active
                    ? "scale-[1.03] border-tgold bg-tcream shadow-md ring-2 ring-tgold/40"
                    : "border-tcreamDark hover:-translate-y-0.5 hover:border-tgold/60 hover:shadow-sm")
                }
              >
                <div className="mb-2 rounded-md bg-white p-1.5 ring-1 ring-black/5">
                  <LayoutThumb kind={l.key} />
                </div>
                <span className="block text-sm font-bold text-tnavy">{l.name}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-slate">{l.desc}</span>
                {active && (
                  <span
                    className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-tgold text-[11px] font-bold text-white shadow"
                    style={{ animation: "tmplPop .28s ease-out" }}
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-slate">Sidebar prints on the built-in header; on a letterhead it falls back to Standard.</p>
      </Card>

      <Card title="Colour">
        <style>{`@keyframes tmplPop{0%{transform:scale(0) rotate(-30deg);opacity:0}70%{transform:scale(1.25) rotate(0)}100%{transform:scale(1);opacity:1}}`}</style>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TRACKER_TEMPLATES.map((t) => {
            const active = theme === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTheme(t.key)}
                title={t.name}
                className={
                  "group relative overflow-hidden rounded-xl border p-2.5 text-left transition-all duration-300 ease-out " +
                  (active
                    ? "scale-[1.03] border-tgold bg-tcream shadow-md ring-2 ring-tgold/40"
                    : "border-tcreamDark hover:-translate-y-0.5 hover:border-tgold/60 hover:shadow-sm")
                }
              >
                {/* colour swatch preview */}
                <div className="mb-2 flex h-9 overflow-hidden rounded-md ring-1 ring-black/5">
                  <span className="flex-1 transition-transform duration-500 group-hover:scale-110" style={{ background: t.swatch[0] }} />
                  <span className="w-1/3 transition-transform duration-500 group-hover:scale-110" style={{ background: t.swatch[1] }} />
                </div>
                <span className="block text-sm font-bold text-tnavy">{t.name}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-slate">{t.desc}</span>
                {active && (
                  <span
                    className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-tgold text-[11px] font-bold text-white shadow"
                    style={{ animation: "tmplPop .28s ease-out" }}
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate">Applies to the daily tax invoice, the weekly statement, and the SoA bundle PDFs.</p>
      </Card>

      <Card title="Invoice header">
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setHeader({ style: "drawn" })}
            className={
              "rounded-lg border p-3 text-left text-sm transition " +
              (header.style === "drawn" ? "border-tgold bg-tcream ring-2 ring-tgold/30" : "border-tcreamDark hover:border-tgold/50")
            }
          >
            <span className="block font-semibold text-tnavy">Drawn header</span>
            <span className="text-xs text-slate">Built-in navy/gold header &amp; footer.</span>
          </button>
          <button
            type="button"
            onClick={() => setHeader({ style: "letterhead" })}
            className={
              "rounded-lg border p-3 text-left text-sm transition " +
              (header.style === "letterhead" ? "border-tgold bg-tcream ring-2 ring-tgold/30" : "border-tcreamDark hover:border-tgold/50")
            }
          >
            <span className="block font-semibold text-tnavy">Use my letterhead</span>
            <span className="text-xs text-slate">Print invoices on a saved letterhead image.</span>
          </button>
        </div>

        {header.style === "letterhead" && (
          <div className="mt-3">
            {letterheads.length === 0 ? (
              <p className="text-xs text-slate">
                No saved letterheads yet. Upload one in the main <span className="font-semibold text-tnavy">Studio</span> (Letterhead panel) and it will appear here.
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {letterheads.map((l) => {
                  const active = l.id === header.letterheadId;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setHeader({ letterheadId: l.id })}
                      title={l.name}
                      className={
                        "w-24 overflow-hidden rounded-lg border bg-white transition " +
                        (active ? "border-tgold ring-2 ring-tgold/40" : "border-tcreamDark hover:border-tgold/60")
                      }
                    >
                      <img src={l.dataUrl} alt={l.name} className="block h-28 w-full object-cover object-top" />
                      <span className="block truncate px-1.5 py-1 text-[10px] text-slate">{l.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          className="rounded-lg bg-tnavy px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-tnavy/90"
        >
          Save settings
        </button>
        {saved && <span className="text-sm font-semibold text-green-700">Saved ✓</span>}
      </div>
    </div>
  );
}
