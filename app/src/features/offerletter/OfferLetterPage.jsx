// OfferLetterPage.jsx — guided, step-by-step EMPLOYMENT OFFER LETTER generator.
// Fills a fixed, deterministic template (offerPdf.js) that ALWAYS auto-fits to a
// single A4 page. Flow: 1) letterhead (auto-fetches its colours) → 2) candidate
// (scan passport or type) → 3) role & terms → 4) extras & download.
// Draft is persisted device-locally via idb-keyval (passport data never cloud).
import { useEffect, useMemo, useRef, useState } from "react";
import { get, set } from "idb-keyval";
import { buildOffer } from "./offerPdf.js";
import { DEFAULT_OFFER, normalizeOffer, salaryTotal, money } from "./offerModel.js";
import { listLetterheads, listSignatures } from "../../lib/storage.js";
import { scanPassport, aiConfigured } from "../../lib/aiClient.js";
import SignaturePlacer from "./SignaturePlacer.jsx";
import { offerToElements } from "./offerToElements.js";

const DRAFT_KEY = "offer-letter:draft";
const STEPS = ["Letterhead", "Candidate", "Role & terms", "Finish"];

// ---- tiny form primitives -------------------------------------------------
function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate/70">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10.5px] leading-snug text-slate/60">{hint}</span>}
    </label>
  );
}
const inputCls =
  "w-full rounded-xl bg-[#f6f7f9] px-3 py-2.5 text-sm text-navy outline-none ring-1 ring-black/[0.05] transition focus:bg-white focus:ring-2 focus:ring-brass/50";

function Text({ value, onChange, placeholder, ...r }) {
  return <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} {...r} />;
}
function Area({ value, onChange, placeholder, rows = 3 }) {
  return <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className={inputCls + " resize-y leading-relaxed"} />;
}
function Card({ title, hint, children }) {
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-black/[0.06]">
      {title && <h3 className="mb-1 text-[13px] font-extrabold text-navy">{title}</h3>}
      {hint && <p className="mb-3 text-[11px] leading-snug text-slate/60">{hint}</p>}
      <div className={"space-y-3" + (title && !hint ? " mt-3" : "")}>{children}</div>
    </section>
  );
}

