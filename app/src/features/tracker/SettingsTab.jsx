// SettingsTab — editable seller / buyer / item defaults, persisted to IndexedDB.
import { useState } from "react";

function Field({ label, value, onChange, type = "text", multiline = false }) {
  const cls =
    "w-full rounded-lg border border-tcreamDark bg-white px-3 py-2 text-sm outline-none focus:border-tgold focus:ring-2 focus:ring-tgold/30";
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tnavy/70">{label}</span>
      {multiline ? (
        <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} className={cls + " resize-none"} />
      ) : (
        <input
          type={type}
          value={value}
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

export default function SettingsTab({ settings, onSave }) {
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(false);

  const set = (group, key) => (v) => {
    setDraft((d) => ({ ...d, [group]: { ...d[group], [key]: v } }));
    setSaved(false);
  };

  function save() {
    onSave(draft);
    setSaved(true);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Seller">
          <Field label="Name" value={draft.seller.name} onChange={set("seller", "name")} />
          <Field label="Name (Arabic)" value={draft.seller.nameAr} onChange={set("seller", "nameAr")} />
          <Field label="Address" value={draft.seller.address} onChange={set("seller", "address")} />
          <Field label="Phone" value={draft.seller.phone} onChange={set("seller", "phone")} />
          <Field label="Email" value={draft.seller.email} onChange={set("seller", "email")} />
          <Field label="TRN" value={draft.seller.trn} onChange={set("seller", "trn")} />
        </Card>
        <Card title="Buyer">
          <Field label="Name" value={draft.buyer.name} onChange={set("buyer", "name")} />
          <Field label="Registered address (tax notice)" value={draft.buyer.address} onChange={set("buyer", "address")} multiline />
          <Field label="Phone" value={draft.buyer.phone} onChange={set("buyer", "phone")} />
          <Field label="TRN" value={draft.buyer.trn} onChange={set("buyer", "trn")} />
        </Card>
      </div>

      <Card title="Item & VAT">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Description" value={draft.item.description} onChange={set("item", "description")} />
          <Field label="Unit price (AED)" type="number" value={draft.item.unitPrice} onChange={set("item", "unitPrice")} />
          <Field label="VAT rate (%)" type="number" value={draft.item.vatRate} onChange={set("item", "vatRate")} />
        </div>
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
