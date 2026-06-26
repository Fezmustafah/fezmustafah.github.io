// TrackerPage — Daily Invoice Tracker. Self-contained tool that lives beside the
// letterhead studio (separate route via App's `mode` state). Holds all tracker
// state, persists to IndexedDB (tracker-* keys), and hosts the Daily / Weekly /
// Settings tabs. Shares nothing with the document generator.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadTracker, setOrders as persistOrders, clearOrders,
  saveSettings as persistSettings, setMeta as persistMeta,
  isCloudActive, subscribeTracker,
} from "./trackerStorage.js";
import { DEFAULT_SETTINGS } from "./constants.js";
import { listSignatures, listLetterheads } from "../../lib/storage.js";
import { todayIso, addDays, daysBetween, dateLong } from "./format.js";
import DailyTab from "./DailyTab.jsx";
import WeeklyTab from "./WeeklyTab.jsx";
import SettingsTab from "./SettingsTab.jsx";

const TABS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly Summary" },
  { id: "settings", label: "Settings" },
];

export default function TrackerPage({ onExit, storeKey }) {
  const [tab, setTab] = useState("daily");
  const [date, setDate] = useState(todayIso());
  const [orders, setOrders] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [meta, setMeta] = useState({});
  const [signatures, setSignatures] = useState([]);
  const [letterheads, setLetterheads] = useState([]);
  const [activeSigId, setActiveSigId] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const cloud = isCloudActive();
  const writing = useRef(false); // suppress self-triggered realtime reloads

  // load orders/settings/meta from the active backend (cloud merges in local).
  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoaded(false);
    const { orders, settings, meta } = await loadTracker();
    setOrders(orders);
    setSettings(settings);
    setMeta(meta);
    setLoaded(true);
  }, []);

  // (re)load on mount and whenever the signed-in account changes
  useEffect(() => { load(true); }, [storeKey, load]);

  // keep devices in step: refresh when the tab regains focus, on realtime
  // changes from another device, and on a gentle interval as a safety net.
  useEffect(() => {
    if (!cloud) return;
    const refresh = () => { if (!writing.current && document.visibilityState === "visible") load(false); };
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", refresh);
    const unsub = subscribeTracker(refresh);
    const poll = setInterval(refresh, 20000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", refresh);
      clearInterval(poll);
      unsub();
    };
  }, [cloud, storeKey, load]);

  async function refreshNow() {
    setSyncMsg("Refreshing…");
    await load(false);
    setSyncMsg("");
  }

  // signatures + letterheads (reload when auth/cloud changes — storeKey flips)
  useEffect(() => {
    listSignatures().then(setSignatures).catch(() => setSignatures([]));
    listLetterheads().then(setLetterheads).catch(() => setLetterheads([]));
  }, [storeKey]);

  const activeSig = useMemo(
    () => signatures.find((s) => s.id === activeSigId) || null,
    [signatures, activeSigId],
  );

  // resolved letterhead to print on, when the user chose that header style
  const activeLetterhead = useMemo(() => {
    if (settings.header?.style !== "letterhead") return null;
    return letterheads.find((l) => l.id === settings.header.letterheadId) || null;
  }, [settings.header, letterheads]);

  // every order, flattened + sorted chronologically with its per-day index
  const rows = useMemo(() => {
    return Object.keys(orders)
      .sort()
      .flatMap((d) => (orders[d] || []).map((order, index) => ({ date: d, index, order })));
  }, [orders]);

  const periodStart = meta.trackingStart || (rows[0]?.date ?? todayIso());
  const periodEnd = rows.length ? rows[rows.length - 1].date : periodStart;

  // weekly reminder: a full period (7 days) on from the tracking start.
  const reminder = useMemo(() => {
    if (!rows.length) return null;
    const due = addDays(periodStart, 7);
    const elapsed = daysBetween(periodStart, todayIso());
    return { due, elapsed, overdue: todayIso() >= due };
  }, [rows.length, periodStart]);

  // ---- mutations -----------------------------------------------------------
  async function commitOrders(next, nextMeta) {
    writing.current = true;
    setOrders(next);
    try {
      await persistOrders(next);
      if (nextMeta) {
        setMeta(nextMeta);
        await persistMeta(nextMeta);
      }
    } finally {
      // brief grace so our own realtime echo doesn't trigger a reload
      setTimeout(() => { writing.current = false; }, 1500);
    }
  }

  function addOrder(d, qty, location, chosenItem) {
    const it = chosenItem || settings.items[0] || { description: "", unitPrice: 0 };
    const unitPrice = Number(it.unitPrice) || 0;
    const order = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
      qty,
      location,
      item: it.description,
      unitPrice,
      amount: qty * unitPrice,
      createdAt: new Date().toISOString(),
    };
    const next = { ...orders, [d]: [...(orders[d] || []), order] };
    // anchor the tracking period to the earliest delivery on first entry
    const earliest = Object.keys(next).sort()[0];
    const nextMeta = meta.trackingStart ? null : { ...meta, trackingStart: earliest };
    commitOrders(next, nextMeta);
  }

  function removeOrder(d, id) {
    const dayList = (orders[d] || []).filter((o) => o.id !== id);
    const next = { ...orders };
    if (dayList.length) next[d] = dayList;
    else delete next[d];
    commitOrders(next);
  }

  function saveSettings(draft) {
    writing.current = true;
    setSettings(draft);
    Promise.resolve(persistSettings(draft)).finally(() => {
      setTimeout(() => { writing.current = false; }, 1500);
    });
  }

  async function clearWeek() {
    writing.current = true;
    try {
      await clearOrders();
      setOrders({});
      const nextMeta = { ...meta, trackingStart: todayIso() };
      setMeta(nextMeta);
      await persistMeta(nextMeta);
      setTab("daily");
    } finally {
      setTimeout(() => { writing.current = false; }, 1500);
    }
  }

  const dayOrders = orders[date] || [];

  if (!loaded) {
    return (
      <div className="grid h-screen place-items-center bg-tcream text-slate">Loading tracker…</div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#f3f1ec] text-tnavy">
      {/* header */}
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-tcreamDark bg-white px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="rounded-full bg-tcream px-3 py-1.5 text-sm font-semibold text-tnavy ring-1 ring-tcreamDark transition hover:bg-tcreamDark/40"
          >
            ← Studio
          </button>
          <div className="leading-none">
            <h1 className="text-[15px] font-extrabold tracking-tight text-tnavy">Daily Invoice Tracker</h1>
            <p className="mt-1 text-[11px] text-slate">Bait Al Madina · daily deliveries, weekly statement</p>
          </div>
        </div>
        <div className="hidden h-2 w-2 rounded-full bg-tgold sm:block" />
      </header>

      {/* tabs */}
      <div className="flex shrink-0 gap-1 border-b border-tcreamDark bg-white px-4">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={
              "relative px-4 py-3 text-sm font-semibold transition " +
              (tab === tb.id ? "text-tnavy" : "text-slate hover:text-tnavy")
            }
          >
            {tb.label}
            {tab === tb.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-tgold" />}
          </button>
        ))}
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          <SyncBar cloud={cloud} msg={syncMsg} onRefresh={refreshNow} />

          {reminder && (
            <ReminderBanner reminder={reminder} buyer={settings.buyer.name} onGo={() => setTab("weekly")} />
          )}

          {tab === "daily" && (
            <DailyTab
              date={date} setDate={setDate}
              dayOrders={dayOrders} settings={settings}
              onAdd={addOrder} onRemove={removeOrder}
              signatures={signatures} activeSig={activeSig} activeSigId={activeSigId} onPickSig={setActiveSigId}
              letterhead={activeLetterhead}
            />
          )}
          {tab === "weekly" && (
            <WeeklyTab
              rows={rows} settings={settings}
              periodStart={periodStart} periodEnd={periodEnd}
              onClearWeek={clearWeek}
              signatures={signatures} activeSig={activeSig} activeSigId={activeSigId} onPickSig={setActiveSigId}
              letterhead={activeLetterhead}
            />
          )}
          {tab === "settings" && (
            <SettingsTab settings={settings} onSave={saveSettings} letterheads={letterheads} />
          )}
        </div>
      </div>
    </div>
  );
}

