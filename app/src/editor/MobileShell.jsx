// MobileShell — touch-first editor layout for phones (<880px).
// Canvas scaled to fit width. Bottom tab bar opens slide-up sheets containing
// the same panels the desktop sidebars host (AI, add, letterhead, inspector).
import { useEffect, useRef, useState } from "react";
import { A4, PXPM } from "./model.js";
import Canvas from "./Canvas.jsx";

export default function MobileShell({
  editor, dispatch,
  AiPanel, Inspector, EditorLetterheads, EditorPresets,
  storeKey,
  onPreview, onDownload, onClear, onAddText, onAddTable, onAddLine, onOpenStamp,
  onLoadTemplate, templates, MarginControls, AccentInput,
  AuthBar, onAuthChange, onSignup, onHelp, onHome, onSignMode, onScanMode, onTrackerMode, onVendorMode, onOfferMode,
}) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(0.5);
  const [sheet, setSheet] = useState(null); // null | 'ai' | 'add' | 'lh' | 'inspect' | 'menu'
  const [bottomPad, setBottomPad] = useState(72);

  // recompute scale to fit canvas width within available width (gutter 16px).
  // clamp because wrapRef may be 0 on first paint under StrictMode.
  useEffect(() => {
    function recalc() {
      const w = wrapRef.current?.clientWidth || window.innerWidth || 360;
      const target = Math.max(280, w - 16);
      const s = target / (A4.wMm * PXPM);
      setScale(Math.max(0.3, Math.min(0.95, s)));
    }
    recalc();
    // ResizeObserver catches the proper width once flex layout settles
    const ro = new ResizeObserver(recalc);
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", recalc);
    return () => { ro.disconnect(); window.removeEventListener("resize", recalc); };
  }, []);

  // auto-open Inspector sheet when an element is selected (handy on touch)
  useEffect(() => {
    if (editor.selectedId && !sheet) setSheet("inspect");
  }, [editor.selectedId]);

  function close() { setSheet(null); }

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-paper">
      {/* compact top bar */}
      <header className="flex items-center justify-between gap-2 border-b border-hairline bg-white/80 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <Mark />
          <span className="font-display text-sm font-bold text-navy">Letterhead Studio</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onSignMode} aria-label="Sign a PDF" title="Sign a PDF" className="tap grid h-9 w-9 place-items-center rounded-full border border-hairline text-navy/60">✒</button>
          <button onClick={onHelp} aria-label="How it works" className="tap grid h-9 w-9 place-items-center rounded-full border border-hairline text-navy/60">?</button>
          <button onClick={onDownload} className="tap rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-paper">Download</button>
        </div>
      </header>

      {/* canvas stage */}
      <div
        ref={wrapRef}
        style={{
          paddingBottom: bottomPad + 16,
          background: "radial-gradient(900px 500px at 50% -10%, rgba(169,133,63,0.08), transparent 60%), #e8e4dc",
        }}
        className="smooth-scroll flex-1 overflow-auto p-2"
      >
        <div className="mx-auto">
          <Canvas editor={editor} dispatch={dispatch} scale={scale} />
        </div>
      </div>

      {/* sheet */}
      {sheet && (
        <div className="fixed inset-0 z-40 flex items-end">
          <div className="absolute inset-0 bg-black/30" style={{ animation: "lhFade .2s ease-out" }} onClick={close} />
          <div
            className="smooth-scroll relative z-10 max-h-[80dvh] w-full overflow-auto rounded-t-2xl border-t border-hairline bg-white p-4 shadow-lift"
            style={{ animation: "lhSlideUp .32s cubic-bezier(.16,1,.3,1)" }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-hairline" />
            {sheet === "ai" && (
              <SheetHeader title="✦ Write with AI" onClose={close}><AiPanel editor={editor} dispatch={dispatch} /></SheetHeader>
            )}
            {sheet === "add" && (
              <SheetHeader title="Add" onClose={close}>
                <div className="grid grid-cols-2 gap-2">
                  <Big label="Text" onClick={() => { onAddText(); close(); }} />
                  <Big label="Table" onClick={() => { onAddTable(); close(); }} />
                  <Big label="Line" onClick={() => { onAddLine(); close(); }} />
                  <Big label="Sign / Stamp" onClick={() => { onOpenStamp(); close(); }} />
                </div>
                <div className="mt-5 border-t border-hairline pt-3">
                  <p className="label mb-2 text-navy/55">Start from a template</p>
                  <div className="flex flex-wrap gap-2">
                    {templates.map((t) => (
                      <button key={t.id} onClick={() => { onLoadTemplate(t.id); close(); }}
                        className="tap rounded-full border border-hairline px-3 py-1.5 text-xs text-navy">
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </SheetHeader>
            )}
            {sheet === "lh" && (
              <SheetHeader title="Letterhead" onClose={close}>
                <EditorLetterheads key={"m:lh:" + storeKey} editor={editor} dispatch={dispatch} />
                <div className="mt-4 space-y-3 border-t border-hairline pt-3">
                  <MarginControls />
                  <AccentInput />
                </div>
              </SheetHeader>
            )}
            {sheet === "inspect" && (
              <SheetHeader title="Selected block" onClose={close}><Inspector editor={editor} dispatch={dispatch} /></SheetHeader>
            )}
            {sheet === "menu" && (
              <SheetHeader title="Menu" onClose={close}>
                <div className="space-y-3">
                  <div className="rounded-lg border border-hairline p-3"><AuthBar onAuthChange={onAuthChange} onSignup={onSignup} /></div>
                  <button onClick={() => { onHome?.(); close(); }} className="tap w-full rounded-lg bg-[#f6f7f9] px-3 py-2 text-sm font-semibold text-navy ring-1 ring-black/[0.05]">🏠 All tools</button>
                  <button onClick={() => { onDownload(); close(); }} className="tap w-full rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-paper">Download PDF</button>
                  <button onClick={() => { onPreview(); close(); }} className="tap w-full rounded-lg border border-navy px-3 py-2 text-sm text-navy">Preview PDF</button>
                  <button onClick={() => { onOfferMode?.(); close(); }} className="tap w-full rounded-lg border border-brass bg-brass/[0.06] px-3 py-2 text-sm font-semibold text-navy">📝 Employment Offer Letter</button>
                  <button onClick={() => { onTrackerMode?.(); close(); }} className="tap w-full rounded-lg border border-brass bg-brass/[0.06] px-3 py-2 text-sm font-semibold text-navy">📋 Daily Invoice Tracker</button>
                  <button onClick={() => { onVendorMode?.(); close(); }} className="tap w-full rounded-lg border border-brass bg-brass/[0.06] px-3 py-2 text-sm font-semibold text-navy">📒 Vendor Statements</button>
                  <button onClick={() => { onScanMode?.(); close(); }} className="tap w-full rounded-lg border border-brass bg-brass/[0.06] px-3 py-2 text-sm font-semibold text-navy">📷 Scan &amp; Enhance</button>
                  <button onClick={() => { onSignMode?.(); close(); }} className="tap w-full rounded-lg border border-brass bg-brass/[0.06] px-3 py-2 text-sm font-semibold text-navy">✒ Sign an existing PDF</button>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => { onHelp?.(); close(); }} className="tap rounded-lg border border-hairline px-3 py-2 text-sm text-navy">How it works</button>
                    <button onClick={() => { onClear?.(); close(); }} className="tap rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">Clear page</button>
                  </div>
                  <div className="border-t border-hairline pt-3">
                    <p className="label mb-2 text-navy/55">Saved layouts</p>
                    <EditorPresets key={"m:pr:" + storeKey} editor={editor} dispatch={dispatch} />
                  </div>
                </div>
              </SheetHeader>
            )}
          </div>
        </div>
      )}

      {/* bottom tab bar — Canva-style with a raised center Add */}
      <nav
        ref={(el) => el && setBottomPad(el.offsetHeight)}
        className="fixed inset-x-0 bottom-0 z-30 flex items-end justify-around border-t border-hairline bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur"
      >
        <Tab label="AI" icon="✦" active={sheet === "ai"} onClick={() => setSheet(sheet === "ai" ? null : "ai")} />
        <Tab label="Paper" icon="📄" active={sheet === "lh"} onClick={() => setSheet(sheet === "lh" ? null : "lh")} />
        <button
          onClick={() => setSheet(sheet === "add" ? null : "add")}
          aria-label="Add"
          className={
            "tap -mt-6 grid h-14 w-14 shrink-0 place-items-center rounded-full text-2xl text-paper shadow-lift ring-4 ring-paper " +
            (sheet === "add" ? "rotate-45 bg-brass" : "bg-navy")
          }
          style={{ transition: "transform .25s cubic-bezier(.16,1,.3,1), background .2s" }}
        >
          +
        </button>
        <Tab label="Edit" icon="✎" disabled={!editor.selectedId} active={sheet === "inspect"} onClick={() => setSheet(sheet === "inspect" ? null : "inspect")} />
        <Tab label="Menu" icon="☰" active={sheet === "menu"} onClick={() => setSheet(sheet === "menu" ? null : "menu")} />
      </nav>
    </div>
  );
}

function Tab({ label, icon, active, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        "tap flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-semibold transition-colors " +
        (disabled ? "text-navy/25" : active ? "bg-navy text-paper" : "text-navy/70")
      }
    >
      <span className={"text-base transition-transform " + (active ? "scale-110" : "")}>{icon}</span>
      {label}
    </button>
  );
}

function SheetHeader({ title, onClose, children }) {
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-navy">{title}</h3>
        <button onClick={onClose} className="tap grid h-8 w-8 place-items-center rounded-full text-navy/50 hover:bg-black/[0.04]">✕</button>
      </div>
      {children}
    </>
  );
}

function Big({ label, onClick }) {
  return (
    <button onClick={onClick} className="tap rounded-xl border border-hairline px-3 py-3 text-sm font-semibold text-navy">
      {label}
    </button>
  );
}

function Mark() {
  return (
    <svg viewBox="0 0 64 64" className="h-7 w-7">
      <rect width="64" height="64" rx="14" fill="#11203A" />
      <rect x="18" y="13" width="28" height="38" rx="3" fill="#F4F1EA" />
      <rect x="18" y="13" width="28" height="8" rx="3" fill="#A9853F" />
      <rect x="23" y="28" width="18" height="2.6" rx="1.3" fill="#11203A" />
      <rect x="23" y="34" width="18" height="2.6" rx="1.3" fill="#11203A" />
      <rect x="23" y="40" width="11" height="2.6" rx="1.3" fill="#A9853F" />
    </svg>
  );
}
