// VendorsPage — Vendor Statements & bidirectional netting. Self-contained tool
// beside the letterhead studio (separate `mode`). One signed ledger per vendor
// per month: AR lines (our vehicles they used) net against AP lines (camps /
// yacht / cruise we bought). NET auto-computes; Download renders a Statement of
// Account on the chosen letterhead. Cloud-synced across devices when signed in.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadVendors, saveVendors, loadRates, saveRates,
  loadLedger, saveLedger, isCloudActive, subscribeVendors,
} from "./vendorStorage.js";
import { computeNet, AR, AP, KIND, r2 } from "./netting.js";
import { downloadVendorStatement } from "./vendorPdf.js";
import { listLetterheads } from "../../lib/storage.js";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const thisPeriod = () => new Date().toISOString().slice(0, 7); // YYYY-MM
const monthLabel = (p) => { const [y, m] = String(p).split("-").map(Number); return m ? `${MONTHS[m - 1]} ${y}` : p; };
const prevPeriod = (p) => { const [y, m] = String(p).split("-").map(Number); return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7); };
const num = (v) => (Number(v) || 0);

const AP_KINDS = [
  { v: KIND.PURCHASE, t: "Purchase (we bought)" },
  { v: KIND.YACHT, t: "Yacht" },
  { v: KIND.CRUISE, t: "Cruise seats" },
  { v: KIND.CAMP, t: "Safari camp" },
  { v: KIND.REFUND, t: "Refund (enter as negative)" },
  { v: KIND.ADJUSTMENT, t: "Adjustment (± )" },
];

