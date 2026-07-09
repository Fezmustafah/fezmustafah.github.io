import { useEffect, useRef, useState } from "react";
import { useEditor } from "./editor/useEditor.js";
import { makeText, makeRule, makeTable, TEMPLATE_LIST, A4, PXPM } from "./editor/model.js";
import { exportEditorPdf } from "./lib/exportPdf.js";
import { saveLetterhead, migrateLocalToCloud } from "./lib/storage.js";
import Canvas from "./editor/Canvas.jsx";
import Inspector from "./editor/Inspector.jsx";
import EditorLetterheads from "./editor/EditorLetterheads.jsx";
import EditorPresets from "./editor/EditorPresets.jsx";
import StampStudio from "./editor/StampStudio.jsx";
import AiPanel from "./editor/AiPanel.jsx";
import MobileShell from "./editor/MobileShell.jsx";
import Tutorial, { seenOnboarding } from "./editor/Tutorial.jsx";
import SignPdf from "./sign/SignPdf.jsx";
import TrackerPage from "./features/tracker/TrackerPage.jsx";
import VendorsPage from "./features/vendors/VendorsPage.jsx";
import OfferLetterPage from "./features/offerletter/OfferLetterPage.jsx";
import ScannerPage from "./features/scanner/ScannerPage.jsx";
import { useViewport } from "./editor/useViewport.js";
import AuthBar from "./auth/AuthBar.jsx";
import { useAuth } from "./auth/AuthProvider.jsx";

