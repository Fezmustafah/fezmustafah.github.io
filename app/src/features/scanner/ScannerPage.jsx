// ScannerPage.jsx — Scan & Enhance mode. Add image/PDF -> perspective ("wrapping")
// crop with draggable corners + loupe -> pick one of four enhance modes ->
// export JPG/PNG/PDF or save straight into the letterhead library.
// All processing is on-device (scanWorker); nothing is uploaded.
import { useEffect, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { renderPdf } from "../../lib/pdfSign.js";
import { dominantAccent } from "../../lib/image.js";
import { saveLetterhead } from "../../lib/storage.js";

const STEPS = ["Add", "Crop", "Enhance", "Export"];
const MODES = [
  { key: "original", label: "Original", hint: "Just straightened" },
  { key: "enhance", label: "Enhance", hint: "Shadows removed, colour kept" },
  { key: "pro", label: "Enhance Pro", hint: "Print-ready black & white" },
  { key: "lighten", label: "Lighten", hint: "Bright & soft, colour kept" },
  { key: "mix", label: "Mix", hint: "White page, black text, colour hints" },
];
const CAP = 3000; // working resolution of the source photo

function uid() { return (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)); }

function toCanvas(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  draw(c.getContext("2d"), c.width, c.height);
  return c;
}

function thumbOf(canvas) {
  const k = 150 / Math.max(canvas.width, canvas.height);
  return toCanvas(canvas.width * k, canvas.height * k, (ctx, w, h) => ctx.drawImage(canvas, 0, 0, w, h))
    .toDataURL("image/jpeg", 0.7);
}

function defaultQuad(c) {
  const ix = c.width * 0.04, iy = c.height * 0.04;
  return [[ix, iy], [c.width - ix, iy], [c.width - ix, c.height - iy], [ix, c.height - iy]];
}

function makePage(canvas, name) {
  return { id: uid(), name, canvas, thumb: thumbOf(canvas), quad: defaultQuad(canvas), pv: null, pvStamp: "" };
}

async function pageFromFile(f) {
  let canvas;
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: "from-image" });
    const k = Math.min(1, CAP / Math.max(bmp.width, bmp.height));
    canvas = toCanvas(bmp.width * k, bmp.height * k, (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h));
    bmp.close?.();
  } catch {
    const url = URL.createObjectURL(f);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Could not decode image.")); i.src = url; });
    const k = Math.min(1, CAP / Math.max(img.naturalWidth, img.naturalHeight));
    canvas = toCanvas(img.naturalWidth * k, img.naturalHeight * k, (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h));
    URL.revokeObjectURL(url);
  }
  return makePage(canvas, f.name.replace(/\.[^.]+$/, ""));
}

async function pageFromDataUrl(dataUrl, name) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Could not decode page.")); i.src = dataUrl; });
  const k = Math.min(1, CAP / Math.max(img.naturalWidth, img.naturalHeight));
  return makePage(toCanvas(img.naturalWidth * k, img.naturalHeight * k, (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h)), name);
}

const imageDataOf = (c) => c.getContext("2d").getImageData(0, 0, c.width, c.height);

