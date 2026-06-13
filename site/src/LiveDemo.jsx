// Interactive "edit a letterhead" demo for the homepage.
// Click a document type -> the brief types itself -> AI lays blocks onto the
// letterhead -> the signature draws. The signature/stamp block is really
// draggable, to prove "every block moves." Pure front-end, no API calls.
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { gsap } from "gsap";
import { Sparkles, Mic, GripVertical, ArrowUpRight, RotateCcw, Play } from "lucide-react";
import { APP_URL } from "./Layout.jsx";

const PRESETS = {
  quotation: {
    chip: "Quotation",
    brief: "Quotation for 2,500 meal boxes at AED 10.75, valid 30 days.",
    title: "QUOTATION",
    meta: "Ref QTN/2026-014",
    date: "14 Jun 2026",
    intro: "Thank you for your enquiry. We are pleased to quote the following, valid for 30 days from the date above.",
    table: {
      head: ["Description", "Qty", "Rate", "Amount"],
      rows: [["Premium meal box", "2,500", "10.75", "26,875.00"]],
      totalLabel: "Total",
      total: "AED 26,875.00",
    },
    note: "Twenty-Six Thousand Eight Hundred Seventy-Five Dirhams Only.",
  },
  invoice: {
    chip: "Tax Invoice",
    brief: "Tax invoice, 40 hours consulting at AED 350, add 5% VAT.",
    title: "TAX INVOICE",
    meta: "Inv INV/2026-208 · TRN 100xxxxxxxxxxx3",
    date: "14 Jun 2026",
    intro: "Invoice for professional services rendered for the period ending 14 Jun 2026.",
    table: {
      head: ["Description", "Qty", "Rate", "Amount"],
      rows: [
        ["Advisory & consulting", "40", "350.00", "14,000.00"],
        ["VAT @ 5%", "", "", "700.00"],
      ],
      totalLabel: "Total incl. VAT",
      total: "AED 14,700.00",
    },
    note: "Fourteen Thousand Seven Hundred Dirhams Only.",
  },
  salary: {
    chip: "Salary Certificate",
    brief: "Salary certificate for Imran Khan, Operations Manager, AED 12,000/month.",
    title: "TO WHOM IT MAY CONCERN",
    meta: "Ref HR/2026-061",
    date: "14 Jun 2026",
    intro:
      "This is to certify that Mr. Imran Khan is employed with our company as Operations Manager since 03 March 2023.",
    body:
      "His current gross salary is AED 12,000 (Twelve Thousand Dirhams) per month. This certificate is issued upon his request and does not carry any liability on the company.",
    note: null,
  },
};

const ORDER = ["quotation", "invoice", "salary"];

function Caret() {
  return <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-brass align-middle" />;
}

