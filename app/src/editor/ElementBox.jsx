// ElementBox — one placed element. Click to select, drag to move, double-click
// to edit text, right-edge handle to resize width. Floating bar: duplicate / delete.
import { useRef, useState, useEffect } from "react";
import { PXPM, PT_PER_MM } from "./model.js";

const pxFont = (pt) => (pt * PXPM) / PT_PER_MM;

export default function ElementBox({ el, selected, dispatch, scale = 1 }) {
  const [editing, setEditing] = useState(false);
  const drag = useRef(null);

  // leaving edit mode when another element is selected
  useEffect(() => {
    if (!selected && editing) setEditing(false);
  }, [selected, editing]);

  const left = el.xMm * PXPM;
  const top = el.yMm * PXPM;
  const width = el.wMm * PXPM;
  // pointer deltas are in CSS px (the *scaled* visual). Divide by (PXPM * scale)
  // so 1 finger-px of movement = 1 visual-px of movement regardless of zoom.
  const PXMM = PXPM * scale;

  function startDrag(e) {
    if (editing) return;
    e.stopPropagation();
    dispatch({ type: "SELECT", id: el.id });
    drag.current = { px: e.clientX, py: e.clientY, x0: el.xMm, y0: el.yMm };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (!drag.current) return;
    const dx = (e.clientX - drag.current.px) / PXMM;
    const dy = (e.clientY - drag.current.py) / PXMM;
    dispatch({ type: "MOVE", id: el.id, xMm: drag.current.x0 + dx, yMm: drag.current.y0 + dy });
  }
  function endDrag(e) {
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  }

  function startResize(e) {
    e.stopPropagation();
    const px = e.clientX;
    const w0 = el.wMm;
    const move = (ev) => {
      const w = Math.max(12, w0 + (ev.clientX - px) / PXMM);
      dispatch({ type: "UPDATE", id: el.id, patch: { wMm: w } });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const ring = selected ? "outline outline-2 outline-[#1A2456]" : "hover:outline hover:outline-1 hover:outline-[#A9853F]";

  // ---- rule element ----
  if (el.type === "rule") {
    return (
      <div
        onPointerDown={startDrag}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        className={"absolute cursor-move " + ring}
        style={{ left, top: top - 4, width, height: 8, display: "flex", alignItems: "center" }}
      >
        <div style={{ width: "100%", height: Math.max(1, el.thicknessMm * PXPM), background: el.color }} />
        {selected && <Bar dispatch={dispatch} id={el.id} />}
        {selected && <ResizeHandle onPointerDown={startResize} />}
      </div>
    );
  }

  // ---- table element (pricing / breakdown) ----
  if (el.type === "table") {
    const flex = el.colFlex || el.columns.map((_, i) => (i === 0 ? 3 : i === el.columns.length - 1 ? 1.6 : 1));
    const sum = flex.reduce((a, b) => a + b, 0);
    const widths = flex.map((f) => (f / sum) * 100 + "%");
    const fz = pxFont(el.fontPt);
    return (
      <div
        onPointerDown={startDrag}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        className={"absolute cursor-move " + ring}
        style={{ left, top, width }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontFamily: "Helvetica, Arial, sans-serif", fontSize: fz }}>
          <thead>
            <tr>
              {el.columns.map((c, i) => (
                <th key={i} style={{ width: widths[i], background: el.accent, color: "#fff", textAlign: c.align, padding: "2px 4px", border: "0.5px solid #b4b4b4", fontWeight: 700 }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {el.rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 ? "#f1f0ec" : "#fff" }}>
                {el.columns.map((c, ci) => (
                  <td key={ci} style={{ textAlign: c.align, padding: "2px 4px", border: "0.5px solid #cfcfcf", color: "#222", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {selected && <Bar dispatch={dispatch} id={el.id} />}
        {selected && <ResizeHandle onPointerDown={startResize} />}
      </div>
    );
  }

  // ---- image element (signature / stamp) ----
  if (el.type === "image") {
    const h = el.wMm * el.aspect * PXPM;
    return (
      <div
        onPointerDown={startDrag}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        className={"absolute cursor-move " + ring}
        style={{ left, top, width, height: h }}
      >
        <img src={el.dataUrl} alt={el.label} draggable={false} style={{ width: "100%", height: "100%", pointerEvents: "none" }} />
        {selected && <Bar dispatch={dispatch} id={el.id} />}
        {selected && <ResizeHandle onPointerDown={startResize} />}
      </div>
    );
  }

  // ---- text element ----
  const textStyle = {
    fontSize: pxFont(el.fontPt),
    fontWeight: el.bold ? 700 : 400,
    fontStyle: el.italic ? "italic" : "normal",
    textDecoration: el.underline ? "underline" : "none",
    textAlign: el.align,
    color: el.color,
    lineHeight: el.lineHeight,
    fontFamily: "Helvetica, Arial, sans-serif",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };

  return (
    <div
      onPointerDown={startDrag}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
      className={"absolute " + (editing ? "cursor-text" : "cursor-move ") + ring}
      style={{ left, top, width }}
    >
      {editing ? (
        <textarea
          autoFocus
          value={el.text}
          onChange={(e) => dispatch({ type: "UPDATE", id: el.id, patch: { text: e.target.value } })}
          onBlur={() => setEditing(false)}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full resize-none border-0 bg-white/70 p-0 outline-none"
          style={{ ...textStyle, minHeight: pxFont(el.fontPt) * el.lineHeight }}
          rows={Math.max(1, (el.text.match(/\n/g) || []).length + 1)}
        />
      ) : (
        <div style={textStyle}>{el.text || " "}</div>
      )}
      {selected && !editing && <Bar dispatch={dispatch} id={el.id} />}
      {selected && !editing && <ResizeHandle onPointerDown={startResize} />}
    </div>
  );
}

function Bar({ dispatch, id }) {
  const btn = "rounded bg-[#11203A] px-1.5 py-0.5 text-[10px] leading-none text-white hover:bg-[#1A2456]";
  return (
    <div
      className="absolute -top-6 left-0 flex gap-1"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button className={btn} title="Edit (or double-click)"
        onClick={() => dispatch({ type: "SELECT", id })}>edit</button>
      <button className={btn} title="Duplicate"
        onClick={() => dispatch({ type: "DUPLICATE", id })}>dup</button>
      <button className={btn + " !bg-red-700 hover:!bg-red-800"} title="Delete"
        onClick={() => dispatch({ type: "REMOVE", id })}>del</button>
    </div>
  );
}

function ResizeHandle({ onPointerDown }) {
  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute -right-1 top-1/2 h-3 w-3 -translate-y-1/2 cursor-ew-resize rounded-full border border-white bg-[#1A2456]"
      title="Resize width"
    />
  );
}