export default function ScannerPage({ onExit }) {
  const [pages, setPages] = useState([]);
  const [cur, setCur] = useState(0);
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState("enhance");
  const [strengthUi, setStrengthUi] = useState(1);
  const [strength, setStrength] = useState(1);
  const [fname, setFname] = useState("Scan");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const page = pages[cur];

  // worker (one, lazy) + promise-per-job
  const workerRef = useRef(null);
  const jobsRef = useRef(new Map());
  const jobId = useRef(0);
  useEffect(() => () => workerRef.current?.terminate(), []);
  function run(msg) {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL("./scanWorker.js", import.meta.url), { type: "module" });
      workerRef.current.onmessage = (e) => {
        const j = jobsRef.current.get(e.data.id);
        if (!j) return;
        jobsRef.current.delete(e.data.id);
        e.data.error ? j.reject(new Error(e.data.error)) : j.resolve(e.data);
      };
      workerRef.current.onerror = () => {
        // failed to load/crashed: fail pending jobs and recreate on next run
        for (const j of jobsRef.current.values()) j.reject(new Error("Processing failed — please retry."));
        jobsRef.current.clear();
        workerRef.current.terminate();
        workerRef.current = null;
      };
    }
    return new Promise((resolve, reject) => {
      const id = ++jobId.current;
      jobsRef.current.set(id, { resolve, reject });
      workerRef.current.postMessage({ id, ...msg }, [msg.buf]);
    });
  }

  const patchPage = (id, patch) => setPages((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  async function addFiles(list) {
    if (!list?.length) return;
    setBusy(true); setNote("");
    try {
      const added = [];
      for (const f of list) {
        if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
          const { pages: pp } = await renderPdf(await f.arrayBuffer(), 2);
          for (let i = 0; i < pp.length; i++) added.push(await pageFromDataUrl(pp[i].dataUrl, f.name.replace(/\.pdf$/i, "") + " p" + (i + 1)));
        } else {
          added.push(await pageFromFile(f));
        }
      }
      setPages((ps) => { setCur(ps.length); return [...ps, ...added]; });
      setStep(1);
    } catch (e) { setNote("Could not read file: " + e.message); }
    setBusy(false);
  }

  // debounce the strength slider into the working value
  useEffect(() => { const t = setTimeout(() => setStrength(strengthUi), 250); return () => clearTimeout(t); }, [strengthUi]);

  // preview: warp once + all modes, cached per page until quad/strength change
  const stamp = page ? JSON.stringify([page.quad, strength]) : "";
  useEffect(() => {
    if (step !== 2 || !page || (page.pv && page.pvStamp === stamp)) return;
    let dead = false;
    setBusy(true);
    const d = imageDataOf(page.canvas);
    run({ op: "preview", buf: d.data.buffer, w: d.width, h: d.height, quad: page.quad, strength })
      .then((r) => !dead && patchPage(page.id, { pv: r, pvStamp: stamp }))
      .catch((e) => !dead && setNote("Preview failed: " + e.message))
      .finally(() => !dead && setBusy(false));
    return () => { dead = true; };
  }, [step, page?.id, stamp]);

  async function fullPage(p) {
    const d = imageDataOf(p.canvas);
    const r = await run({ op: "full", buf: d.data.buffer, w: d.width, h: d.height, quad: p.quad, mode, strength });
    return toCanvas(r.w, r.h, (ctx) => ctx.putImageData(new ImageData(new Uint8ClampedArray(r.buf), r.w, r.h), 0, 0));
  }

  async function exportAs(fmt) {
    setBusy(true); setNote("Processing " + pages.length + " page" + (pages.length > 1 ? "s" : "") + "…");
    try {
      if (fmt === "pdf") {
        let doc = null;
        for (const p of pages) {
          const c = await fullPage(p);
          const wMm = 210, hMm = Math.round(210 * c.height / c.width * 100) / 100;
          const or = hMm >= wMm ? "portrait" : "landscape";
          if (!doc) doc = new jsPDF({ unit: "mm", format: [wMm, hMm], orientation: or });
          else doc.addPage([wMm, hMm], or);
          doc.addImage(c.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, wMm, hMm);
        }
        doc.save((fname || "Scan") + ".pdf");
      } else {
        for (let i = 0; i < pages.length; i++) {
          const c = await fullPage(pages[i]);
          const a = document.createElement("a");
          a.href = c.toDataURL(fmt === "png" ? "image/png" : "image/jpeg", 0.92);
          a.download = (fname || "Scan") + (pages.length > 1 ? "-" + (i + 1) : "") + "." + fmt;
          a.click();
          await new Promise((r) => setTimeout(r, 350));
        }
      }
      setNote("Done — saved to your downloads.");
    } catch (e) { setNote("Export failed: " + e.message); }
    setBusy(false);
  }

  async function saveAsLetterhead() {
    setBusy(true); setNote("Preparing letterhead…");
    try {
      const c = await fullPage(page || pages[0]);
      const k = Math.min(1, 1100 / c.width);
      const s = toCanvas(c.width * k, c.height * k, (ctx, w, h) => ctx.drawImage(c, 0, 0, w, h));
      const dataUrl = s.toDataURL("image/jpeg", 0.82);
      const accent = await dominantAccent(dataUrl).catch(() => null);
      await saveLetterhead({ name: fname || "Scanned letterhead", dataUrl, marginTop: 45, marginBottom: 22, marginSide: 12, accent: accent || "#A9853F" });
      setNote("Saved to your letterheads — pick it in the Studio.");
    } catch (e) { setNote("Could not save: " + e.message); }
    setBusy(false);
  }

  const removePage = (id) => setPages((ps) => { const n = ps.filter((p) => p.id !== id); setCur((c) => Math.min(c, Math.max(0, n.length - 1))); return n; });

  return (
    <div className="flex h-screen flex-col bg-[#e9ebef] text-navy">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-black/[0.06] bg-white/90 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <button onClick={onExit} className="rounded-full bg-[#f6f7f9] px-3 py-1.5 text-sm font-semibold ring-1 ring-black/[0.05] hover:bg-[#eef0f3]">← Studio</button>
          <div className="leading-none">
            <h1 className="font-display text-[15px] font-extrabold">📷 Scan &amp; Enhance</h1>
            <p className="mt-1 text-[11px] text-slate/80">Processed on your device — nothing is uploaded.</p>
          </div>
        </div>
        <div className="hidden gap-1.5 sm:flex">
          {STEPS.map((s, i) => (
            <button key={s} onClick={() => i < step && setStep(i)} disabled={i > step}
              className={"rounded-full px-3 py-1 text-xs font-semibold " + (i === step ? "bg-navy text-paper" : i < step ? "bg-[#f0f1f4] text-navy" : "bg-[#f0f1f4] text-slate/40")}>
              {i + 1}. {s}
            </button>
          ))}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center overflow-auto p-4">
        <div className="w-full max-w-4xl space-y-4">
          {pages.length > 1 && step > 0 && (
            <div className="flex gap-2 overflow-x-auto rounded-xl bg-white p-2 ring-1 ring-black/[0.05]">
              {pages.map((p, i) => (
                <div key={p.id} className={"relative shrink-0 cursor-pointer rounded-lg p-0.5 " + (i === cur ? "ring-2 ring-brass" : "ring-1 ring-black/10")} onClick={() => setCur(i)}>
                  <img src={p.thumb} alt={p.name} className="h-16 rounded-md" />
                  <button onClick={(e) => { e.stopPropagation(); removePage(p.id); }} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-navy text-[10px] text-paper">✕</button>
                </div>
              ))}
            </div>
          )}

          {step === 0 && (
            <div className="rounded-2xl bg-white p-6 ring-1 ring-black/[0.05]">
              <h2 className="text-lg font-bold">Add a photo or PDF</h2>
              <p className="mt-1 text-sm text-slate">A skewed phone photo is fine — you will straighten it next, like a real scanner.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-brass/40 bg-brass/[0.04] p-8 text-center hover:bg-brass/[0.08]">
                  <span className="text-2xl">🖼️</span>
                  <span className="mt-2 text-sm font-semibold">Choose images or a PDF</span>
                  <span className="mt-1 text-xs text-slate">JPG, PNG or PDF · multiple allowed</span>
                  <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => { addFiles([...e.target.files]); e.target.value = ""; }} />
                </label>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-black/10 bg-[#f6f7f9] p-8 text-center hover:bg-[#eef0f3] sm:flex">
                  <span className="text-2xl">📷</span>
                  <span className="mt-2 text-sm font-semibold">Take a photo</span>
                  <span className="mt-1 text-xs text-slate">Uses your camera</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addFiles([...e.target.files]); e.target.value = ""; }} />
                </label>
              </div>
            </div>
          )}

          {step === 1 && page && (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-black/[0.05]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold">Wrap the corners around the page</h2>
                  <p className="text-xs text-slate">Drag each corner exactly onto the document&apos;s corners — it will be straightened.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { const c = page.canvas, r = toCanvas(c.height, c.width, (ctx) => { ctx.translate(c.height, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(c, 0, 0); }); patchPage(page.id, { canvas: r, quad: defaultQuad(r), thumb: thumbOf(r), pv: null }); }}
                    className="rounded-full bg-[#f6f7f9] px-3 py-1.5 text-sm font-semibold ring-1 ring-black/[0.05]">⟳ Rotate</button>
                  <button onClick={() => patchPage(page.id, { quad: defaultQuad(page.canvas), pv: null })}
                    className="rounded-full bg-[#f6f7f9] px-3 py-1.5 text-sm font-semibold ring-1 ring-black/[0.05]">Reset</button>
                </div>
              </div>
              <QuadCrop page={page} onQuad={(q) => patchPage(page.id, { quad: q, pv: null })} />
            </div>
          )}

          {step === 2 && page && (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-black/[0.05]">
              <h2 className="font-bold">Pick a look</h2>
              <p className="text-xs text-slate">Every option is pure image processing — your content is never altered or redrawn.</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {MODES.map((m) => (
                  <ModeCard key={m.key} m={m} sel={mode === m.key} onClick={() => setMode(m.key)} pv={page.pv} />
                ))}
              </div>
              <label className="mt-4 block max-w-sm text-xs text-slate">
                <span className="flex justify-between font-semibold uppercase tracking-wide"><span>Strength</span><span className="tabular-nums text-navy">{strengthUi.toFixed(2)}×</span></span>
                <input type="range" min="0.5" max="1.5" step="0.05" value={strengthUi} onChange={(e) => setStrengthUi(Number(e.target.value))} className="mt-1 w-full accent-brass" />
              </label>
            </div>
          )}

          {step === 3 && page && (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-black/[0.05]">
              <h2 className="font-bold">Export</h2>
              <label className="mt-3 block max-w-sm">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate/70">File name</span>
                <input value={fname} onChange={(e) => setFname(e.target.value)} className="w-full rounded-xl bg-[#f6f7f9] px-3 py-2.5 text-sm outline-none ring-1 ring-black/[0.05] focus:bg-white focus:ring-2 focus:ring-brass/50" />
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                <button disabled={busy} onClick={() => exportAs("pdf")} className="btn-primary px-5 py-2.5">Download PDF{pages.length > 1 ? " (" + pages.length + " pages)" : ""}</button>
                <button disabled={busy} onClick={() => exportAs("jpg")} className="rounded-full bg-[#f6f7f9] px-5 py-2.5 text-sm font-semibold ring-1 ring-black/[0.05]">JPG</button>
                <button disabled={busy} onClick={() => exportAs("png")} className="rounded-full bg-[#f6f7f9] px-5 py-2.5 text-sm font-semibold ring-1 ring-black/[0.05]">PNG</button>
                <button disabled={busy} onClick={saveAsLetterhead} className="rounded-full border border-brass bg-brass/[0.06] px-5 py-2.5 text-sm font-semibold">💾 Save as letterhead</button>
              </div>
              <p className="mt-3 text-[11px] text-slate/70">Exports at high resolution (up to A4 · 300&nbsp;dpi). Current page is used for the letterhead.</p>
            </div>
          )}

          {(busy || note) && (
            <div className="rounded-xl bg-white px-4 py-2.5 text-sm ring-1 ring-black/[0.05]">
              {busy && <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-brass border-t-transparent align-middle" />}
              {busy && !note ? "Processing…" : note}
            </div>
          )}
        </div>
      </main>

      <footer className="flex shrink-0 items-center justify-between border-t border-black/[0.06] bg-white px-4 py-3">
        <button onClick={() => (step === 0 ? onExit() : setStep(step - 1))} className="rounded-full bg-[#f6f7f9] px-4 py-2 text-sm font-semibold ring-1 ring-black/[0.05]">
          {step === 0 ? "Exit" : "← Back"}
        </button>
        <span className="text-xs text-slate sm:hidden">{step + 1}/{STEPS.length} · {STEPS[step]}</span>
        {step < 3 && (
          <button disabled={!pages.length} onClick={() => setStep(step + 1)} className="btn-primary px-5 py-2 disabled:opacity-40">Next →</button>
        )}
        {step === 3 && <span />}
      </footer>
    </div>
  );
}