export default function LiveDemo() {
  const [idx, setIdx] = useState(0);
  const [locked, setLocked] = useState(false); // user clicked a doc -> stop the loop
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState("idle"); // typing | writing | done
  const [sig, setSig] = useState({ x: 0, y: 0 });
  const bodyRef = useRef(null);
  const sigRef = useRef(null);
  const pathRef = useRef(null);
  const dragState = useRef(null);
  const timers = useRef([]);
  const advTimer = useRef(null);

  const active = ORDER[idx];
  const preset = PRESETS[active];

  const clearTimers = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };

  // Run the full type -> write -> draw sequence whenever the active doc changes.
  const run = useCallback((key) => {
    clearTimers();
    const p = PRESETS[key];
    setTyped("");
    setPhase("typing");
    setSig({ x: 0, y: 0 });

    const text = p.brief;
    let i = 0;
    const tick = () => {
      i += 1;
      setTyped(text.slice(0, i));
      if (i < text.length) {
        timers.current.push(setTimeout(tick, 18 + Math.random() * 26));
      } else {
        timers.current.push(setTimeout(() => setPhase("writing"), 280));
        timers.current.push(setTimeout(() => setPhase("done"), 700));
      }
    };
    timers.current.push(setTimeout(tick, 250));
  }, []);

  useEffect(() => {
    run(active);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // Auto-advance to the next document a few seconds after one finishes, so the
  // section plays forever on a loop — unless the user has locked onto one.
  useEffect(() => {
    if (advTimer.current) clearTimeout(advTimer.current);
    if (phase === "done" && !locked) {
      advTimer.current = setTimeout(() => setIdx((i) => (i + 1) % ORDER.length), 3600);
    }
    return () => advTimer.current && clearTimeout(advTimer.current);
  }, [phase, locked]);

  // Pick a document by hand -> lock the loop on it (replay if it's the same one).
  const pick = (key) => {
    const i = ORDER.indexOf(key);
    setLocked(true);
    if (i === idx) run(key);
    else setIdx(i);
  };
  const resumeAuto = () => {
    setLocked(false);
    setIdx((i) => (i + 1) % ORDER.length);
  };

  // Reveal blocks + draw signature when the document is written.
  useLayoutEffect(() => {
    if (phase !== "done" || !bodyRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".demo-block",
        { y: 14, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: "power3.out", stagger: 0.09 }
      );
      const path = pathRef.current;
      if (path) {
        const len = path.getTotalLength();
        path.style.strokeDasharray = len;
        path.style.strokeDashoffset = len;
        gsap.to(path, { strokeDashoffset: 0, duration: 1.3, ease: "power2.inOut", delay: 0.55 });
      }
    }, bodyRef);
    return () => ctx.revert();
  }, [phase, active]);

  // Real pointer drag for the signature block, clamped to the page.
  const onSigDown = (e) => {
    e.preventDefault();
    const ev = e.touches ? e.touches[0] : e;
    dragState.current = { sx: ev.clientX, sy: ev.clientY, ox: sig.x, oy: sig.y };
    window.addEventListener("pointermove", onSigMove);
    window.addEventListener("pointerup", onSigUp);
  };
  const onSigMove = (e) => {
    const d = dragState.current;
    if (!d) return;
    const nx = d.ox + (e.clientX - d.sx);
    const ny = d.oy + (e.clientY - d.sy);
    setSig({ x: Math.max(-150, Math.min(20, nx)), y: Math.max(-90, Math.min(20, ny)) });
  };
  const onSigUp = () => {
    dragState.current = null;
    window.removeEventListener("pointermove", onSigMove);
    window.removeEventListener("pointerup", onSigUp);
  };

  return (
    <section id="proof" className="px-5 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="label mb-3 flex items-center gap-2 text-brass">
          <span className="h-px w-8 bg-brass" /> See it work
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="display max-w-2xl text-4xl font-bold text-ink sm:text-5xl">
            Watch a document write itself <span className="flourish font-normal text-brass">onto your letterhead.</span>
          </h2>
          <p className="max-w-sm text-[15px] leading-relaxed text-ink/60">
            The real studio in miniature, playing on a loop. Click any document to take over — then drag the
            signature anywhere. Nothing here is a video.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
          {/* control rail */}
          <div className="rounded-3xl border border-hairline bg-white p-6 shadow-card">
            <div className="flex items-center justify-between">
              <div className="label text-ink/45">1 · Pick a document</div>
              {locked ? (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink/45">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink/30" /> Paused on your pick
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-brass">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brass" /> Auto-playing
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {ORDER.map((k) => (
                <button
                  key={k}
                  onClick={() => pick(k)}
                  className={
                    "rounded-full border px-3.5 py-1.5 text-sm font-medium transition " +
                    (active === k
                      ? "border-ink bg-ink text-paper"
                      : "border-hairline bg-paper/50 text-ink/70 hover:border-brass/50")
                  }
                >
                  {PRESETS[k].chip}
                </button>
              ))}
            </div>

            <div className="label mt-7 text-ink/45">2 · Describe it</div>
            <div className="mt-3 rounded-2xl border border-hairline bg-paper/40 p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-brass">
                <Sparkles size={13} /> WRITE WITH AI
                <Mic size={13} className="ml-auto text-ink/40" />
              </div>
              <div className="mt-2 min-h-[3.5rem] font-mono text-[13px] leading-relaxed text-ink/80">
                {typed}
                {phase === "typing" && <Caret />}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-[13px] text-ink/55">
              {phase === "writing" ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brass border-t-transparent" />
                  Writing the document…
                </>
              ) : phase === "done" ? (
                <>
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-green-600 text-[9px] text-white">✓</span>
                  Ready — print or keep editing.
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-brass/60" />
                  Reading your brief…
                </>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a href={APP_URL} className="btn-primary text-sm">
                Build mine free <ArrowUpRight size={16} />
              </a>
              {locked ? (
                <button onClick={resumeAuto} className="btn-ghost text-sm">
                  <Play size={14} /> Resume auto-play
                </button>
              ) : (
                <button onClick={() => run(active)} className="btn-ghost text-sm">
                  <RotateCcw size={15} /> Replay
                </button>
              )}
            </div>
            <p className="mt-4 text-xs text-ink/40">
              Tip: in the real studio you upload your own letterhead — the AI keeps its margins automatically.
            </p>
          </div>

          {/* the letterhead canvas */}
          <div className="relative flex justify-center rounded-3xl border border-hairline bg-[repeating-linear-gradient(45deg,#f3efe6,#f3efe6_12px,#f1ece1_12px,#f1ece1_24px)] p-6 shadow-card sm:p-10">
            <div className="relative w-full max-w-[440px] overflow-hidden rounded-[14px] bg-white shadow-lift ring-1 ring-ink/5">
              {/* letterhead header */}
              <div className="bg-ink px-7 py-5">
                <div className="font-serif text-xl font-semibold tracking-wide text-paper">MERIDIAN TRADING L.L.C</div>
                <div className="text-[10px] tracking-wide text-paper/70">General Trading &amp; Contracting · Dubai, U.A.E</div>
              </div>
              <div className="h-1 bg-brass" />

              {/* body / safe zone */}
              <div ref={bodyRef} className="relative min-h-[430px] px-7 py-6">
                {phase !== "done" ? (
                  <div className="space-y-3 pt-6">
                    {[92, 80, 64, 70, 50].map((w, i) => (
                      <div
                        key={i}
                        className="h-3 animate-pulse rounded bg-hairline/70"
                        style={{ width: `${w}%`, animationDelay: `${i * 90}ms` }}
                      />
                    ))}
                    <div className="mt-6 h-24 w-full animate-pulse rounded bg-hairline/50" />
                  </div>
                ) : (
                  <>
                    <div className="demo-block flex items-start justify-between">
                      <div>
                        <div className="font-display text-[17px] font-extrabold tracking-tight text-ink">{preset.title}</div>
                        <div className="mt-0.5 text-[10px] text-slate">{preset.meta}</div>
                      </div>
                      <div className="rounded border border-hairline px-2 py-1 text-[10px] text-ink">{preset.date}</div>
                    </div>

                    <p className="demo-block mt-4 text-[11px] leading-relaxed text-ink/75">{preset.intro}</p>

                    {preset.body && (
                      <p className="demo-block mt-3 text-[11px] leading-relaxed text-ink/75">{preset.body}</p>
                    )}

                    {preset.table && (
                      <div className="demo-block mt-4 overflow-hidden rounded-md ring-1 ring-hairline">
                        <div className="grid grid-cols-[1fr_auto_auto_auto] bg-ink text-[9px] font-semibold text-paper">
                          {preset.table.head.map((h, i) => (
                            <div key={i} className={"px-2 py-1.5 " + (i ? "text-right" : "")}>{h}</div>
                          ))}
                        </div>
                        {preset.table.rows.map((r, ri) => (
                          <div
                            key={ri}
                            className={"grid grid-cols-[1fr_auto_auto_auto] text-[9px] text-ink " + (ri % 2 ? "bg-paper/60" : "bg-white")}
                          >
                            {r.map((c, ci) => (
                              <div key={ci} className={"px-2 py-1.5 " + (ci ? "text-right tabular-nums" : "")}>{c}</div>
                            ))}
                          </div>
                        ))}
                        <div className="grid grid-cols-[1fr_auto] bg-ink/[0.04] text-[9px] font-bold text-ink">
                          <div className="px-2 py-1.5 text-right">{preset.table.totalLabel}</div>
                          <div className="px-2 py-1.5 text-right tabular-nums">{preset.table.total}</div>
                        </div>
                      </div>
                    )}

                    {preset.note && (
                      <div className="demo-block mt-3 text-[9px] italic text-slate">{preset.note}</div>
                    )}

                    {/* draggable signature / stamp */}
                    <div
                      ref={sigRef}
                      onPointerDown={onSigDown}
                      style={{ transform: `translate(${sig.x}px, ${sig.y}px)` }}
                      className="group absolute bottom-6 right-7 cursor-grab touch-none select-none rounded-md p-1 transition hover:ring-1 hover:ring-brass/50 active:cursor-grabbing"
                    >
                      <div className="pointer-events-none absolute -left-5 top-1/2 -translate-y-1/2 text-ink/25 opacity-0 transition group-hover:opacity-100">
                        <GripVertical size={14} />
                      </div>
                      <div className="text-right">
                        <svg viewBox="0 0 120 40" className="ml-auto h-9 w-28">
                          <path
                            ref={pathRef}
                            d="M6 28 C 18 6, 26 38, 38 18 S 58 4, 70 24 C 78 36, 88 8, 100 20 L 114 14"
                            fill="none"
                            stroke="#11203A"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="border-t border-ink/30 pt-1 text-[10px] font-semibold text-ink">A. Rahman</div>
                        <div className="text-[8px] text-slate">Authorised Signatory</div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* letterhead footer */}
              <div className="border-t border-hairline px-7 py-2.5 text-center text-[8px] tracking-wide text-slate">
                P.O. Box 00000, Dubai · +971 4 000 0000 · accounts@meridian.ae · meridian.ae
              </div>
            </div>

            {phase === "done" && (
              <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-ink/85 px-3 py-1.5 text-[11px] font-medium text-paper backdrop-blur">
                ↕ Drag the signature — every block moves
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
