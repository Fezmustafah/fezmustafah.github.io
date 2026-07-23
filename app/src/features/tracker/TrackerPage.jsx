// TrackerPage — Daily Invoice Tracker. Self-contained tool that lives beside the
// letterhead studio (separate route via App's `mode` state). Holds all tracker
// state, persists to IndexedDB (tracker-* keys), and hosts the Daily / Weekly /
// Settings tabs. Shares nothing with the document generator.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadTracker, setOrders as persistOrders, clearOrders,
  saveSettings as persistSettings, setMeta as persistMeta, setTrash as persistTrash,
  isCloudActive, subscribeTracker,
} from "./trackerStorage.js";
import { DEFAULT_SETTINGS } from "./constants.js";
import { listSignatures, listLetterheads } from "../../lib/storage.js";
import { todayIso, daysBetween, dateLong } from "./format.js";
import { isPeriodMode, periodRange, periodDue, periodLength, rangeLabel } from "./period.js";
import DailyTab from "./DailyTab.jsx";
import WeeklyTab from "./WeeklyTab.jsx";
import TrashTab from "./TrashTab.jsx";
import SettingsTab from "./SettingsTab.jsx";

const TRASH_CAP = 500; // keep the recycle bin bounded (it syncs to the cloud)

export default function TrackerPage({ onExit, storeKey }) {
  const [tab, setTab] = useState("daily");
  const [date, setDate] = useState(todayIso());
  const [orders, setOrders] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [meta, setMeta] = useState({});
  const [trash, setTrash] = useState([]);
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
    const { orders, settings, meta, trash } = await loadTracker();
    setOrders(orders);
    setSettings(settings);
    setMeta(meta);
    setTrash(trash || []);
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

  // anchor = the earliest of the tracking anchor and the first invoice date (so
  // back-dated entries pull it back). Weekly periods are measured from here.
  const anchor = [meta.trackingStart, rows[0]?.date].filter(Boolean).sort()[0] || todayIso();
  const firstDate = rows[0]?.date || todayIso();
  const lastDate = rows[rows.length - 1]?.date || todayIso();

  // Which billing cycle the statement follows: daily / weekly / monthly /
  // custom / all. Stored in meta so it syncs with the account.
  const mode = isPeriodMode(meta.periodMode) ? meta.periodMode : "weekly";

  // reminder: the statement for the CURRENT cycle is due the day after it ends.
  const reminder = useMemo(() => {
    if (!rows.length || mode === "custom" || mode === "all") return null;
    const range = periodRange(mode, todayIso(), { anchor, first: firstDate, last: lastDate });
    const due = periodDue(range);
    return {
      due,
      label: rangeLabel(range),
      day: daysBetween(range.start, todayIso()) + 1,
      length: periodLength(range),
      overdue: todayIso() >= due,
    };
  }, [rows.length, mode, anchor, firstDate, lastDate]);

  // ---- mutations -----------------------------------------------------------
  async function commitOrders(next, nextMeta, nextTrash) {
    writing.current = true;
    setOrders(next);
    try {
      await persistOrders(next);
      if (nextTrash) {
        setTrash(nextTrash);
        await persistTrash(nextTrash);
      }
      if (nextMeta) {
        setMeta(nextMeta);
        await persistMeta(nextMeta);
      }
    } finally {
      // brief grace so our own realtime echo doesn't trigger a reload
      setTimeout(() => { writing.current = false; }, 1500);
    }
  }

  async function commitMeta(nextMeta) {
    writing.current = true;
    setMeta(nextMeta);
    try { await persistMeta(nextMeta); }
    finally { setTimeout(() => { writing.current = false; }, 1500); }
  }

  async function commitTrash(nextTrash) {
    writing.current = true;
    setTrash(nextTrash);
    try { await persistTrash(nextTrash); }
    finally { setTimeout(() => { writing.current = false; }, 1500); }
  }

  // the chosen cycle (and, for a custom cycle, its dates) live in meta so they
  // survive a tab switch and follow the account.
  const setPeriodMode = (m, range) =>
    commitMeta({ ...meta, periodMode: m, ...(range ? { periodRange: range } : {}) });
  const setCustomRange = (range) => commitMeta({ ...meta, periodRange: range });

  // lines: [{ item, qty, unitPrice }] — one invoice can carry several items.
  function addOrder(d, location, lines) {
    const norm = lines.map((l) => {
      const qty = Number(l.qty) || 0;
      const unitPrice = Number(l.unitPrice) || 0;
      return { item: l.item, qty, unitPrice, amount: qty * unitPrice };
    });
    const order = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
      location,
      lines: norm,
      qty: norm.reduce((s, l) => s + l.qty, 0), // denormalised totals for the
      amount: norm.reduce((s, l) => s + l.amount, 0), // weekly table / summaries
      createdAt: new Date().toISOString(),
    };
    const next = { ...orders, [d]: [...(orders[d] || []), order] };
    // anchor the tracking period to the earliest delivery; pull it back if this
    // entry (or a back-dated one) predates the current anchor.
    const earliest = Object.keys(next).sort()[0];
    const nextMeta = !meta.trackingStart || earliest < meta.trackingStart
      ? { ...meta, trackingStart: earliest }
      : null;
    commitOrders(next, nextMeta);
  }

  // Edit an invoice after creation: rename location, change lines, or move it
  // to another date (re-filed under the new day, so its number follows).
  function updateOrder(oldDate, id, { date: newDate, location, lines }) {
    const src = orders[oldDate] || [];
    const existing = src.find((o) => o.id === id);
    if (!existing) return;
    const norm = lines.map((l) => {
      const qty = Number(l.qty) || 0;
      const unitPrice = Number(l.unitPrice) || 0;
      return { item: l.item, qty, unitPrice, amount: qty * unitPrice };
    });
    const updated = {
      ...existing,
      location,
      lines: norm,
      qty: norm.reduce((s, l) => s + l.qty, 0),
      amount: norm.reduce((s, l) => s + l.amount, 0),
    };
    const d = newDate || oldDate;
    const next = { ...orders };
    if (d === oldDate) {
      next[oldDate] = src.map((o) => (o.id === id ? updated : o));
    } else {
      const rest = src.filter((o) => o.id !== id);
      if (rest.length) next[oldDate] = rest;
      else delete next[oldDate];
      next[d] = [...(next[d] || []), updated];
    }
    const earliest = Object.keys(next).sort()[0];
    const nextMeta = earliest && (!meta.trackingStart || earliest < meta.trackingStart)
      ? { ...meta, trackingStart: earliest }
      : null;
    commitOrders(next, nextMeta);
  }

  // Deleting is a SOFT delete: the invoice moves to the recycle bin (Deleted
  // tab) so a mis-click or a cleared period can be undone. Purging from the bin
  // is the only hard delete.
  function removeOrder(d, id) {
    const gone = (orders[d] || []).find((o) => o.id === id);
    const dayList = (orders[d] || []).filter((o) => o.id !== id);
    const next = { ...orders };
    if (dayList.length) next[d] = dayList;
    else delete next[d];
    const nextTrash = gone
      ? [{ ...gone, date: d, deletedAt: new Date().toISOString() }, ...trash].slice(0, TRASH_CAP)
      : null;
    commitOrders(next, null, nextTrash);
  }

  // Put a binned invoice back on its original date (appended, so it takes the
  // next number for that day).
  function restoreOrder(entry) {
    const { date: d, deletedAt, ...order } = entry;
    const dayList = orders[d] || [];
    if (!dayList.some((o) => o.id === order.id)) {
      const next = { ...orders, [d]: [...dayList, order] };
      const earliest = Object.keys(next).sort()[0];
      const nextMeta = !meta.trackingStart || earliest < meta.trackingStart
        ? { ...meta, trackingStart: earliest }
        : null;
      commitOrders(next, nextMeta, dropFromTrash(entry));
      return;
    }
    commitTrash(dropFromTrash(entry)); // already back — just tidy the bin
  }

  const dropFromTrash = (entry) =>
    trash.filter((t) => !(t.id === entry.id && t.deletedAt === entry.deletedAt));

  const purgeOne = (entry) => commitTrash(dropFromTrash(entry));
  const emptyTrash = () => commitTrash([]);

  // Explicit, user-initiated recovery from this device's local snapshot ring.
  // (Load never merges — that resurrects deletions; see trackerStorage.js.)
  function restoreBackup(snap) {
    const have = new Set(Object.values(orders).flat().map((o) => o.id));
    const next = { ...orders };
    let added = 0;
    for (const [d, list] of Object.entries(snap.orders || {})) {
      for (const o of list || []) {
        if (have.has(o.id)) continue;
        next[d] = [...(next[d] || []), o];
        added += 1;
      }
    }
    if (!added) return 0;
    for (const d of Object.keys(next)) {
      next[d] = [...next[d]].sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    }
    const earliest = Object.keys(next).sort()[0];
    const nextMeta = !meta.trackingStart || earliest < meta.trackingStart
      ? { ...meta, trackingStart: earliest }
      : null;
    commitOrders(next, nextMeta);
    return added;
  }

  function saveSettings(draft) {
    writing.current = true;
    setSettings(draft);
    Promise.resolve(persistSettings(draft)).finally(() => {
      setTimeout(() => { writing.current = false; }, 1500);
    });
  }

  // Clear only the invoices inside the selected period; everything outside it
  // stays. Cleared invoices go to the recycle bin, not to the void.
  async function clearPeriod(range) {
    const kept = {};
    const removed = [];
    const now = new Date().toISOString();
    for (const [d, list] of Object.entries(orders)) {
      if (range && d >= range.start && d <= range.end) {
        for (const o of list || []) removed.push({ ...o, date: d, deletedAt: now });
      } else if (list && list.length) {
        kept[d] = list;
      }
    }
    if (!removed.length) return;
    const nextTrash = [...removed, ...trash].slice(0, TRASH_CAP);
    const remaining = Object.keys(kept).sort();
    const nextMeta = { ...meta, trackingStart: remaining[0] || todayIso() };

    writing.current = true;
    setOrders(kept);
    setTrash(nextTrash);
    setMeta(nextMeta);
    try {
      // no orders left at all -> drop the key entirely (as "clear week" did)
      if (remaining.length) await persistOrders(kept);
      else await clearOrders();
      await persistTrash(nextTrash);
      await persistMeta(nextMeta);
      if (!remaining.length) setTab("daily");
    } finally {
      setTimeout(() => { writing.current = false; }, 1500);
    }
  }

  const dayOrders = orders[date] || [];

  const TABS = [
    { id: "daily", label: "Daily" },
    { id: "weekly", label: "Statements" },
    { id: "trash", label: trash.length ? `Deleted (${trash.length})` : "Deleted" },
    { id: "settings", label: "Settings" },
  ];

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
            ← Home
          </button>
          <div className="leading-none">
            <h1 className="text-[15px] font-extrabold tracking-tight text-tnavy">Daily Invoice Tracker</h1>
            <p className="mt-1 text-[11px] text-slate">{settings.seller?.name ? `${settings.seller.name} · ` : ""}daily deliveries, weekly statement</p>
          </div>
        </div>
        <div className="hidden h-2 w-2 rounded-full bg-tgold sm:block" />
      </header>

      {/* tabs */}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-tcreamDark bg-white px-2 sm:px-4">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={
              "relative shrink-0 whitespace-nowrap px-3 py-3 text-sm font-semibold transition sm:px-4 " +
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
              onAdd={addOrder} onRemove={removeOrder} onUpdate={updateOrder}
              signatures={signatures} activeSig={activeSig} activeSigId={activeSigId} onPickSig={setActiveSigId}
              letterhead={activeLetterhead}
            />
          )}
          {tab === "weekly" && (
            <WeeklyTab
              rows={rows} settings={settings}
              mode={mode} onMode={setPeriodMode}
              savedRange={meta.periodRange} onCustomRange={setCustomRange}
              anchor={anchor} firstDate={firstDate} lastDate={lastDate}
              onClearPeriod={clearPeriod} onRemove={removeOrder} onUpdate={updateOrder}
              signatures={signatures} activeSig={activeSig} activeSigId={activeSigId} onPickSig={setActiveSigId}
              letterhead={activeLetterhead}
            />
          )}
          {tab === "trash" && (
            <TrashTab
              trash={trash} settings={settings}
              onRestore={restoreOrder} onPurge={purgeOne} onEmpty={emptyTrash}
              onRestoreBackup={restoreBackup}
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
          📌 Period {reminder.label} complete — time to send the statement to {buyer}.
        </p>
        <button onClick={onGo} className="rounded-lg bg-tnavy px-4 py-2 text-sm font-semibold text-white hover:bg-tnavy/90">
          Go to Statements
        </button>
      </div>
    );
  }
  const left = reminder.length - reminder.day + 1;
  return (
    <div className="mb-5 rounded-xl border border-tcreamDark bg-white px-4 py-2.5 text-sm text-slate">
      Day <b className="text-tnavy">{Math.min(Math.max(reminder.day, 1), reminder.length)}</b> of {reminder.length} ·
      statement due <b className="text-tnavy">{dateLong(reminder.due)}</b>
      {left > 0 ? ` (${left} day${left === 1 ? "" : "s"} left)` : ""}.
    </div>
  );
}
