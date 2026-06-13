import { useEffect, useRef, useState } from "react";
import { useEditor } from "./editor/useEditor.js";
import { makeText, makeRule, makeTable, TEMPLATE_LIST, A4 } from "./editor/model.js";
import { exportEditorPdf } from "./lib/exportPdf.js";
import { saveLetterhead } from "./lib/storage.js";
import Canvas from "./editor/Canvas.jsx";
import Inspector from "./editor/Inspector.jsx";
import EditorLetterheads from "./editor/EditorLetterheads.jsx";
import EditorPresets from "./editor/EditorPresets.jsx";
import StampStudio from "./editor/StampStudio.jsx";
import AiPanel from "./editor/AiPanel.jsx";
import MobileShell from "./editor/MobileShell.jsx";
import { useViewport } from "./editor/useViewport.js";
import AuthBar from "./auth/AuthBar.jsx";
import { useAuth } from "./auth/AuthProvider.jsx";

function Panel({ title, children, right, accent }) {
  return (
    <section className={"rounded-xl border bg-white p-3.5 shadow-card " + (accent ? "border-brass/40 ring-1 ring-brass/10" : "border-hairline")}>
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className={"label " + (accent ? "text-brass" : "text-navy/55")}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

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
  const auth = useAuth();
  const storeKey = (auth?.user?.id || "local") + ":" + refreshKey;
  const lh = editor.letterhead;
  const saveTimer = useRef(null);

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

  if (vp.isMobile) {
    return (
      <>
        <MobileShell
          editor={editor} dispatch={dispatch}
          AiPanel={AiPanel} Inspector={Inspector}
          EditorLetterheads={EditorLetterheads} EditorPresets={EditorPresets}
          AuthBar={AuthBar} onAuthChange={() => setRefreshKey((k) => k + 1)}
          storeKey={storeKey}
          onPreview={preview} onDownload={download}
          onAddText={addText} onAddTable={addTable} onAddLine={addLine}
          onOpenStamp={() => setStampOpen(true)}
          onLoadTemplate={loadTemplate} templates={TEMPLATE_LIST}
          MarginControls={MarginControls} AccentInput={AccentInput}
        />
        {stampOpen && <StampStudio editor={editor} dispatch={dispatch} onClose={() => setStampOpen(false)} />}
      </>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-paper">
      <header className="glass flex items-center justify-between border-b border-hairline px-5 py-2.5">
        <div className="flex items-center gap-3">
          <Mark />
          <div>
            <h1 className="font-display text-[17px] font-extrabold leading-none tracking-tightest text-navy">Letterhead Studio</h1>
            <p className="mt-0.5 text-[11px] text-navy/45">Describe it, or drop blocks — on your own letterhead.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AuthBar onAuthChange={() => setRefreshKey((k) => k + 1)} />
          <span className="h-5 w-px bg-hairline" />
          <button onClick={preview} className="btn-ghost">Preview PDF</button>
          <button onClick={download} className="btn-primary">Download PDF</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ---- left: tools ---- */}
        <aside className="w-[300px] shrink-0 space-y-3 overflow-auto border-r border-hairline bg-white/40 p-3">
          <Panel title="✦ Write with AI" accent>
            <AiPanel editor={editor} dispatch={dispatch} />
          </Panel>

          <Panel title="Start from a template">
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_LIST.map((t) => (
                <button key={t.id} onClick={() => loadTemplate(t.id)} className="rounded border border-hairline px-2.5 py-1 text-xs text-navy hover:border-brass">{t.label}</button>
              ))}
            </div>
          </Panel>

          <Panel title="Add block">
            <div className="flex flex-wrap gap-2">
              <button onClick={addText} className="rounded border border-navy px-2.5 py-1 text-xs text-navy hover:bg-navy hover:text-paper">+ Text</button>
              <button onClick={addTable} className="rounded border border-navy px-2.5 py-1 text-xs text-navy hover:bg-navy hover:text-paper">+ Table</button>
              <button onClick={addLine} className="rounded border border-navy px-2.5 py-1 text-xs text-navy hover:bg-navy hover:text-paper">+ Line</button>
              <button onClick={() => setStampOpen(true)} className="rounded border border-brass bg-brass/10 px-2.5 py-1 text-xs text-navy hover:bg-brass hover:text-white">+ Sign / Stamp</button>
            </div>
          </Panel>

          <Panel title="Letterhead" right={
            <label className="flex items-center gap-1 text-[10px] text-navy/60">
              <input type="checkbox" checked={editor.showGuides} onChange={() => dispatch({ type: "TOGGLE_GUIDES" })} /> guides
            </label>
          }>
            <EditorLetterheads key={"lh:" + storeKey} editor={editor} dispatch={dispatch} />
            <div className="mt-3 space-y-2 border-t border-hairline pt-2">
              <Slider label="Header zone" value={lh.marginTop} min={10} max={120} onChange={(v) => setLh({ marginTop: v })} />
              <Slider label="Footer zone" value={lh.marginBottom} min={10} max={80} onChange={(v) => setLh({ marginBottom: v })} />
              <Slider label="Side" value={lh.marginSide} min={8} max={40} onChange={(v) => setLh({ marginSide: v })} />
              <label className="flex items-center gap-2 text-xs text-navy/60">
                <span className="w-16 font-semibold uppercase tracking-wide">Accent</span>
                <input type="color" value={lh.accent} onChange={(e) => setLh({ accent: e.target.value })} className="h-6 w-9 rounded border border-hairline" />
                <span className="tabular-nums">{lh.accent}</span>
              </label>
            </div>
          </Panel>

          <Panel title="Saved layouts">
            <EditorPresets key={"pr:" + storeKey} editor={editor} dispatch={dispatch} />
          </Panel>
        </aside>

        {/* ---- center: canvas ---- */}
        <div className="flex-1 overflow-auto p-8" style={{ background: "radial-gradient(1100px 600px at 50% -8%, rgba(169,133,63,0.08), transparent 60%), #e8e4dc" }}>
          <div className="mx-auto w-fit">
            <Canvas editor={editor} dispatch={dispatch} />
          </div>
        </div>

        {/* ---- right: inspector ---- */}
        <aside className="w-[280px] shrink-0 overflow-auto border-l border-hairline bg-white/40 p-3">
          <Panel title="Selected block">
            <Inspector editor={editor} dispatch={dispatch} />
          </Panel>
        </aside>
      </div>

      {stampOpen && <StampStudio editor={editor} dispatch={dispatch} onClose={() => setStampOpen(false)} />}
    </div>
  );
}

function Slider({ label, value, min, max, onChange }) {
  return (
    <label className="block text-xs text-navy/60">
      <span className="flex justify-between">
        <span className="font-semibold uppercase tracking-wide">{label}</span>
        <span className="tabular-nums text-navy">{value} mm</span>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-brass" />
    </label>
  );
}
