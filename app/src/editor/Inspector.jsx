// Inspector — edit the selected element's properties.
export default function Inspector({ editor, dispatch }) {
  const el = editor.elements.find((e) => e.id === editor.selectedId);
  if (!el) return null;

  const set = (patch) => dispatch({ type: "UPDATE", id: el.id, patch });
  const numBtn = "rounded-lg bg-white px-2 py-1 text-sm text-navy ring-1 ring-black/[0.06] transition hover:bg-[#eef0f3]";

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold uppercase tracking-wide text-navy/70">
          {el.type === "rule" ? "Line" : "Text block"}
        </span>
        <div className="flex gap-1">
          <button className={numBtn} title="Bring forward" onClick={() => dispatch({ type: "RAISE", id: el.id })}>↑</button>
          <button className={numBtn} title="Send back" onClick={() => dispatch({ type: "LOWER", id: el.id })}>↓</button>
          <button className={numBtn} title="Duplicate" onClick={() => dispatch({ type: "DUPLICATE", id: el.id })}>⧉</button>
          <button className={numBtn + " text-red-700"} title="Delete" onClick={() => dispatch({ type: "REMOVE", id: el.id })}>✕</button>
        </div>
      </div>

      {el.type === "text" && (
        <>
          <div className="flex items-center gap-2">
            <span className="w-16 text-navy/60">Size</span>
            <button className={numBtn} onClick={() => set({ fontPt: Math.max(6, el.fontPt - 0.5) })}>−</button>
            <span className="w-10 text-center tabular-nums">{el.fontPt}</span>
            <button className={numBtn} onClick={() => set({ fontPt: Math.min(48, el.fontPt + 0.5) })}>+</button>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-16 text-navy/60">Style</span>
            <button className={numBtn + (el.bold ? " bg-navy text-paper" : "")} onClick={() => set({ bold: !el.bold })}><b>B</b></button>
            <button className={numBtn + (el.italic ? " bg-navy text-paper" : "")} onClick={() => set({ italic: !el.italic })}><i>I</i></button>
            <button className={numBtn + (el.underline ? " bg-navy text-paper" : "")} onClick={() => set({ underline: !el.underline })}><u>U</u></button>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-16 text-navy/60">Align</span>
            {["left", "center", "right"].map((a) => (
              <button key={a} className={numBtn + (el.align === a ? " bg-navy text-paper" : "")} onClick={() => set({ align: a })}>
                {a[0].toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="w-16 text-navy/60">Line</span>
            <button className={numBtn} onClick={() => set({ lineHeight: Math.max(1, +(el.lineHeight - 0.05).toFixed(2)) })}>−</button>
            <span className="w-10 text-center tabular-nums">{el.lineHeight.toFixed(2)}</span>
            <button className={numBtn} onClick={() => set({ lineHeight: Math.min(2.2, +(el.lineHeight + 0.05).toFixed(2)) })}>+</button>
          </div>
        </>
      )}

      {el.type === "rule" && (
        <div className="flex items-center gap-2">
          <span className="w-16 text-navy/60">Thick</span>
          <button className={numBtn} onClick={() => set({ thicknessMm: Math.max(0.1, +(el.thicknessMm - 0.1).toFixed(1)) })}>−</button>
          <span className="w-10 text-center tabular-nums">{el.thicknessMm.toFixed(1)}</span>
          <button className={numBtn} onClick={() => set({ thicknessMm: Math.min(3, +(el.thicknessMm + 0.1).toFixed(1)) })}>+</button>
        </div>
      )}

      {el.type === "table" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-16 text-navy/60">Size</span>
            <button className={numBtn} onClick={() => set({ fontPt: Math.max(6, el.fontPt - 0.5) })}>−</button>
            <span className="w-8 text-center tabular-nums">{el.fontPt}</span>
            <button className={numBtn} onClick={() => set({ fontPt: Math.min(16, el.fontPt + 0.5) })}>+</button>
            <span className="ml-2 text-navy/60">Header</span>
            <input type="color" value={el.accent} onChange={(e) => set({ accent: e.target.value })} className="h-6 w-8 rounded border border-hairline" />
          </div>

          <div className="space-y-1 border-t border-hairline pt-2">
            <p className="text-[10px] font-semibold uppercase text-navy/50">Columns</p>
            {el.columns.map((c, ci) => (
              <div key={ci} className="flex items-center gap-1">
                <input value={c.label} onChange={(e) => dispatch({ type: "TABLE", op: "label", id: el.id, c: ci, value: e.target.value })} className="flex-1 rounded border border-hairline px-1 py-0.5 text-xs" />
                <button className={numBtn + " w-6"} title="Align" onClick={() => dispatch({ type: "TABLE", op: "align", id: el.id, c: ci, value: c.align === "left" ? "center" : c.align === "center" ? "right" : "left" })}>{c.align[0].toUpperCase()}</button>
                <button className={numBtn + " w-6 text-red-700"} title="Delete column" onClick={() => dispatch({ type: "TABLE", op: "delCol", id: el.id, c: ci })}>✕</button>
              </div>
            ))}
            <button className={numBtn + " w-full"} onClick={() => dispatch({ type: "TABLE", op: "addCol", id: el.id })}>+ Column</button>
          </div>

          <div className="space-y-1 border-t border-hairline pt-2">
            <p className="text-[10px] font-semibold uppercase text-navy/50">Rows</p>
            {el.rows.map((row, ri) => (
              <div key={ri} className="flex items-start gap-1">
                <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${el.columns.length}, minmax(0,1fr))` }}>
                  {el.columns.map((_, ci) => (
                    <input key={ci} value={row[ci] ?? ""} onChange={(e) => dispatch({ type: "TABLE", op: "cell", id: el.id, r: ri, c: ci, value: e.target.value })} className="w-full rounded border border-hairline px-1 py-0.5 text-[11px]" />
                  ))}
                </div>
                <button className={numBtn + " w-6 text-red-700"} title="Delete row" onClick={() => dispatch({ type: "TABLE", op: "delRow", id: el.id, r: ri })}>✕</button>
              </div>
            ))}
            <button className={numBtn + " w-full"} onClick={() => dispatch({ type: "TABLE", op: "addRow", id: el.id })}>+ Row</button>
          </div>
        </div>
      )}

      {el.type !== "table" && (
        <div className="flex items-center gap-2">
          <span className="w-16 text-navy/60">Colour</span>
          <input type="color" value={el.color} onChange={(e) => set({ color: e.target.value })} className="h-7 w-10 rounded border border-hairline" />
          <span className="tabular-nums text-navy/60">{el.color}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 border-t border-hairline pt-2 text-xs text-navy/60">
        <label>X<input type="number" value={Math.round(el.xMm)} onChange={(e) => set({ xMm: Number(e.target.value) })} className="mt-0.5 w-full rounded border border-hairline px-1 py-0.5" /></label>
        <label>Y<input type="number" value={Math.round(el.yMm)} onChange={(e) => set({ yMm: Number(e.target.value) })} className="mt-0.5 w-full rounded border border-hairline px-1 py-0.5" /></label>
        <label>W<input type="number" value={Math.round(el.wMm)} onChange={(e) => set({ wMm: Number(e.target.value) })} className="mt-0.5 w-full rounded border border-hairline px-1 py-0.5" /></label>
      </div>
    </div>
  );
}