// Flat, borderless section — modern editor feel (no boxed "panels").
function Group({ title, icon, right, children }) {
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate/70">
          {icon && <span className="text-brass">{icon}</span>}
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function ToolChip({ icon, label, onClick, accent }) {
  return (
    <button
      onClick={onClick}
      className={
        "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition " +
        (accent
          ? "border-brass/30 bg-brass/[0.06] text-navy hover:bg-brass/10"
          : "border-black/[0.06] bg-[#f6f7f9] text-navy hover:bg-[#eef0f3]")
      }
    >
      <span className="text-slate">{icon}</span>
      {label}
    </button>
  );
}

/* minimal inline icons (no icon lib in the app bundle) */
const I = {
  text: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7V5h16v2M9 5v14M7 19h4" /></svg>,
  table: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></svg>,
  line: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 12h16" /></svg>,
  stamp: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21h14M9 8a3 3 0 1 1 6 0c0 2-2 3-2 5h-2c0-2-2-3-2-5Z" /><path d="M7 17h10v-2H7z" /></svg>,
  spark: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 5.6L19 9l-5.2 1.4L12 16l-1.8-5.6L5 9l5.2-1.4z" /></svg>,
  download: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" /></svg>,
  eye: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>,
};

function Mark() {
  return (
    <svg viewBox="0 0 64 64" className="h-8 w-8">
      <rect width="64" height="64" rx="14" fill="#11203A" />
      <rect x="18" y="13" width="28" height="38" rx="3" fill="#F4F1EA" />
      <rect x="18" y="13" width="28" height="8" rx="3" fill="#A9853F" />
      <rect x="23" y="28" width="18" height="2.6" rx="1.3" fill="#11203A" />
      <rect x="23" y="34" width="18" height="2.6" rx="1.3" fill="#11203A" />
      <rect x="23" y="40" width="11" height="2.6" rx="1.3" fill="#A9853F" />
    </svg>
  );
}

export default function App() {
  const [editor, dispatch] = useEditor();
  const [stampOpen, setStampOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showTutorial, setShowTutorial] = useState(() => !seenOnboarding());
  const [mode, setMode] = useState("studio"); // "studio" | "sign" | "tracker" | "vendors" | "offer" | "scan"
  const auth = useAuth();
  const storeKey = (auth?.user?.id || "local") + ":" + refreshKey;
  const lh = editor.letterhead;
  const saveTimer = useRef(null);

  // On login: auto-migrate local letterheads/signs to cloud, then refresh components.
  useEffect(() => {
    if (!auth?.user?.id || !auth?.cloudEnabled) return;
    migrateLocalToCloud().catch(() => {}).finally(() => setRefreshKey((k) => k + 1));
  }, [auth?.user?.id]);

  useEffect(() => {
    if (!lh.id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveLetterhead({
        id: lh.id, name: lh.name, dataUrl: lh.dataUrl,
        marginTop: lh.marginTop, marginBottom: lh.marginBottom, marginSide: lh.marginSide, accent: lh.accent,
      });
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [lh.id, lh.marginTop, lh.marginBottom, lh.marginSide, lh.accent, lh.name, lh.dataUrl]);

  const setLh = (patch) => dispatch({ type: "SET_LETTERHEAD", patch });

  const addText = () => dispatch({ type: "ADD", element: makeText({ xMm: lh.marginSide, yMm: lh.marginTop + 8, wMm: A4.wMm - lh.marginSide * 2, text: "New text block", color: "#222" }) });
  const addLine = () => dispatch({ type: "ADD", element: makeRule({ xMm: lh.marginSide, yMm: lh.marginTop + 30, wMm: 80 }) });
  const addTable = () => dispatch({ type: "ADD", element: makeTable({ xMm: lh.marginSide, yMm: lh.marginTop + 40, wMm: A4.wMm - lh.marginSide * 2, accent: lh.accent }) });

  function loadTemplate(id) {
    if (editor.elements.length && !window.confirm("Replace the current layout with the " + id + " template?")) return;
    dispatch({ type: "LOAD_TEMPLATE", id });
  }
  function download() {
    const doc = exportEditorPdf(editor);
    doc.save(`${(lh.name || "Document").replace(/\s+/g, "_")}.pdf`);
  }
  function preview() {
    window.open(exportEditorPdf(editor).output("bloburl"), "_blank");
  }
  function clearLayout() {
    if (!editor.elements.length || window.confirm("Clear all blocks and start a blank page?")) {
      dispatch({ type: "CLEAR" });
    }
  }

  const vp = useViewport();

  // shared margin + accent controls (used by desktop sidebar AND mobile sheet)
  const MarginControls = () => (
    <div className="space-y-2">
      <Slider label="Header zone" value={lh.marginTop} min={10} max={120} onChange={(v) => setLh({ marginTop: v })} />
      <Slider label="Footer zone" value={lh.marginBottom} min={10} max={80} onChange={(v) => setLh({ marginBottom: v })} />
      <Slider label="Side" value={lh.marginSide} min={8} max={40} onChange={(v) => setLh({ marginSide: v })} />
    </div>
  );
  const AccentInput = () => (
    <label className="flex items-center gap-2 text-xs text-navy/60">
      <span className="w-16 font-semibold uppercase tracking-wide">Accent</span>
      <input type="color" value={lh.accent} onChange={(e) => setLh({ accent: e.target.value })} className="h-6 w-9 rounded border border-hairline" />
      <span className="tabular-nums">{lh.accent}</span>
    </label>
  );

  if (mode === "sign") {
    return <SignPdf onExit={() => setMode("studio")} storeKey={storeKey} signedIn={!!auth?.user} />;
  }

  if (mode === "scan") {
    return <ScannerPage onExit={() => setMode("studio")} />;
  }

  if (mode === "tracker") {
    return <TrackerPage onExit={() => setMode("studio")} storeKey={storeKey} />;
  }

  if (mode === "vendors") {
    return <VendorsPage onExit={() => setMode("studio")} storeKey={storeKey} />;
  }

  if (mode === "offer") {
    return (
      <OfferLetterPage
        onExit={() => setMode("studio")}
        storeKey={storeKey}
        onOpenInEditor={(payload) => {
          dispatch({ type: "SET_LETTERHEAD", patch: payload.letterhead });
          dispatch({ type: "SET_ELEMENTS", elements: payload.elements });
          setMode("studio");
        }}
      />
    );
  }

  if (vp.isMobile) {
    return (
      <>
        <MobileShell
          editor={editor} dispatch={dispatch}
          AiPanel={AiPanel} Inspector={Inspector}
          EditorLetterheads={EditorLetterheads} EditorPresets={EditorPresets}
          AuthBar={AuthBar} onAuthChange={() => setRefreshKey((k) => k + 1)}
          onSignup={() => setShowTutorial(true)} onHelp={() => setShowTutorial(true)}
          onSignMode={() => setMode("sign")}
          onScanMode={() => setMode("scan")}
          onTrackerMode={() => setMode("tracker")}
          onVendorMode={() => setMode("vendors")}
          onOfferMode={() => setMode("offer")}
          storeKey={storeKey}
          onPreview={preview} onDownload={download} onClear={clearLayout}
          onAddText={addText} onAddTable={addTable} onAddLine={addLine}
          onOpenStamp={() => setStampOpen(true)}
          onLoadTemplate={loadTemplate} templates={TEMPLATE_LIST}
          MarginControls={MarginControls} AccentInput={AccentInput}
        />
        {stampOpen && <StampStudio editor={editor} dispatch={dispatch} onClose={() => setStampOpen(false)} />}
        {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}
      </>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#e9ebef] text-navy">
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-black/[0.06] bg-white/90 px-4 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <Mark />
          <div className="leading-none">
            <h1 className="font-display text-[15px] font-extrabold tracking-tightest text-navy">Letterhead Studio</h1>
            <p className="mt-1 text-[11px] text-slate/80">Describe it, or drop blocks — on your letterhead.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMode("offer")} title="Employment Offer Letter"
            className="flex items-center gap-1.5 rounded-full bg-[#f6f7f9] px-3 py-1.5 text-sm font-semibold text-navy ring-1 ring-black/[0.05] transition hover:bg-[#eef0f3]">
            📝 Offer Letter
          </button>
          <button onClick={() => setMode("tracker")} title="Daily Invoice Tracker"
            className="flex items-center gap-1.5 rounded-full bg-[#f6f7f9] px-3 py-1.5 text-sm font-semibold text-navy ring-1 ring-black/[0.05] transition hover:bg-[#eef0f3]">
            📋 Daily Tracker
          </button>
          <button onClick={() => setMode("vendors")} title="Vendor Statements & netting"
            className="flex items-center gap-1.5 rounded-full bg-[#f6f7f9] px-3 py-1.5 text-sm font-semibold text-navy ring-1 ring-black/[0.05] transition hover:bg-[#eef0f3]">
            📒 Vendors
          </button>
          <button onClick={() => setMode("scan")} title="Scan & enhance a document"
            className="flex items-center gap-1.5 rounded-full bg-[#f6f7f9] px-3 py-1.5 text-sm font-semibold text-navy ring-1 ring-black/[0.05] transition hover:bg-[#eef0f3]">
            📷 Scan
          </button>
          <button onClick={() => setMode("sign")} title="Sign an existing PDF"
            className="flex items-center gap-1.5 rounded-full bg-[#f6f7f9] px-3 py-1.5 text-sm font-semibold text-navy ring-1 ring-black/[0.05] transition hover:bg-[#eef0f3]">
            ✒ Sign a PDF
          </button>
          <button onClick={() => setShowTutorial(true)} title="How it works"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-slate hover:bg-black/[0.04]">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-[#f0f1f4] text-xs">?</span> Guide
          </button>
          <AuthBar onAuthChange={() => setRefreshKey((k) => k + 1)} onSignup={() => setShowTutorial(true)} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ---- left: editing tools ---- */}
        <aside className="w-[300px] shrink-0 space-y-6 overflow-auto border-r border-black/[0.06] bg-white p-4">
          {editor.selectedId && (
            <div className="rounded-2xl bg-[#f6f7f9] p-3.5 ring-1 ring-black/[0.05]">
              <Group title="Selected block" icon={I.spark}>
                <Inspector editor={editor} dispatch={dispatch} />
              </Group>
            </div>
          )}

          <Group title="Write with AI" icon={I.spark}>
            <AiPanel editor={editor} dispatch={dispatch} />
          </Group>

          <Group title="Add to the page">
            <div className="grid grid-cols-2 gap-2">
              <ToolChip icon={I.text} label="Text" onClick={addText} />
              <ToolChip icon={I.table} label="Table" onClick={addTable} />
              <ToolChip icon={I.line} label="Line" onClick={addLine} />
              <ToolChip icon={I.stamp} label="Sign / Stamp" onClick={() => setStampOpen(true)} accent />
            </div>
          </Group>

          <Group title="Start as">
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_LIST.map((t) => (
                <button key={t.id} onClick={() => loadTemplate(t.id)}
                  className="rounded-full bg-[#f6f7f9] px-3 py-1.5 text-xs font-semibold text-navy ring-1 ring-black/[0.05] transition hover:bg-[#eef0f3]">
                  {t.label}
                </button>
              ))}
            </div>
          </Group>

          <Group title="Letterhead" right={
            <button onClick={() => dispatch({ type: "TOGGLE_GUIDES" })}
              className={"rounded-full px-2 py-0.5 text-[10px] font-semibold transition " + (editor.showGuides ? "bg-navy text-paper" : "bg-[#f0f1f4] text-slate")}>
              guides
            </button>
          }>
            <EditorLetterheads key={"lh:" + storeKey} editor={editor} dispatch={dispatch} />
            <div className="mt-3 space-y-2.5">
              <Slider label="Header zone" value={lh.marginTop} min={10} max={120} onChange={(v) => setLh({ marginTop: v })} />
              <Slider label="Footer zone" value={lh.marginBottom} min={10} max={80} onChange={(v) => setLh({ marginBottom: v })} />
              <Slider label="Side" value={lh.marginSide} min={8} max={40} onChange={(v) => setLh({ marginSide: v })} />
              <label className="flex items-center gap-2 pt-1 text-xs text-slate">
                <span className="w-16 font-semibold uppercase tracking-wide">Accent</span>
                <input type="color" value={lh.accent} onChange={(e) => setLh({ accent: e.target.value })} className="h-7 w-9 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
                <span className="tabular-nums text-slate/70">{lh.accent}</span>
              </label>
            </div>
          </Group>

          <Group title="Saved layouts">
            <EditorPresets key={"pr:" + storeKey} editor={editor} dispatch={dispatch} />
          </Group>
        </aside>

        {/* ---- center: canvas (scales to fill the workspace) ---- */}
        <FitCanvas editor={editor} dispatch={dispatch} />

        {/* ---- right: document / export ---- */}
        <aside className="flex w-[296px] shrink-0 flex-col space-y-6 overflow-auto border-l border-black/[0.06] bg-white p-4">
          <Group title="Export">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate/70">File name</span>
              <input
                value={lh.name}
                onChange={(e) => setLh({ name: e.target.value })}
                placeholder="Document"
                className="w-full rounded-xl bg-[#f6f7f9] px-3 py-2.5 text-sm text-navy outline-none ring-1 ring-black/[0.05] transition focus:bg-white focus:ring-2 focus:ring-brass/50"
              />
            </label>
            <div className="mt-3 space-y-2">
              <button onClick={download} className="btn-primary w-full justify-center py-3">{I.download} Download PDF</button>
              <button onClick={preview} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#f6f7f9] py-2.5 text-sm font-semibold text-navy ring-1 ring-black/[0.05] transition hover:bg-[#eef0f3]">{I.eye} Preview</button>
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-slate/70">Print-ready A4 PDF, rendered on your letterhead.</p>
          </Group>

          <Group title="Page">
            <div className="rounded-xl bg-[#f6f7f9] px-3 py-2.5 text-xs text-slate ring-1 ring-black/[0.05]">
              <span className="font-semibold text-navy">{editor.elements.length}</span> block{editor.elements.length === 1 ? "" : "s"} placed
            </div>
            <button
              onClick={clearLayout}
              className="mt-2 w-full rounded-xl px-3 py-2 text-sm font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50"
            >
              Clear page
            </button>
          </Group>
        </aside>
      </div>

      {stampOpen && <StampStudio editor={editor} dispatch={dispatch} onClose={() => setStampOpen(false)} />}
      {showTutorial && <Tutorial onClose={() => setShowTutorial(false)} />}
    </div>
  );
}

// Center workspace that scales the A4 page to fill the available room, so the
// editor feels large instead of a small sheet floating in dead space.
function FitCanvas({ editor, dispatch }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const W = A4.wMm * PXPM;
    function recalc() {
      const el = ref.current;
      if (!el || !el.clientWidth) return;
      // fill the workspace width so the page is large; user scrolls vertically.
      const s = (el.clientWidth - 56) / W;
      setScale(Math.max(0.6, Math.min(1.7, s)));
    }
    recalc();
    // a couple of deferred passes catch the first paint before flex settles
    const raf = requestAnimationFrame(recalc);
    const t = setTimeout(recalc, 120);
    const ro = new ResizeObserver(recalc);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener("resize", recalc);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); ro.disconnect(); window.removeEventListener("resize", recalc); };
  }, []);
  return (
    <div
      ref={ref}
      className="flex flex-1 items-start justify-center overflow-auto p-8"
      style={{ background: "radial-gradient(1200px 700px at 50% -12%, rgba(169,133,63,0.06), transparent 55%), #e9ebef" }}
    >
      <Canvas editor={editor} dispatch={dispatch} scale={scale} />
    </div>
  );
}

function Slider({ label, value, min, max, onChange }) {
  return (
    <label className="block text-xs text-slate">
      <span className="flex justify-between">
        <span className="font-semibold uppercase tracking-wide text-slate/70">{label}</span>
        <span className="tabular-nums font-semibold text-navy">{value} mm</span>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-brass" />
    </label>
  );
}
