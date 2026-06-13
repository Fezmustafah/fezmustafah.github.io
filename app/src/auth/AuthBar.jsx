// AuthBar — header control. Shows Sign in / account state, opens an auth modal,
// and offers a one-time "sync local → cloud" after first sign-in.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./AuthProvider.jsx";
import { migrateLocalToCloud } from "../lib/storage.js";

export default function AuthBar({ onAuthChange }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);

  if (!auth?.cloudEnabled) {
    return <span className="text-[11px] text-navy/40" title="Cloud not configured — saving on this device only">Local mode</span>;
  }

  if (auth.user) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-navy/60">{auth.user.email}</span>
        <SyncButton onDone={onAuthChange} />
        <button
          onClick={async () => { await auth.signOut(); onAuthChange?.(); }}
          className="rounded border border-hairline px-2 py-1 text-navy hover:border-brass"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded border border-navy px-3 py-1.5 text-sm text-navy hover:bg-navy hover:text-paper">
        Sign in
      </button>
      {open && <AuthModal onClose={() => setOpen(false)} onDone={() => { setOpen(false); onAuthChange?.(); }} />}
    </>
  );
}

function SyncButton({ onDone }) {
  const [state, setState] = useState("idle");
  async function run() {
    setState("running");
    const res = await migrateLocalToCloud();
    setState("done");
    onDone?.();
    setTimeout(() => setState("idle"), 2500);
    return res;
  }
  return (
    <button onClick={run} title="Copy letterheads & layouts saved on this device up to your account"
      className="rounded border border-hairline px-2 py-1 text-navy hover:border-brass">
      {state === "running" ? "Syncing…" : state === "done" ? "Synced ✓" : "Sync local → cloud"}
    </button>
  );
}

function AuthModal({ onClose, onDone }) {
  const auth = useAuth();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Escape to close + lock background scroll while open.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const fn = mode === "signin" ? auth.signIn : auth.signUp;
    const { data, error } = await fn(email.trim(), password);
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    if (mode === "signup" && !data.session) {
      setMsg("Check your email to confirm, then sign in.");
      return;
    }
    onDone?.();
  }

  // Rendered through a portal to <body> so the header's backdrop-filter
  // (which creates a containing block for position:fixed) can't clip/hide it.
  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-navy/50 p-4 backdrop-blur-sm"
      style={{ animation: "lhFade .15s ease-out" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "signin" ? "Sign in" : "Create account"}
        className="w-full max-w-md rounded-2xl border border-hairline bg-white p-6 shadow-2xl sm:p-7"
        style={{ animation: "lhPop .18s cubic-bezier(.16,1,.3,1)" }}
      >
        <div className="mb-1 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-brass" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" />
              </svg>
            </span>
            <div>
              <h2 className="font-wordmark text-xl leading-tight text-navy">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
              <p className="text-xs text-navy/50">{mode === "signin" ? "Sign in to sync across devices" : "Free — 5 AI documents to start"}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-full text-navy/40 hover:bg-navy/5 hover:text-navy">✕</button>
        </div>

        <button
          type="button"
          onClick={() => auth.signInWithGoogle()}
          className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-lg border border-hairline bg-white px-3 py-2.5 text-sm font-semibold text-navy transition hover:border-brass hover:bg-paper/40"
        >
          <svg viewBox="0 0 18 18" className="h-4 w-4"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.79 2.71v2.26h2.9c1.7-1.56 2.68-3.87 2.68-6.61z"/><path fill="#34A853" d="M9 18c2.43 0 4.46-.8 5.95-2.18l-2.9-2.26c-.8.54-1.83.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.9v2.33A9 9 0 009 18z"/><path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 013.68 9c0-.6.1-1.18.29-1.71V4.96H.9A9 9 0 000 9c0 1.45.35 2.83.96 4.04l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 00.9 4.96L3.97 7.3C4.68 5.18 6.66 3.58 9 3.58z"/></svg>
          Continue with Google
        </button>

        <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-wider text-navy/40">
          <span className="h-px flex-1 bg-hairline" /> or email <span className="h-px flex-1 bg-hairline" />
        </div>

        <form onSubmit={submit} className="space-y-2.5">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-navy/60">Email</span>
            <input type="email" required autoFocus placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-hairline px-3 py-2.5 text-sm outline-none focus:border-brass focus:ring-1 focus:ring-brass/30" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-navy/60">Password</span>
            <input type="password" required minLength={6} placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-hairline px-3 py-2.5 text-sm outline-none focus:border-brass focus:ring-1 focus:ring-brass/30" />
          </label>
          {msg && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{msg}</p>}
          <button type="submit" disabled={busy} className="mt-1 w-full rounded-lg bg-navy px-3 py-2.5 text-sm font-semibold text-paper transition hover:bg-navy/90 disabled:opacity-50">
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(""); }}
          className="mt-4 w-full text-center text-xs text-navy/60 hover:text-brass">
          {mode === "signin" ? "New here? Create a free account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>,
    document.body
  );
}
