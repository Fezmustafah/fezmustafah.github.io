// SignPdf — upload a PDF, see it page-by-page, and drop your saved signature /
// stamp anywhere. Signs are blended (white background removed) and saved to your
// account, so next time you just tap one and place it. Exports the ORIGINAL pdf
// with the signatures stamped in (pdf-lib), so quality is preserved.
import { useEffect, useRef, useState } from "react";
import { blendVariants } from "../lib/blend.js";
import { renderPdf, exportSignedPdf, downloadBytes } from "../lib/pdfSign.js";
import { listSignatures, saveSignature, deleteSignature } from "../lib/storage.js";

const CHECKER = "repeating-conic-gradient(#d8d4cc 0% 25%, #f4f1ea 0% 50%) 50% / 14px 14px";
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export default function SignPdf({ onExit, storeKey, signedIn, initialPdf }) {
  const [doc, setDoc] = useState(null); // { pages, bytes, numPages }
  const [pdfName, setPdfName] = useState("document");
  const [placements, setPlacements] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [signs, setSigns] = useState([]);
  const [blendOpen, setBlendOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [exporting, setExporting] = useState(false);
  const activePage = useRef(0);
  const pageRefs = useRef({});
  const scrollRef = useRef(null);

  useEffect(() => { refreshSigns(); }, [storeKey]);

  // seeded from Scan & Enhance — load the freshly scanned PDF straight away
  useEffect(() => {
    if (!initialPdf?.bytes) return;
    setBusy(true);
    renderPdf(initialPdf.bytes)
      .then((out) => { setDoc(out); setPdfName(initialPdf.name || "document"); })
      .catch(() => setErr("Could not open the scanned PDF."))
      .finally(() => setBusy(false));
  }, [initialPdf]);
  async function refreshSigns() {
    try { setSigns(await listSignatures()); } catch { setSigns([]); }
  }

  async function onPdf(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(""); setBusy(true); setPlacements([]); setSelectedId(null);
    try {
      const buf = await file.arrayBuffer();
      const out = await renderPdf(buf);
      setDoc(out);
      setPdfName(file.name.replace(/\.pdf$/i, "") || "document");
    } catch {
      setErr("Could not open that PDF. Make sure it's a valid .pdf file.");
    } finally { setBusy(false); }
  }

  function place(sig) {
    if (!doc) { setErr("Upload a PDF first."); return; }
    const pageIndex = clamp(activePage.current, 0, doc.numPages - 1);
    const wFrac = 0.26;
    setPlacements((ps) => [
      ...ps,
      { id: rid(), pageIndex, xFrac: 0.5 - wFrac / 2, yFrac: 0.6, wFrac, aspect: sig.aspect || 0.45, dataUrl: sig.dataUrl },
    ]);
  }
  const update = (id, patch) => setPlacements((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id) => { setPlacements((ps) => ps.filter((p) => p.id !== id)); setSelectedId(null); };

  function duplicateOnAllPages() {
    const pl = placements.find((p) => p.id === selectedId);
    if (!pl || !doc) return;
    const extras = [];
    for (let i = 0; i < doc.numPages; i++) {
      if (i === pl.pageIndex) continue;
      extras.push({ id: rid(), pageIndex: i, xFrac: pl.xFrac, yFrac: pl.yFrac, wFrac: pl.wFrac, aspect: pl.aspect, dataUrl: pl.dataUrl });
    }
    setPlacements((ps) => [...ps, ...extras]);
    setSelectedId(null);
  }

  function onDragStart(e, pl) {
    e.stopPropagation(); e.preventDefault();
    setSelectedId(pl.id);
    const rect = pageRefs.current[pl.pageIndex].getBoundingClientRect();
    const s = { x: e.clientX, y: e.clientY, xFrac: pl.xFrac, yFrac: pl.yFrac };
    const move = (ev) => update(pl.id, {
      xFrac: clamp(s.xFrac + (ev.clientX - s.x) / rect.width, 0, 1 - pl.wFrac),
      yFrac: clamp(s.yFrac + (ev.clientY - s.y) / rect.height, 0, 1),
    });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }
  function onResizeStart(e, pl) {
    e.stopPropagation(); e.preventDefault();
    const rect = pageRefs.current[pl.pageIndex].getBoundingClientRect();
    const s = { x: e.clientX, wFrac: pl.wFrac };
    const move = (ev) => update(pl.id, { wFrac: clamp(s.wFrac + (ev.clientX - s.x) / rect.width, 0.05, 1) });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  }

  function onScroll() {
    const sc = scrollRef.current; if (!sc) return;
    const mid = sc.scrollTop + sc.clientHeight / 2;
    let best = 0, bestD = Infinity;
    Object.entries(pageRefs.current).forEach(([i, el]) => {
      if (!el) return;
      const c = el.offsetTop + el.offsetHeight / 2;
      const d = Math.abs(c - mid);
      if (d < bestD) { bestD = d; best = Number(i); }
    });
    activePage.current = best;
  }

  async function doExport() {
    if (!doc) return;
    setExporting(true);
    try {
      const bytes = await exportSignedPdf(doc.bytes, placements);
      downloadBytes(bytes, `${pdfName}-signed.pdf`);
    } catch (e) {
      setErr("Export failed: " + (e.message || "unknown"));
    } finally { setExporting(false); }
  }

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-[#e9ebef] text-navy">
      {/* top bar */}
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-black/[0.06] bg-white/90 px-3 backdrop-blur sm:px-4">
        <div className="flex items-center gap-2">
          <button onClick={onExit} className="tap flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold text-slate hover:bg-black/[0.04]">← Studio</button>
          <span className="hidden font-display text-[15px] font-extrabold tracking-tightest sm:inline">Sign a PDF</span>
        </div>
        <button onClick={doExport} disabled={!doc || exporting}
          className="tap btn-primary text-sm disabled:opacity-40">
          {exporting ? "Exporting…" : "Download signed PDF"}
        </button>
      </header>

      {/* signatures strip — portrait cards with name label */}
      <div className="smooth-scroll shrink-0 overflow-x-auto border-b border-black/[0.06] bg-white px-3 py-2.5">
        <div className="flex items-end gap-2">
          <button onClick={() => setBlendOpen(true)}
            className="tap flex h-28 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-brass/50 bg-brass/[0.05] text-[10px] font-semibold text-navy">
            <span className="text-2xl leading-none text-brass">＋</span>
            <span>Add sign</span>
          </button>
          {signs.length === 0 && (
            <span className="px-2 text-xs text-slate">No saved signatures yet — add your sign or stamp once, reuse forever.</span>
          )}
          {signs.map((s) => (
            <div key={s.id} className="group relative shrink-0">
              <button onClick={() => place(s)} title={`Place "${s.name}"`}
                className="tap flex w-20 flex-col overflow-hidden rounded-xl border border-black/[0.06]">
                <div className="flex h-20 w-full items-center justify-center p-1.5" style={{ background: CHECKER }}>
                  <img src={s.dataUrl} alt={s.name} className="max-h-16 max-w-full object-contain" />
                </div>
                <div className="truncate bg-white px-1.5 py-1 text-center text-[10px] font-semibold text-navy">{s.name}</div>
              </button>
              <button onClick={async () => { await deleteSignature(s.id); refreshSigns(); }}
                className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 place-items-center rounded-full bg-red-600 text-[10px] text-white group-hover:grid">✕</button>
            </div>
          ))}
        </div>
      </div>

      {err && <div className="bg-red-50 px-4 py-1.5 text-xs text-red-700">{err}</div>}

      {/* pages */}
      <div ref={scrollRef} onScroll={onScroll} onPointerDown={() => setSelectedId(null)}
        className="smooth-scroll relative flex-1 overflow-auto p-3 sm:p-6">
        {!doc ? (
          <label className="mx-auto mt-10 flex max-w-md cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-black/15 bg-white/60 p-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-navy text-2xl text-brass">⬆</span>
            <span className="font-display text-lg font-bold">{busy ? "Opening…" : "Upload a PDF to sign"}</span>
            <span className="text-sm text-slate">It splits into pages. Drop your sign or stamp anywhere, then download.</span>
            <input type="file" accept="application/pdf" onChange={onPdf} className="hidden" />
            <span className="tap btn-primary mt-1 text-sm">Choose PDF</span>
          </label>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-5">
            {doc.pages.map((pg, i) => (
              <div key={i} ref={(el) => (pageRefs.current[i] = el)}
                className="relative w-full overflow-hidden rounded-md bg-white shadow-lift ring-1 ring-black/5">
                <img src={pg.dataUrl} alt={`Page ${i + 1}`} className="block w-full select-none" draggable={false} />
                <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">Page {i + 1}</div>
                {placements.filter((p) => p.pageIndex === i).map((pl) => (
                  <div key={pl.id}
                    onPointerDown={(e) => onDragStart(e, pl)}
                    style={{ left: `${pl.xFrac * 100}%`, top: `${pl.yFrac * 100}%`, width: `${pl.wFrac * 100}%` }}
                    className={"absolute cursor-grab touch-none active:cursor-grabbing " + (selectedId === pl.id ? "outline outline-2 outline-brass" : "hover:outline hover:outline-1 hover:outline-brass/60")}>
                    <img src={pl.dataUrl} alt="" className="pointer-events-none block w-full select-none" draggable={false} />
                    {selectedId === pl.id && (
                      <>
                        <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); remove(pl.id); }}
                          className="absolute -right-2.5 -top-2.5 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-xs text-white shadow">✕</button>
                        <span onPointerDown={(e) => onResizeStart(e, pl)}
                          className="absolute -bottom-2 -right-2 h-5 w-5 cursor-se-resize touch-none rounded-full border-2 border-white bg-navy shadow" />
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <p className="pb-20 text-xs text-slate">Tap a saved signature above to drop it on the page in view · drag to move · corner handle to resize.</p>
          </div>
        )}

        {/* floating action bar — appears when a placement is selected */}
        {selectedId && (
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow-2xl ring-1 ring-black/10"
              style={{ animation: "lhSlideUp .22s cubic-bezier(.16,1,.3,1)" }}>
              {doc && doc.numPages > 1 && (
                <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); duplicateOnAllPages(); }}
                  className="tap flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-xs font-semibold text-paper">
                  ⧉ Duplicate on all pages
                </button>
              )}
              <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); remove(selectedId); }}
                className="tap flex items-center gap-1 rounded-full bg-red-600 px-3 py-2 text-xs font-semibold text-white">
                ✕ Remove
              </button>
            </div>
          </div>
        )}
      </div>

      {blendOpen && (
        <BlendModal
          signedIn={signedIn}
          onClose={() => setBlendOpen(false)}
          onSaved={(sig) => { refreshSigns(); setBlendOpen(false); place(sig); }}
        />
      )}
    </div>
  );
}

function BlendModal({ onClose, onSaved, signedIn }) {
  const [busy, setBusy] = useState(false);
  const [aspect, setAspect] = useState(0.45);
  const [variants, setVariants] = useState([]);
  const [picked, setPicked] = useState("ink");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(""); setBusy(true);
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(); r.readAsDataURL(file);
      });
      const out = await blendVariants(dataUrl);
      setAspect(out.aspect); setVariants(out.variants); setPicked(out.variants[0].key);
    } catch { setErr("Could not process that image. Try a clear photo of ink on white paper."); }
    finally { setBusy(false); }
  }

  async function save() {
    const v = variants.find((x) => x.key === picked); if (!v) return;
    setBusy(true);
    try {
      const sig = await saveSignature({ name: name.trim() || "Signature", dataUrl: v.dataUrl, aspect });
      onSaved(sig);
    } catch { setErr("Could not save. Try again."); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-navy/55 p-4 backdrop-blur-sm"
      style={{ animation: "lhFade .15s ease-out" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/10" style={{ animation: "lhPop .2s cubic-bezier(.16,1,.3,1)" }}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-lg font-extrabold tracking-tightest text-navy">Add signature / stamp</h2>
          <button onClick={onClose} className="tap text-navy/50">✕</button>
        </div>
        <p className="mb-3 text-sm text-slate">Photo or scan of ink on white paper works best. The white background is removed automatically — pick the cleanest of the three.</p>
        <input type="file" accept="image/*" onChange={onFile} className="mb-3 text-sm" />
        {busy && <p className="text-sm text-slate">Working…</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}

        {variants.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {variants.map((v) => (
                <button key={v.key} onClick={() => setPicked(v.key)}
                  className={"tap rounded-xl border p-1 " + (picked === v.key ? "border-navy ring-2 ring-navy" : "border-hairline")}>
                  <div className="flex h-24 items-center justify-center rounded-lg" style={{ background: CHECKER }}>
                    <img src={v.dataUrl} alt={v.label} className="max-h-20 max-w-full object-contain" />
                  </div>
                  <span className="mt-1 block text-center text-[11px] font-medium text-navy">{v.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. My signature)"
                className="flex-1 rounded-xl bg-[#f6f7f9] px-3 py-2.5 text-sm outline-none ring-1 ring-black/[0.05] focus:ring-2 focus:ring-brass/50" />
              <button onClick={save} disabled={busy} className="tap btn-primary text-sm disabled:opacity-50">Save &amp; place</button>
            </div>
            {!signedIn && <p className="mt-2 text-[11px] text-slate">Saved on this device. Sign in to keep your signatures across devices.</p>}
          </>
        )}
      </div>
    </div>
  );
}
