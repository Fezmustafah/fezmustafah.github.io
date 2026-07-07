// SignaturePlacer.jsx — drag & resize the signature / stamp onto the letter.
// Renders the offer to an image (WITHOUT the assets baked in) and floats movable
// image boxes on top; positions are stored as page fractions {x,y,w} that the
// PDF builder reads back, so what you place is exactly what prints.
import { useEffect, useRef, useState } from "react";
import { buildOffer } from "./offerPdf.js";
import { renderPdf } from "../../lib/pdfSign.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// A single draggable + resizable asset over the page container.
function PlacedAsset({ asset, place, onChange, containerRef, color }) {
  const drag = useRef(null);

  const onPointerDown = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    drag.current = { mode, startX: e.clientX, startY: e.clientY, place: { ...place }, rect };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.rect.width;
    const dy = (e.clientY - d.startY) / d.rect.height;
    if (d.mode === "move") {
      onChange({ ...place, x: clamp(d.place.x + dx, 0, 1 - place.w), y: clamp(d.place.y + dy, 0, 0.98) });
    } else {
      onChange({ ...place, w: clamp(d.place.w + dx, 0.05, 0.8) });
    }
  };
  const onPointerUp = (e) => { drag.current = null; e.currentTarget.releasePointerCapture?.(e.pointerId); };

  return (
    <div
      onPointerDown={(e) => onPointerDown(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="group absolute cursor-move touch-none"
      style={{ left: `${place.x * 100}%`, top: `${place.y * 100}%`, width: `${place.w * 100}%` }}
    >
      <img src={asset.dataUrl} alt="" draggable={false} className="block w-full select-none" style={{ outline: `1.5px dashed ${color}`, outlineOffset: 2 }} />
      <span className="pointer-events-none absolute -top-5 left-0 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">{asset.name || "asset"} · drag</span>
      <div
        onPointerDown={(e) => onPointerDown(e, "resize")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white shadow"
        style={{ background: color }}
        title="resize"
      />
    </div>
  );
}

export default function SignaturePlacer({ o, ctx, onChange, onClose }) {
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(true);
  const containerRef = useRef(null);
  const snapshot = useRef(o); // freeze body content while placing

  // rasterise the letter once (assets excluded — the overlay shows them)
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const buf = buildOffer(snapshot.current, ctx, { drawAssets: false }).output("arraybuffer");
        const { pages } = await renderPdf(buf, 1.8);
        if (live) setImg(pages[0]?.dataUrl || null);
      } catch { /* leave blank */ }
      if (live) setBusy(false);
    })();
    return () => { live = false; };
  }, []);

  const sig = ctx.signature, stamp = ctx.stamp;
  const setSig = (p) => onChange({ sigPlace: p });
  const setStamp = (p) => onChange({ stampPlace: p });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 text-white">
        <div>
          <h2 className="text-sm font-bold">Place signature &amp; stamp</h2>
          <p className="text-[11px] text-white/70">Drag to move · drag the pink dot to resize. It prints exactly where you leave it.</p>
        </div>
        <button onClick={onClose} className="rounded-full bg-white px-4 py-2 text-sm font-bold text-navy transition hover:bg-white/90">Done</button>
      </div>

      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-6">
        <div ref={containerRef} className="relative w-full max-w-[620px] shadow-2xl" style={{ aspectRatio: "210 / 297", background: "#fff" }}>
          {img ? <img src={img} alt="letter" className="absolute inset-0 h-full w-full" /> : (
            <div className="absolute inset-0 grid place-items-center text-sm text-slate">{busy ? "Rendering letter…" : "Preview unavailable"}</div>
          )}
          {sig && <PlacedAsset asset={sig} place={o.sigPlace} onChange={setSig} containerRef={containerRef} color="#CC0066" />}
          {stamp && <PlacedAsset asset={stamp} place={o.stampPlace} onChange={setStamp} containerRef={containerRef} color="#1B6FB0" />}
        </div>
      </div>

      {!sig && !stamp && (
        <div className="bg-white px-5 py-3 text-center text-sm text-slate">Pick a signature or stamp first, then position it here.</div>
      )}
    </div>
  );
}
