// HomePage.jsx — the launcher. Opening the app lands here: a grid of the
// business tools instead of dropping straight into the editor. Each card opens
// one focused workspace; a Home button in every workspace brings you back.
import { Mark } from "./Brand.jsx";

const TOOLS = [
  {
    key: "studio", title: "Letterhead Studio", tag: "Design",
    desc: "Place text, tables, stamps and AI-written content on your letterhead. Export a print-ready PDF.",
    icon: "📄", tint: "#11203A",
  },
  {
    key: "pdf", title: "Scan & Sign PDF", tag: "Documents",
    desc: "Photograph or open any document — straighten and enhance it like a scanner, then drop your signature or stamp.",
    icon: "🖊️", tint: "#0E7C66",
  },
  {
    key: "tracker", title: "Daily Invoice Tracker", tag: "Accounts",
    desc: "Log daily deliveries, raise per-day tax invoices and send one consolidated weekly statement.",
    icon: "📋", tint: "#A9853F",
  },
  {
    key: "vendors", title: "Vendor Statements", tag: "Accounts",
    desc: "Track what you owe suppliers, net payments against bills and issue a clean statement of account.",
    icon: "📒", tint: "#7A2E2E",
  },
  {
    key: "offer", title: "Employment Offer Letter", tag: "HR",
    desc: "Generate a UAE offer letter on your letterhead — salary table, leave terms, signature and stamp.",
    icon: "📝", tint: "#CC0066",
  },
];

export default function HomePage({ onOpen, AuthBar, onAuthChange, onSignup, userName }) {
  return (
    <div className="min-h-[100dvh] bg-[#e9ebef] text-navy">
      <header className="flex h-14 items-center justify-between border-b border-black/[0.06] bg-white/90 px-4 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <Mark />
          <h1 className="font-display text-[15px] font-extrabold tracking-tightest text-navy">Letterhead Studio</h1>
        </div>
        {AuthBar && <AuthBar onAuthChange={onAuthChange} onSignup={onSignup} />}
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <div className="mb-7 sm:mb-10">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
            {userName ? `Welcome back, ${userName.split(" ")[0]}.` : "Your document workspace."}
          </h2>
          <p className="mt-1.5 text-sm text-slate sm:text-base">Pick a tool to get started. Everything runs on your device.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <button
              key={t.key}
              onClick={() => onOpen(t.key)}
              className="group flex flex-col rounded-2xl bg-white p-5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.05] transition hover:-translate-y-0.5 hover:shadow-lift hover:ring-black/10"
            >
              <div className="mb-4 flex items-center justify-between">
                <span
                  className="grid h-12 w-12 place-items-center rounded-xl text-2xl"
                  style={{ background: t.tint + "14" }}
                >
                  {t.icon}
                </span>
                <span className="rounded-full bg-[#f0f1f4] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate/70">{t.tag}</span>
              </div>
              <h3 className="font-display text-lg font-bold text-navy">{t.title}</h3>
              <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-slate">{t.desc}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: t.tint }}>
                Open
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-0.5">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </button>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-slate/70">Letterhead Studio · invoices, statements, offer letters, scanning &amp; signing — all in one place.</p>
      </main>
    </div>
  );
}