// ---- crop overlay: draggable quad + magnifier loupe ----
function QuadCrop({ page, onQuad }) {
  const wrapRef = useRef(null);
  const boxRef = useRef(null);
  const cvsRef = useRef(null);
  const loupeRef = useRef(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState(null); // corner index while dragging
  const c = page.canvas;

  useEffect(() => {
    function recalc() {
      const el = wrapRef.current;
      if (!el) return;
      const maxW = el.clientWidth, maxH = Math.max(280, window.innerHeight * 0.58);
      const k = Math.min(maxW / c.width, maxH / c.height);
      setDims({ w: Math.round(c.width * k), h: Math.round(c.height * k) });
    }
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [c]);

  useEffect(() => {
    if (!cvsRef.current || !dims.w) return;
    cvsRef.current.width = dims.w; cvsRef.current.height = dims.h;
    cvsRef.current.getContext("2d").drawImage(c, 0, 0, dims.w, dims.h);
  }, [c, dims]);

  const k = dims.w ? dims.w / c.width : 1;

  function drawLoupe(sx, sy) {
    const lc = loupeRef.current;
    if (!lc) return;
    const ctx = lc.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 120, 120);
    ctx.drawImage(c, sx - 24, sy - 24, 48, 48, 0, 0, 120, 120);
    ctx.strokeStyle = "#CC0066"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(60, 45); ctx.lineTo(60, 75); ctx.moveTo(45, 60); ctx.lineTo(75, 60); ctx.stroke();
  }

  function toSrc(e) {
    const r = boxRef.current.getBoundingClientRect(); // the sized overlay box, not the full-width wrapper
    const x = Math.min(c.width, Math.max(0, (e.clientX - r.left) / k));
    const y = Math.min(c.height, Math.max(0, (e.clientY - r.top) / k));
    return [x, y];
  }

  function onDown(i) {
    return (e) => {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic events have no active pointer */ }
      setDrag(i);
      const [sx, sy] = toSrc(e);
      drawLoupe(sx, sy);
    };
  }
  function onMove(i) {
    return (e) => {
      if (drag !== i) return;
      const p = toSrc(e);
      const q = page.quad.map((pt, j) => (j === i ? p : pt));
      onQuad(q);
      drawLoupe(p[0], p[1]);
    };
  }

  const q = page.quad;
  const pts = q.map(([x, y]) => [x * k, y * k]);
  const poly = pts.map((p) => p.join(",")).join(" ");
  const active = drag != null ? pts[drag] : null;
  // keep the loupe inside the image, opposite side of the finger
  const lx = active ? Math.min(dims.w - 130, Math.max(10, active[0] - 60)) : 0;
  const ly = active ? (active[1] > 150 ? active[1] - 150 : active[1] + 40) : 0;

  return (
    <div ref={wrapRef} className="relative mx-auto w-full" style={{ height: dims.h || 300, touchAction: "none" }}>
      <canvas ref={cvsRef} className="absolute left-1/2 top-0 -translate-x-1/2 rounded-lg" style={{ width: dims.w, height: dims.h }} />
      <div ref={boxRef} className="absolute top-0 left-1/2 -translate-x-1/2" style={{ width: dims.w, height: dims.h }}>
        <svg width={dims.w} height={dims.h} className="absolute inset-0">
          <path d={`M0,0H${dims.w}V${dims.h}H0Z M${poly.replace(/ /g, "L")}Z`} fill="rgba(17,32,58,0.45)" fillRule="evenodd" />
          <polygon points={poly} fill="none" stroke="#CC0066" strokeWidth="2" />
          {pts.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="14" fill="rgba(204,0,102,0.25)" stroke="#CC0066" strokeWidth="2"
              style={{ cursor: "grab", touchAction: "none" }}
              onPointerDown={onDown(i)} onPointerMove={onMove(i)} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)} />
          ))}
        </svg>
        {active && (
          <canvas ref={loupeRef} width="120" height="120" className="pointer-events-none absolute rounded-full border-2 border-magenta bg-white shadow-lg"
            style={{ left: lx, top: ly, borderColor: "#CC0066" }} />
        )}
      </div>
    </div>
  );
}

function ModeCard({ m, sel, onClick, pv }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !pv?.modes?.[m.key]) return;
    cv.width = pv.w; cv.height = pv.h;
    cv.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(pv.modes[m.key]), pv.w, pv.h), 0, 0);
  }, [pv, m.key]);
  return (
    <button onClick={onClick} className={"rounded-xl p-1.5 text-left transition " + (sel ? "bg-brass/[0.08] ring-2 ring-brass" : "bg-[#f6f7f9] ring-1 ring-black/[0.06] hover:bg-[#eef0f3]")}>
      <div className="grid aspect-[3/4] place-items-center overflow-hidden rounded-lg bg-white">
        {pv ? <canvas ref={ref} className="max-h-full max-w-full" /> : <span className="h-4 w-4 animate-spin rounded-full border-2 border-brass border-t-transparent" />}
      </div>
      <p className="mt-1.5 text-xs font-bold">{m.label}</p>
      <p className="text-[10px] leading-tight text-slate">{m.hint}</p>
    </button>
  );
}
