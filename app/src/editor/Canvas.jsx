// Canvas — the A4 page. Letterhead image as background, faint header/footer/side
// guides marking the safe middle zone, and every element on top.
// scale: CSS transform factor (1 = native ~567px wide). ElementBox uses the same
// factor so drag math stays 1:1 with finger/pointer movement.
import { A4, PXPM } from "./model.js";
import ElementBox from "./ElementBox.jsx";

export default function Canvas({ editor, dispatch, scale = 1 }) {
  const { letterhead, elements, selectedId, showGuides } = editor;
  const W = A4.wMm * PXPM;
  const H = A4.hMm * PXPM;
  const mt = letterhead.marginTop * PXPM;
  const mb = (A4.hMm - letterhead.marginBottom) * PXPM;
  const ms = letterhead.marginSide * PXPM;

  return (
    // wrapper reserves the SCALED footprint so scroll/layout match what user sees
    <div style={{ width: W * scale, height: H * scale }}>
      <div
        onPointerDown={(e) => {
          // ignore taps that come from inside an element/handle
          if (e.target === e.currentTarget) dispatch({ type: "SELECT", id: null });
        }}
        className="relative shadow-lg"
        style={{
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          background: letterhead.dataUrl ? `#fff url(${letterhead.dataUrl}) center/cover no-repeat` : "#fff",
          touchAction: "none", // we handle pointer ourselves; stops mobile pan-zoom from fighting us
        }}
      >
        {!letterhead.dataUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-navy/30">
            No letterhead — add one in the Letterhead panel
          </div>
        )}

        {showGuides && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 border-b border-dashed border-[#A9853F]/60 bg-[#A9853F]/5" style={{ height: mt }} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-dashed border-[#A9853F]/60 bg-[#A9853F]/5" style={{ top: mb }} />
            <div className="pointer-events-none absolute top-0 bottom-0 border-r border-dashed border-[#1A2456]/20" style={{ left: ms }} />
            <div className="pointer-events-none absolute top-0 bottom-0 border-l border-dashed border-[#1A2456]/20" style={{ right: ms }} />
          </>
        )}

        {elements.map((el) => (
          <ElementBox key={el.id} el={el} selected={el.id === selectedId} dispatch={dispatch} scale={scale} />
        ))}
      </div>
    </div>
  );
}