export default function VendorsPage({ onExit, storeKey }) {
  const [vendors, setVendors] = useState([]);
  const [rates, setRates] = useState({});
  const [vendorId, setVendorId] = useState(null);
  const [period, setPeriod] = useState(thisPeriod());
  const [ledger, setLedger] = useState({ openingBalance: 0, lines: [] });
  const [letterheads, setLetterheads] = useState([]);
  const [letterheadId, setLetterheadId] = useState(null);
  const [currency, setCurrency] = useState("AED");
  const [loaded, setLoaded] = useState(false);
  const cloud = isCloudActive();
  const writing = useRef(false);

  const vendor = useMemo(() => vendors.find((v) => v.id === vendorId) || null, [vendors, vendorId]);
  const rateCard = useMemo(() => rates[vendorId] || [], [rates, vendorId]);
  const letterhead = useMemo(() => letterheads.find((l) => l.id === letterheadId) || null, [letterheads, letterheadId]);
  const summary = useMemo(() => computeNet(ledger.lines, { openingBalance: ledger.openingBalance, currency }), [ledger, currency]);

  // ---- initial load --------------------------------------------------------
  const loadAll = useCallback(async () => {
    const [vs, rs] = await Promise.all([loadVendors(), loadRates()]);
    setVendors(vs);
    setRates(rs);
    setVendorId((cur) => cur || vs[0]?.id || null);
    setLoaded(true);
  }, []);
  useEffect(() => { setLoaded(false); loadAll(); }, [storeKey, loadAll]);

  useEffect(() => {
    listLetterheads().then((l) => { setLetterheads(l); setLetterheadId((c) => c || l[0]?.id || null); }).catch(() => setLetterheads([]));
  }, [storeKey]);

  // load the ledger whenever vendor or month changes. A brand-new empty month
  // auto-carries the previous month's closing balance forward as its opening.
  useEffect(() => {
    if (!vendorId) { setLedger({ openingBalance: 0, lines: [] }); return; }
    let alive = true;
    (async () => {
      const l = await loadLedger(vendorId, period);
      if (!alive) return;
      if (l.lines.length === 0 && !l.openingBalance) {
        const pl = await loadLedger(vendorId, prevPeriod(period));
        const carried = computeNet(pl.lines, { openingBalance: pl.openingBalance }).net;
        if (alive && carried) {
          const nl = { ...l, openingBalance: carried };
          writing.current = true;
          setLedger(nl);
          saveLedger(vendorId, period, nl);
          setTimeout(() => { writing.current = false; }, 1200);
          return;
        }
      }
      setLedger(l);
    })();
    return () => { alive = false; };
  }, [vendorId, period, storeKey]);

  // realtime: refresh on changes from another device
  useEffect(() => {
    if (!cloud) return;
    const unsub = subscribeVendors(() => {
      if (writing.current) return;
      loadVendors().then(setVendors).catch(() => {});
      loadRates().then(setRates).catch(() => {});
      if (vendorId) loadLedger(vendorId, period).then(setLedger).catch(() => {});
    });
    return unsub;
  }, [cloud, vendorId, period]);

  const guard = (fn) => { writing.current = true; try { return fn(); } finally { setTimeout(() => { writing.current = false; }, 1200); } };

  // ---- vendor + rate mutations ---------------------------------------------
  function addVendor(name) {
    const n = name.trim();
    if (!n) return;
    const v = { id: uid(), name: n, currency };
    const next = [...vendors, v];
    guard(() => { setVendors(next); saveVendors(next); });
    setVendorId(v.id);
  }
  function removeVendor(id) {
    if (!window.confirm("Remove this vendor? Its saved months stay in the cloud but disappear from the list.")) return;
    const next = vendors.filter((v) => v.id !== id);
    guard(() => { setVendors(next); saveVendors(next); });
    if (vendorId === id) setVendorId(next[0]?.id || null);
  }
  function commitRates(nextCardForVendor) {
    const next = { ...rates, [vendorId]: nextCardForVendor };
    guard(() => { setRates(next); saveRates(next); });
  }
  const addRate = () => commitRates([...rateCard, { id: uid(), label: "New vehicle type", rate: 0 }]);
  const updateRate = (id, patch) => commitRates(rateCard.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const removeRate = (id) => commitRates(rateCard.filter((t) => t.id !== id));

  // ---- ledger mutations ----------------------------------------------------
  function commitLedger(next) { guard(() => { setLedger(next); if (vendorId) saveLedger(vendorId, period, next); }); }
  function addLine(line) { commitLedger({ ...ledger, lines: [...ledger.lines, { id: uid(), ...line }] }); }
  function removeLine(id) { commitLedger({ ...ledger, lines: ledger.lines.filter((l) => l.id !== id) }); }
  function setOpening(v) { commitLedger({ ...ledger, openingBalance: r2(v) }); }
  async function carryForward() {
    if (!vendorId) return;
    const pl = await loadLedger(vendorId, prevPeriod(period));
    setOpening(computeNet(pl.lines, { openingBalance: pl.openingBalance }).net);
  }

  if (!loaded) return <div className="grid h-screen place-items-center bg-[#f3f1ec] text-slate">Loading vendors…</div>;

  return (
    <div className="flex h-screen flex-col bg-[#f3f1ec] text-tnavy">
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-tcreamDark bg-white px-4">
        <div className="flex items-center gap-3">
          <button onClick={onExit} className="rounded-full bg-tcream px-3 py-1.5 text-sm font-semibold text-tnavy ring-1 ring-tcreamDark hover:bg-tcreamDark/40">← Studio</button>
          <div className="leading-none">
            <h1 className="text-[15px] font-extrabold tracking-tight text-tnavy">Vendor Statements</h1>
            <p className="mt-1 text-[11px] text-slate">two-way netting · one statement per vendor per month</p>
          </div>
        </div>
        <span className={"text-[11px] font-semibold " + (cloud ? "text-green-700" : "text-slate")}>
          {cloud ? "☁ Synced to your account" : "● On this device — sign in to sync"}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 space-y-5">
          {/* toolbar */}
          <div className="grid gap-3 rounded-xl border border-tcreamDark bg-white p-4 sm:grid-cols-4">
            <Field label="Vendor">
              <div className="flex gap-1">
                <select value={vendorId || ""} onChange={(e) => setVendorId(e.target.value)} className="w-full rounded-lg border border-tcreamDark bg-white px-2 py-2 text-sm">
                  {vendors.length === 0 && <option value="">— none —</option>}
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                {vendor && <button onClick={() => removeVendor(vendor.id)} title="Remove vendor" className="rounded-lg px-2 text-red-600 ring-1 ring-red-200 hover:bg-red-50">✕</button>}
              </div>
              <AddVendor onAdd={addVendor} />
            </Field>
            <Field label="Month"><input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-full rounded-lg border border-tcreamDark bg-white px-2 py-2 text-sm" /></Field>
            <Field label="Letterhead">
              <select value={letterheadId || ""} onChange={(e) => setLetterheadId(e.target.value)} className="w-full rounded-lg border border-tcreamDark bg-white px-2 py-2 text-sm">
                {letterheads.length === 0 && <option value="">— none (blank page) —</option>}
                {letterheads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="Currency"><input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="w-full rounded-lg border border-tcreamDark bg-white px-2 py-2 text-sm" /></Field>
          </div>

          {!vendor ? (
            <div className="rounded-xl border border-dashed border-tcreamDark bg-white p-8 text-center text-slate">
              Add your first vendor above (e.g. <b>Ocean Express</b>, <b>Sea Launch</b>, <b>Haseeb</b>) to start a statement.
            </div>
          ) : (
            <>
              {/* rate card */}
              <Card title="Rate card — our vehicle types (set once)" hint="Used by the quick-add below so amount = qty × rate.">
                <div className="space-y-2">
                  {rateCard.map((t) => (
                    <div key={t.id} className="flex items-center gap-2">
                      <input value={t.label} onChange={(e) => updateRate(t.id, { label: e.target.value })} className="flex-1 rounded-lg border border-tcreamDark px-2 py-1.5 text-sm" />
                      <input type="number" value={t.rate} onChange={(e) => updateRate(t.id, { rate: num(e.target.value) })} className="w-28 rounded-lg border border-tcreamDark px-2 py-1.5 text-right text-sm tabular-nums" />
                      <button onClick={() => removeRate(t.id)} className="rounded-lg px-2 py-1 text-red-600 ring-1 ring-red-200 hover:bg-red-50">✕</button>
                    </div>
                  ))}
                  <button onClick={addRate} className="rounded-lg bg-tcream px-3 py-1.5 text-sm font-semibold text-tnavy ring-1 ring-tcreamDark hover:bg-tcreamDark/40">+ Add vehicle type</button>
                </div>
              </Card>

              {/* entry: they owe us */}
              <Card title="They used our vehicles / services (they owe us — AR)">
                <ArAdd rateCard={rateCard} onAdd={addLine} />
              </Card>

              {/* entry: we bought */}
              <Card title="We bought from them / adjustments (we owe them — AP)" hint="Refunds & credits: enter a negative amount.">
                <ApAdd onAdd={addLine} />
              </Card>

              {/* lines */}
              <Card title={`Ledger — ${monthLabel(period)}`}>
                <LinesTable lines={ledger.lines} currency={currency} onRemove={removeLine} />
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-slate">Opening balance</span>
                  <input type="number" value={ledger.openingBalance} onChange={(e) => setOpening(num(e.target.value))} className="w-32 rounded-lg border border-tcreamDark px-2 py-1.5 text-right text-sm tabular-nums" />
                  <button onClick={carryForward} title="Pull last month's closing balance" className="rounded-lg bg-tcream px-2.5 py-1.5 text-xs font-semibold text-tnavy ring-1 ring-tcreamDark hover:bg-tcreamDark/40">↻ Carry from {monthLabel(prevPeriod(period))}</button>
                  <span className="text-xs text-slate">(+ they owed us, − we owed them, carried in)</span>
                </div>
              </Card>

              {/* summary + download */}
              <SummaryBar summary={summary} currency={currency} onDownload={() => downloadVendorStatement({
                vendor, periodLabel: monthLabel(period), openingBalance: ledger.openingBalance,
                lines: ledger.lines, summary, letterhead, currency,
              })} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block text-xs"><span className="mb-1 block font-semibold uppercase tracking-wide text-slate">{label}</span>{children}</label>;
}
function Card({ title, hint, children }) {
  return (
    <section className="rounded-xl border border-tcreamDark bg-white p-4">
      <h2 className="mb-1 text-sm font-bold text-tnavy">{title}</h2>
      {hint && <p className="mb-3 text-xs text-slate">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}

function AddVendor({ onAdd }) {
  const [name, setName] = useState("");
  return (
    <div className="mt-1 flex gap-1">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add vendor…" className="w-full rounded-lg border border-tcreamDark px-2 py-1.5 text-sm"
        onKeyDown={(e) => { if (e.key === "Enter") { onAdd(name); setName(""); } }} />
      <button onClick={() => { onAdd(name); setName(""); }} className="rounded-lg bg-tnavy px-2.5 py-1.5 text-sm font-semibold text-white">+</button>
    </div>
  );
}

function ArAdd({ rateCard, onAdd }) {
  const [date, setDate] = useState("");
  const [typeId, setTypeId] = useState(rateCard[0]?.id || "");
  const [qty, setQty] = useState(1);
  useEffect(() => { if (!rateCard.some((t) => t.id === typeId)) setTypeId(rateCard[0]?.id || ""); }, [rateCard, typeId]);
  function submit() {
    const t = rateCard.find((x) => x.id === typeId);
    if (!t) { alert("Add a vehicle type in the rate card first."); return; }
    const q = num(qty);
    if (!q) return;
    onAdd({ date, side: AR, kind: KIND.VEHICLE, label: t.label, qty: q, rate: num(t.rate), amount: r2(q * num(t.rate)) });
    setQty(1);
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <MiniField label="Date"><input value={date} onChange={(e) => setDate(e.target.value)} placeholder="6 Sep" className="w-24 rounded-lg border border-tcreamDark px-2 py-1.5 text-sm" /></MiniField>
      <MiniField label="Vehicle type">
        <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className="rounded-lg border border-tcreamDark px-2 py-1.5 text-sm">
          {rateCard.length === 0 && <option value="">— add a type above —</option>}
          {rateCard.map((t) => <option key={t.id} value={t.id}>{t.label} ({t.rate})</option>)}
        </select>
      </MiniField>
      <MiniField label="Qty"><input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="w-16 rounded-lg border border-tcreamDark px-2 py-1.5 text-right text-sm tabular-nums" /></MiniField>
      <button onClick={submit} className="rounded-lg bg-tnavy px-3 py-1.5 text-sm font-semibold text-white">Add</button>
    </div>
  );
}

function ApAdd({ onAdd }) {
  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState(KIND.PURCHASE);
  const [amount, setAmount] = useState("");
  function submit() {
    const a = num(amount);
    if (!a) return;
    onAdd({ date, side: AP, kind, label: label || AP_KINDS.find((k) => k.v === kind)?.t || "Purchase", amount: r2(a) });
    setLabel(""); setAmount("");
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <MiniField label="Date"><input value={date} onChange={(e) => setDate(e.target.value)} placeholder="15 Sep" className="w-24 rounded-lg border border-tcreamDark px-2 py-1.5 text-sm" /></MiniField>
      <MiniField label="Description"><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Yacht 3hr" className="w-40 rounded-lg border border-tcreamDark px-2 py-1.5 text-sm" /></MiniField>
      <MiniField label="Kind">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border border-tcreamDark px-2 py-1.5 text-sm">
          {AP_KINDS.map((k) => <option key={k.v} value={k.v}>{k.t}</option>)}
        </select>
      </MiniField>
      <MiniField label="Amount"><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28 rounded-lg border border-tcreamDark px-2 py-1.5 text-right text-sm tabular-nums" /></MiniField>
      <button onClick={submit} className="rounded-lg bg-tnavy px-3 py-1.5 text-sm font-semibold text-white">Add</button>
    </div>
  );
}

function MiniField({ label, children }) {
  return <label className="block text-[11px]"><span className="mb-0.5 block font-semibold uppercase tracking-wide text-slate">{label}</span>{children}</label>;
}

function LinesTable({ lines, currency, onRemove }) {
  if (!lines.length) return <p className="text-sm text-slate">No lines yet. Add above.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-tcreamDark text-left text-xs uppercase text-slate">
          <th className="py-1.5">Date</th><th>Description</th><th className="text-center">Dir</th><th className="text-right">Amount</th><th></th>
        </tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-tcream">
              <td className="py-1.5">{l.date || "—"}</td>
              <td>{l.label}</td>
              <td className="text-center">
                <span className={"rounded px-1.5 py-0.5 text-[10px] font-bold " + (l.side === AR ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")}>
                  {l.side === AR ? "they owe" : "we owe"}
                </span>
              </td>
              <td className="text-right tabular-nums">{currency} {money(l.amount)}</td>
              <td className="text-right"><button onClick={() => onRemove(l.id)} className="text-red-600 hover:underline">✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryBar({ summary, currency, onDownload }) {
  const payable = summary.direction === "payable";
  const settled = summary.direction === "settled";
  return (
    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-tcreamDark bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <Stat label="They owe us" value={`${currency} ${money(summary.theyOweUs)}`} />
        <Stat label="We owe them" value={`${currency} ${money(summary.weOweThem)}`} />
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate">Net {settled ? "" : payable ? "— we pay" : "— they pay"}</div>
          <div className={"text-xl font-extrabold tabular-nums " + (settled ? "text-slate" : payable ? "text-red-600" : "text-green-700")}>
            {currency} {money(summary.absNet)}
          </div>
        </div>
      </div>
      <button onClick={onDownload} className="rounded-full bg-tnavy px-5 py-2.5 text-sm font-bold text-white hover:bg-tnavy/90">⬇ Download Statement PDF</button>
    </div>
  );
}
function Stat({ label, value }) {
  return <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate">{label}</div><div className="font-bold tabular-nums text-tnavy">{value}</div></div>;
}

function money(n) { return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