function SyncBar({ cloud, msg, onRefresh }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-tcreamDark bg-white px-3 py-2 text-xs">
      <span className="flex items-center gap-1.5 font-semibold">
        {cloud ? (
          <span className="text-green-700">☁ Synced to your account · live on all your devices</span>
        ) : (
          <span className="text-slate">● Saved on this device only — sign in to sync across devices</span>
        )}
      </span>
      <div className="flex items-center gap-2">
        {msg && <span className="text-slate">{msg}</span>}
        {cloud && (
          <button onClick={onRefresh} className="rounded-md border border-tcreamDark px-2.5 py-1 font-semibold text-tnavy hover:bg-tcream">
            Refresh
          </button>
        )}
      </div>
    </div>
  );
}

function ReminderBanner({ reminder, buyer, onGo }) {
  if (reminder.overdue) {
    return (
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-tgold bg-tgold/15 px-4 py-3">
        <p className="text-sm font-semibold text-tnavy">
          📌 Week complete — time to send the Weekly Statement to {buyer}.
        </p>
        <button onClick={onGo} className="rounded-lg bg-tnavy px-4 py-2 text-sm font-semibold text-white hover:bg-tnavy/90">
          Go to Weekly
        </button>
      </div>
    );
  }
  const left = 7 - reminder.elapsed;
  return (
    <div className="mb-5 rounded-xl border border-tcreamDark bg-white px-4 py-2.5 text-sm text-slate">
      Day <b className="text-tnavy">{Math.min(reminder.elapsed + 1, 7)}</b> of 7 ·
      weekly statement due <b className="text-tnavy">{dateLong(reminder.due)}</b>
      {left > 0 ? ` (${left} day${left === 1 ? "" : "s"} left)` : ""}.
    </div>
  );
}