export default function OfferLetterPage({ onExit, storeKey, onOpenInEditor }) {
  const [o, setO] = useState(DEFAULT_OFFER);
  const [letterheads, setLetterheads] = useState([]);
  const [signatures, setSignatures] = useState([]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [placerOpen, setPlacerOpen] = useState(false);
  const debounce = useRef(null);

  const set1 = (patch) => setO((p) => ({ ...p, ...patch }));

  useEffect(() => {
    let live = true;
    (async () => {
      const draft = await get(DRAFT_KEY).catch(() => null);
      if (live && draft) setO(normalizeOffer(draft));
      setLoaded(true);
    })();
    listLetterheads().then((l) => live && setLetterheads(l || [])).catch(() => {});
    listSignatures().then((s) => live && setSignatures(s || [])).catch(() => {});
    return () => { live = false; };
  }, [storeKey]);

  const letterhead = useMemo(
    () => letterheads.find((l) => l.id === o.letterheadId) || null,
    [letterheads, o.letterheadId]
  );
  const ctx = useMemo(() => ({
    letterhead,
    signature: signatures.find((s) => s.id === o.signatureId) || null,
    stamp: signatures.find((s) => s.id === o.stampId) || null,
  }), [letterhead, signatures, o.signatureId, o.stampId]);

  // auto-fetch the letterhead's brand colour
  useEffect(() => {
    if (o.useLetterhead && o.useLetterheadColors && letterhead?.accent && letterhead.accent !== o.accent) {
      set1({ accent: letterhead.accent });
    }
  }, [o.useLetterhead, o.useLetterheadColors, letterhead]);

  // persist + regenerate the live (always one-page) preview, debounced
  useEffect(() => {
    if (!loaded) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      set(DRAFT_KEY, o).catch(() => {});
      try { setPreviewUrl(String(buildOffer(o, ctx).output("bloburl"))); }
      catch (e) { /* keep last good preview */ }
    }, 300);
    return () => clearTimeout(debounce.current);
  }, [o, ctx, loaded]);

  function download() {
    const nm = `Offer_Letter_${(o.candidateName || "Candidate").replace(/\s+/g, "_")}.pdf`;
    buildOffer(o, ctx).save(nm);
  }

  const setSalary = (i, patch) => setO((p) => ({ ...p, salary: p.salary.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const addSalary = () => setO((p) => ({ ...p, salary: [...p.salary, { label: "Allowance", amount: 0 }] }));
  const rmSalary = (i) => setO((p) => ({ ...p, salary: p.salary.filter((_, j) => j !== i) }));

  const setLeave = (i, patch) => setO((p) => ({ ...p, leave: p.leave.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const addLeave = () => setO((p) => ({ ...p, leave: [...p.leave, { item: "Maternity Leave", detail: "As per Federal Decree-Law No. 33 of 2021" }] }));
  const rmLeave = (i) => setO((p) => ({ ...p, leave: p.leave.filter((_, j) => j !== i) }));

  const setClause = (i, patch) => setO((p) => ({ ...p, customSections: p.customSections.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const addClause = () => setO((p) => ({ ...p, customSections: [...(p.customSections || []), { title: "", body: "" }] }));
  const rmClause = (i) => setO((p) => ({ ...p, customSections: p.customSections.filter((_, j) => j !== i) }));

  async function pickLogo(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => set1({ logoDataUrl: String(r.result) });
    r.readAsDataURL(f);
  }

  async function onScanPassport(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setScanning(true); setScanMsg("");
    try {
      const p = await scanPassport(f);
      const patch = {};
      if (p.salutation) patch.salutation = p.salutation;
      if (p.candidateName) patch.candidateName = p.candidateName;
      if (p.nationality) patch.nationality = p.nationality;
      if (p.passportNo) patch.passportNo = p.passportNo;
      set1(patch);
      const got = ["candidateName", "nationality", "passportNo"].filter((k) => patch[k]).length;
      setScanMsg(got ? `Filled ${got} field${got === 1 ? "" : "s"} from the passport — please double-check.` : "Couldn’t read the fields clearly. Try a sharper, flat photo.");
    } catch (err) {
      setScanMsg(err.message || "Passport scan failed.");
    } finally {
      setScanning(false);
    }
  }

  // open the drag/resize placer, seeding a sensible default spot if unplaced
  function openPlacer() {
    const patch = {};
    if (ctx.signature && !o.sigPlace) patch.sigPlace = { x: 0.20, y: 0.80, w: 0.20 };
    if (ctx.stamp && !o.stampPlace) patch.stampPlace = { x: 0.21, y: 0.865, w: 0.12 };
    if (Object.keys(patch).length) set1(patch);
    setPlacerOpen(true);
  }

  // "explode" the letter into free, fully-editable canvas blocks and hand them
  // to the studio editor (drag / resize / delete / edit everything, Canva-style).
  function editFreely() {
    if (!onOpenInEditor) return;
    if (!confirm("Open the letter in the free canvas editor?\n\nEvery block becomes draggable, resizable and deletable — but the automatic one-page fit no longer applies (you arrange it yourself). Your form here stays saved.")) return;
    onOpenInEditor(offerToElements(o, ctx));
  }

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="flex h-screen flex-col bg-[#e9ebef] text-navy">
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-black/[0.06] bg-white/90 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <button onClick={onExit} className="rounded-full bg-[#f6f7f9] px-3 py-1.5 text-sm font-semibold text-navy ring-1 ring-black/[0.05] transition hover:bg-[#eef0f3]">← Home</button>
          <div className="leading-none">
            <h1 className="font-display text-[15px] font-extrabold tracking-tightest text-navy">Employment Offer Letter</h1>
            <p className="mt-1 text-[11px] text-slate/80">Guided · always fits on one page</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={editFreely} title="Open in the free drag-and-drop editor"
            className="hidden items-center gap-1.5 rounded-full bg-[#f6f7f9] px-3 py-2 text-sm font-semibold text-navy ring-1 ring-black/[0.05] transition hover:bg-[#eef0f3] sm:flex">
            ✥ Edit freely
          </button>
          <button onClick={download} className="btn-primary px-4 py-2.5">Download</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* ---- guided form ---- */}
        <aside className="flex max-h-[62vh] w-full shrink-0 flex-col border-b border-black/[0.06] bg-[#eef0f3] md:max-h-none md:w-[440px] md:border-b-0 md:border-r">
          {/* step chips */}
          <div className="flex items-center gap-1.5 border-b border-black/[0.05] bg-white/60 px-4 py-3">
            {STEPS.map((label, i) => (
              <button key={label} onClick={() => setStep(i)}
                className={"flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition " +
                  (i === step ? "bg-magenta text-white" : i < step ? "bg-magenta/10 text-magenta" : "bg-[#f0f1f4] text-slate/70 hover:bg-[#e6e8ec]")}>
                <span className={"grid h-4 w-4 place-items-center rounded-full text-[9px] " + (i === step ? "bg-white/25" : "bg-black/5")}>{i + 1}</span>
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
            {/* ---------- STEP 1 · LETTERHEAD ---------- */}
            {step === 0 && (
              <>
                <Card title="Start with your letterhead" hint="Pick a saved letterhead — its brand colour is fetched automatically. Or use a plain drawn header.">
                  <div className="rounded-xl bg-[#f6f7f9] p-3 ring-1 ring-black/[0.05]">
                    <label className="flex items-center gap-2 text-sm font-semibold text-navy">
                      <input type="checkbox" checked={o.useLetterhead} onChange={(e) => set1({ useLetterhead: e.target.checked })} className="accent-magenta" />
                      Print on my letterhead image
                    </label>
                    {o.useLetterhead && (
                      <select value={o.letterheadId} onChange={(e) => set1({ letterheadId: e.target.value })} className={inputCls + " mt-2"}>
                        <option value="">— pick a saved letterhead —</option>
                        {letterheads.map((l) => <option key={l.id} value={l.id}>{l.name || "Letterhead"}</option>)}
                      </select>
                    )}
                    {o.useLetterhead && !letterheads.length && (
                      <p className="mt-2 text-[10.5px] text-magenta">No saved letterheads yet — upload one in the Studio (or ✒ Sign-a-PDF), then come back.</p>
                    )}
                    {o.useLetterhead && (
                      <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-navy">
                        <input type="checkbox" checked={o.useLetterheadColors} onChange={(e) => set1({ useLetterheadColors: e.target.checked })} className="accent-magenta" />
                        Match accent to the letterhead’s colours
                      </label>
                    )}
                  </div>

                  {o.useLetterhead && (
                    <div className="rounded-xl bg-[#f6f7f9] p-3 ring-1 ring-black/[0.05]">
                      <p className="mb-2 text-[11px] font-semibold text-navy">Space for the letterhead’s header &amp; footer</p>
                      <Field label={`Header space — top ${o.headerSpace} mm`} hint="Push the letter below your logo / header band.">
                        <input type="range" min={20} max={90} value={o.headerSpace} onChange={(e) => set1({ headerSpace: Number(e.target.value) })} className="w-full accent-magenta" />
                      </Field>
                      <Field label={`Footer space — bottom ${o.footerSpace} mm`} hint="Keep clear of the printed footer (phone / email).">
                        <input type="range" min={10} max={55} value={o.footerSpace} onChange={(e) => set1({ footerSpace: Number(e.target.value) })} className="w-full accent-magenta" />
                      </Field>
                      <p className="text-[10.5px] text-slate/60">The letter auto-shrinks to fit exactly between these two — always one page.</p>
                    </div>
                  )}

                  {!o.useLetterhead && (
                    <>
                      <Field label="Company name"><Text value={o.company} onChange={(v) => set1({ company: v })} placeholder="Company Name L.L.C" /></Field>
                      <Field label="City / country"><Text value={o.companyCity} onChange={(v) => set1({ companyCity: v })} placeholder="Dubai, U.A.E." /></Field>
                      <Field label="Logo (optional)">
                        <div className="flex items-center gap-2">
                          <input type="file" accept="image/*" onChange={pickLogo} className="text-xs" />
                          {o.logoDataUrl && <button onClick={() => set1({ logoDataUrl: "" })} className="text-xs font-semibold text-magenta">remove</button>}
                        </div>
                      </Field>
                      <Field label="Footer line 1"><Text value={o.footerLine1} onChange={(v) => set1({ footerLine1: v })} placeholder="Mob.: +000 000 0000, City, Country, Email : ..." /></Field>
                      <Field label="Footer line 2"><Text value={o.footerLine2} onChange={(v) => set1({ footerLine2: v })} placeholder="Dubai-U.A.E" /></Field>
                    </>
                  )}

                  <Field label="Accent colour">
                    <div className="flex items-center gap-2">
                      <input type="color" value={o.accent} onChange={(e) => set1({ accent: e.target.value })} className="h-8 w-10 cursor-pointer rounded-lg border border-hairline" />
                      <span className="text-xs tabular-nums text-slate">{o.accent}</span>
                      {o.useLetterhead && o.useLetterheadColors && <span className="text-[10.5px] text-slate/60">auto from letterhead</span>}
                    </div>
                  </Field>
                </Card>
              </>
            )}

            {/* ---------- STEP 2 · CANDIDATE ---------- */}
            {step === 1 && (
              <Card title="Who is the letter for?" hint="Scan the passport to autofill, or type the details manually.">
                <div className="rounded-xl bg-magenta/[0.05] p-3 ring-1 ring-magenta/20">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-navy">Fill from passport</span>
                    <label className={"cursor-pointer rounded-full px-3 py-1.5 text-xs font-bold text-white transition " + (scanning ? "bg-magenta/60" : "bg-magenta hover:bg-magenta/90")}>
                      {scanning ? "Scanning…" : "📷 Scan passport"}
                      <input type="file" accept="image/*" capture="environment" disabled={scanning} onChange={onScanPassport} className="hidden" />
                    </label>
                  </div>
                  <p className="mt-1.5 text-[10.5px] leading-snug text-slate/70">
                    Reads name, nationality &amp; passport no. <span className="text-magenta/90">The image is sent to Google’s AI to read it.</span>
                  </p>
                  {!aiConfigured() && <p className="mt-1 text-[10.5px] text-magenta">Scanning runs on the live site only (needs cloud AI) — not this local build.</p>}
                  {scanMsg && <p className="mt-1.5 text-[10.5px] font-medium text-navy">{scanMsg}</p>}
                </div>

                <div className="grid grid-cols-[80px_1fr] gap-3">
                  <Field label="Title">
                    <select value={o.salutation} onChange={(e) => set1({ salutation: e.target.value })} className={inputCls}>
                      {["Mr.", "Ms.", "Mrs.", "Dr."].map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Full name"><Text value={o.candidateName} onChange={(v) => set1({ candidateName: v })} placeholder="John Smith" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nationality"><Text value={o.nationality} onChange={(v) => set1({ nationality: v })} placeholder="Indian" /></Field>
                  <Field label="Passport no."><Text value={o.passportNo} onChange={(v) => set1({ passportNo: v })} placeholder="A1234567" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date"><Text type="date" value={o.date} onChange={(v) => set1({ date: v })} /></Field>
                  <Field label="Reference no."><Text value={o.refNo} onChange={(v) => set1({ refNo: v })} placeholder="HR/OL/001/2026" /></Field>
                </div>
              </Card>
            )}

            {/* ---------- STEP 3 · ROLE & TERMS ---------- */}
            {step === 2 && (
              <>
                <Card title="Role">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Position / profession"><Text value={o.position} onChange={(v) => set1({ position: v })} placeholder="Sales Executive" /></Field>
                    <Field label="Reports to"><Text value={o.reportingTo} onChange={(v) => set1({ reportingTo: v })} placeholder="the Manager" /></Field>
                  </div>
                  <Field label="Duties" hint="Appears after 'Your responsibilities shall include …'.">
                    <Area value={o.duties} onChange={(v) => set1({ duties: v })} rows={3} />
                  </Field>
                </Card>

                <Card title="Remuneration">
                  {o.salary.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={r.label} onChange={(e) => setSalary(i, { label: e.target.value })} className={inputCls} placeholder="Component" />
                      <input type="number" value={r.amount} onChange={(e) => setSalary(i, { amount: Number(e.target.value) })} className={inputCls + " w-28 text-right"} />
                      <button onClick={() => rmSalary(i)} className="shrink-0 rounded-lg px-2 py-1 text-magenta hover:bg-magenta/10" title="remove">✕</button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <button onClick={addSalary} className="rounded-full bg-[#f6f7f9] px-3 py-1.5 text-xs font-semibold text-navy ring-1 ring-black/[0.05] hover:bg-[#eef0f3]">+ Add component</button>
                    <div className="text-sm font-bold text-navy">Total {o.currency} {money(salaryTotal(o.salary))}</div>
                  </div>
                </Card>

                <Card title="Working hours & leave" hint="Add any condition (e.g. Maternity Leave) — it renders as a new row.">
                  {o.leave.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={r.item} onChange={(e) => setLeave(i, { item: e.target.value })} className={inputCls + " w-36 shrink-0"} placeholder="Item" />
                      <input value={r.detail} onChange={(e) => setLeave(i, { detail: e.target.value })} className={inputCls} placeholder="Detail" />
                      <button onClick={() => rmLeave(i)} className="shrink-0 rounded-lg px-2 py-1 text-magenta hover:bg-magenta/10" title="remove">✕</button>
                    </div>
                  ))}
                  <button onClick={addLeave} className="rounded-full bg-[#f6f7f9] px-3 py-1.5 text-xs font-semibold text-navy ring-1 ring-black/[0.05] hover:bg-[#eef0f3]">+ Add leave / condition</button>
                </Card>

                <Card title="Probation, benefits & validity">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Probation period"><Text value={o.probationMonths} onChange={(v) => set1({ probationMonths: v })} placeholder="two (2)" /></Field>
                    <Field label="Notice (days)"><Text value={o.noticeDays} onChange={(v) => set1({ noticeDays: v })} placeholder="fourteen (14)" /></Field>
                  </div>
                  <Field label="Benefits" hint="After 'The Company shall provide the following …'.">
                    <Area value={o.benefits} onChange={(v) => set1({ benefits: v })} rows={2} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Offer valid for"><Text value={o.validityDays} onChange={(v) => set1({ validityDays: v })} placeholder="fourteen (14)" /></Field>
                    <Field label="Governing law"><Text value={o.lawRef} onChange={(v) => set1({ lawRef: v })} placeholder="Federal Decree-Law No. 33 of 2021" /></Field>
                  </div>
                </Card>
              </>
            )}

            {/* ---------- STEP 4 · FINISH ---------- */}
            {step === 3 && (
              <>
                <Card title="Extra clauses (optional)" hint="Append your own numbered sections (7, 8 …). Wrap **text** in ** to bold it.">
                  {(o.customSections || []).map((s, i) => (
                    <div key={i} className="rounded-xl bg-[#f6f7f9] p-2.5 ring-1 ring-black/[0.05]">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-magenta/10 text-[11px] font-bold text-magenta">{7 + i}</span>
                        <input value={s.title} onChange={(e) => setClause(i, { title: e.target.value })} className={inputCls} placeholder="CLAUSE TITLE (e.g. ACCOMMODATION)" />
                        <button onClick={() => rmClause(i)} className="shrink-0 rounded-lg px-2 py-1 text-magenta hover:bg-magenta/10" title="remove">✕</button>
                      </div>
                      <Area value={s.body} onChange={(v) => setClause(i, { body: v })} rows={3} placeholder="Clause text…" />
                    </div>
                  ))}
                  <button onClick={addClause} className="rounded-full bg-[#f6f7f9] px-3 py-1.5 text-xs font-semibold text-navy ring-1 ring-black/[0.05] hover:bg-[#eef0f3]">+ Add clause</button>
                </Card>

                <Card title="Signature, stamp & fit">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Signature">
                      <select value={o.signatureId} onChange={(e) => set1({ signatureId: e.target.value })} className={inputCls}>
                        <option value="">— none —</option>
                        {signatures.map((s) => <option key={s.id} value={s.id}>{s.name || "Signature"}</option>)}
                      </select>
                    </Field>
                    <Field label="Company stamp">
                      <select value={o.stampId} onChange={(e) => set1({ stampId: e.target.value })} className={inputCls}>
                        <option value="">— none —</option>
                        {signatures.map((s) => <option key={s.id} value={s.id}>{s.name || "Stamp"}</option>)}
                      </select>
                    </Field>
                  </div>
                  {!signatures.length && <p className="text-[10.5px] text-slate/60">No saved signatures/stamps yet — add them in “✒ Sign a PDF”.</p>}
                  {(ctx.signature || ctx.stamp) && (
                    <div className="flex items-center gap-2">
                      <button onClick={openPlacer} className="rounded-full bg-magenta px-3 py-1.5 text-xs font-bold text-white transition hover:bg-magenta/90">✥ Drag &amp; resize on page</button>
                      {(o.sigPlace || o.stampPlace) && (
                        <button onClick={() => set1({ sigPlace: null, stampPlace: null })} className="text-xs font-semibold text-slate hover:text-magenta">reset position</button>
                      )}
                    </div>
                  )}
                  <p className="text-[10.5px] text-slate/60">Pick a signature/stamp above, then drag it exactly where you want it to print.</p>
                </Card>

                <div className="rounded-2xl bg-navy p-4 text-white">
                  <h3 className="text-[13px] font-extrabold">Want full control?</h3>
                  <p className="mt-1 text-[11px] leading-snug text-white/70">Open the letter in the free canvas editor — drag, resize, delete or edit every heading, table, line, signature and stamp, anywhere on the page (mobile too).</p>
                  <button onClick={editFreely} className="mt-2.5 w-full rounded-xl bg-magenta py-2.5 text-sm font-bold text-white transition hover:bg-magenta/90">✥ Edit everything (free canvas)</button>
                </div>

                <button onClick={download} className="btn-primary w-full justify-center py-3">Download PDF</button>
                <button onClick={() => { if (confirm("Reset all fields to the template defaults? Candidate entries will be cleared.")) { setO(DEFAULT_OFFER); setStep(0); } }}
                  className="w-full rounded-xl px-3 py-2 text-sm font-semibold text-slate ring-1 ring-black/[0.06] transition hover:bg-white">
                  Reset to defaults
                </button>
              </>
            )}
          </div>

          {/* nav */}
          <div className="flex items-center justify-between gap-2 border-t border-black/[0.06] bg-white px-4 py-3">
            <button onClick={back} disabled={step === 0}
              className="rounded-full px-4 py-2 text-sm font-semibold text-navy ring-1 ring-black/[0.06] transition enabled:hover:bg-[#f2f3f5] disabled:opacity-40">← Back</button>
            <span className="text-[11px] font-semibold text-slate/60">Step {step + 1} of {STEPS.length}</span>
            {step < STEPS.length - 1 ? (
              <button onClick={next} className="btn-primary px-5 py-2">Next →</button>
            ) : (
              <button onClick={download} className="btn-primary px-5 py-2">Download</button>
            )}
          </div>
        </aside>

        {/* ---- live preview ---- */}
        <main className="flex min-h-[42vh] min-w-0 flex-1 flex-col items-center overflow-auto p-4 md:min-h-0 md:p-6" style={{ background: "radial-gradient(1000px 600px at 50% -10%, rgba(204,0,102,0.06), transparent 55%), #e9ebef" }}>
          <div className="w-full max-w-[720px]">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate/70">Live preview</span>
              <span className="rounded-full bg-magenta/10 px-2 py-0.5 text-[11px] font-semibold text-magenta">✓ Always one page</span>
            </div>
            {previewUrl ? (
              <iframe title="offer preview" src={previewUrl} className="h-[980px] w-full rounded-xl bg-white shadow-lg ring-1 ring-black/10" />
            ) : (
              <div className="grid h-[980px] w-full place-items-center rounded-xl bg-white text-sm text-slate ring-1 ring-black/10">Rendering…</div>
            )}
          </div>
        </main>
      </div>

      {placerOpen && (
        <SignaturePlacer o={o} ctx={ctx} onChange={set1} onClose={() => setPlacerOpen(false)} />
      )}
    </div>
  );
}
