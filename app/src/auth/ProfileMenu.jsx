// ProfileMenu — signed-in account control. Avatar button opens a dropdown with
// the user's name, email, tier, remaining AI credits, an upgrade path, cloud
// sync and sign-out. Tier comes from user_metadata.tier (set in Supabase for
// Pro users); everyone else is Free.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./AuthProvider.jsx";
import { getQuota } from "../lib/quota.js";
import { migrateLocalToCloud } from "../lib/storage.js";

const WHATSAPP = "971502925963"; // manual upgrade contact until billing is wired

function displayName(user) {
  const m = user?.user_metadata || {};
  return m.full_name || m.name || (user?.email ? user.email.split("@")[0] : "Account");
}
function avatarUrl(user) {
  const m = user?.user_metadata || {};
  return m.avatar_url || m.picture || "";
}
function initials(name) {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
export function userTier(user) {
  return (user?.user_metadata?.tier || "free").toLowerCase();
}

export default function ProfileMenu({ onAuthChange }) {
  const auth = useAuth();
  const user = auth.user;
  const [open, setOpen] = useState(false);
  const [quota, setQuota] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [syncing, setSyncing] = useState("idle");
  const ref = useRef(null);

  const tier = userTier(user);
  const isPro = tier === "pro";
  const name = displayName(user);
  const avatar = avatarUrl(user);

  useEffect(() => {
    getQuota().then(setQuota).catch(() => setQuota(null));
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function sync() {
    setSyncing("running");
    await migrateLocalToCloud();
    setSyncing("done");
    onAuthChange?.();
    setTimeout(() => setSyncing("idle"), 2500);
  }

  const freeLeft = quota?.free_left;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition hover:bg-black/[0.04]"
      >
        <Avatar avatar={avatar} name={name} />
        <span className="hidden text-sm font-semibold text-navy sm:inline">{name}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl bg-white shadow-lift ring-1 ring-black/[0.08]">
          <div className="flex items-center gap-3 bg-[#f6f7f9] p-4">
            <Avatar avatar={avatar} name={name} big />
            <div className="min-w-0">
              <div className="truncate font-display text-[15px] font-bold tracking-tightest text-navy">{name}</div>
              <div className="truncate text-xs text-slate">{user?.email}</div>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate/70">Plan</span>
              <span className={"rounded-full px-2.5 py-0.5 text-[11px] font-bold " + (isPro ? "bg-brass text-white" : "bg-[#eef0f3] text-navy")}>
                {isPro ? "PRO" : "FREE"}
              </span>
            </div>

            {!isPro && (
              <div>
                <div className="flex items-center justify-between text-xs text-slate">
                  <span>AI documents left</span>
                  <span className="font-semibold tabular-nums text-navy">{freeLeft == null ? "5" : freeLeft} / 5</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#eef0f3]">
                  <div className="h-full rounded-full bg-brass" style={{ width: `${((freeLeft == null ? 5 : freeLeft) / 5) * 100}%` }} />
                </div>
              </div>
            )}
            {isPro && <p className="text-xs text-slate">Unlimited AI documents · priority generation.</p>}

            {!isPro && (
              <button onClick={() => { setShowUpgrade(true); setOpen(false); }}
                className="btn-primary w-full justify-center bg-brass text-deep">
                ✦ Upgrade to Pro
              </button>
            )}

            <button onClick={sync}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f6f7f9] py-2 text-sm font-semibold text-navy ring-1 ring-black/[0.05] hover:bg-[#eef0f3]">
              {syncing === "running" ? "Syncing…" : syncing === "done" ? "Synced ✓" : "Sync this device → cloud"}
            </button>

            <button onClick={async () => { await auth.signOut(); onAuthChange?.(); setOpen(false); }}
              className="w-full rounded-xl py-2 text-sm font-semibold text-slate hover:bg-black/[0.04]">
              Sign out
            </button>
          </div>
        </div>
      )}

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} email={user?.email} />}
    </div>
  );
}

function Avatar({ avatar, name, big }) {
  const cls = big ? "h-11 w-11 text-sm" : "h-7 w-7 text-[11px]";
  if (avatar) return <img src={avatar} alt="" className={"rounded-full object-cover ring-1 ring-black/10 " + cls} />;
  return <span className={"grid place-items-center rounded-full bg-navy font-bold text-brass ring-1 ring-black/10 " + cls}>{initials(name)}</span>;
}

const PRO_PERKS = [
  "Unlimited AI documents",
  "Priority, faster generation",
  "All document types & templates",
  "Cloud sync across devices",
  "New features first",
];

function UpgradeModal({ onClose, email }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const waText = encodeURIComponent(`Hi — I'd like to upgrade Letterhead Studio to Pro. My account email: ${email || ""}`);
  const waHref = `https://wa.me/${WHATSAPP}?text=${waText}`;

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-navy/55 p-4 backdrop-blur-sm"
      style={{ animation: "lhFade .15s ease-out" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10"
        style={{ animation: "lhPop .2s cubic-bezier(.16,1,.3,1)" }}>
        <div className="bg-navy px-6 py-5 text-paper">
          <div className="flex items-center justify-between">
            <span className="label text-brass">Letterhead Studio</span>
            <button onClick={onClose} className="text-paper/60 hover:text-paper">✕</button>
          </div>
          <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tightest">Go Pro</h2>
          <p className="mt-1 text-sm text-paper/70">Unlimited documents on your own letterhead.</p>
        </div>
        <div className="p-6">
          <ul className="space-y-2.5">
            {PRO_PERKS.map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-sm text-navy">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brass/15 text-[11px] text-brass">✓</span>
                {p}
              </li>
            ))}
          </ul>
          <a href={waHref} target="_blank" rel="noopener noreferrer"
            className="btn-primary mt-6 w-full justify-center bg-brass text-deep">
            Upgrade via WhatsApp
          </a>
          <p className="mt-3 text-center text-[11px] text-slate">
            Upgrades are handled personally right now — message us and we'll switch your account to Pro.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
