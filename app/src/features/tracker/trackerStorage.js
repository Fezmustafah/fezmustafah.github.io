// trackerStorage.js — persistence for the Daily Invoice Tracker.
//
// Model: when signed in (and cloud configured) Supabase is the source of truth
// (table `tracker_data`, per-user RLS) so data follows the account across
// devices. Local idb-keyval is a cache / offline buffer. Loading MERGES local
// buffered writes into the cloud copy (union by date + order id) so nothing is
// ever lost or clobbered — this is what fixes the "upload wiped my entries"
// bug. When signed out it's purely local.
import { get, set, del } from "idb-keyval";
import { getUserId } from "../../lib/authState.js";
import { cloudEnabled, supabase } from "../../lib/supabase.js";
import { DEFAULT_SETTINGS, DEFAULT_VAT_RATE } from "./constants.js";

const ORDERS_KEY = "tracker-orders"; // { [isoDate]: Order[] }
const SETTINGS_KEY = "tracker-settings"; // { seller, buyer, items, vatRate, header }
const META_KEY = "tracker-meta"; // { trackingStart: isoDate }

const useCloud = () => cloudEnabled && !!getUserId();

export function isCloudActive() {
  return useCloud();
}

// ---- Supabase key/value helpers ------------------------------------------
async function cloudGet(key) {
  const { data, error } = await supabase
    .from("tracker_data")
    .select("value")
    .eq("user_id", getUserId())
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data ? data.value : undefined;
}

async function cloudSet(key, value) {
  const { error } = await supabase
    .from("tracker_data")
    .upsert({ user_id: getUserId(), key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
  if (error) throw error;
}

async function cloudDel(key) {
  const { error } = await supabase.from("tracker_data").delete().eq("user_id", getUserId()).eq("key", key);
  if (error) throw error;
}

// union two orders maps without dropping anything (cloud + local-buffered)
function mergeOrders(a = {}, b = {}) {
  const out = {};
  for (const date of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const seen = new Set();
    const list = [];
    for (const o of [...(a?.[date] || []), ...(b?.[date] || [])]) {
      if (o && !seen.has(o.id)) { seen.add(o.id); list.push(o); }
    }
    if (list.length) out[date] = list;
  }
  return out;
}

// fill defaults + migrate the old single-`item` shape -> items[] + vatRate
function normalizeSettings(saved) {
  const s = saved || {};
  const items = Array.isArray(s.items) && s.items.length
    ? s.items.map((it) => ({ description: String(it.description || ""), unitPrice: Number(it.unitPrice) || 0 }))
    : s.item
      ? [{ description: s.item.description, unitPrice: Number(s.item.unitPrice) || 0 }]
      : DEFAULT_SETTINGS.items.map((x) => ({ ...x }));
  const vatRate = s.vatRate != null ? Number(s.vatRate) : s.item?.vatRate != null ? Number(s.item.vatRate) : DEFAULT_VAT_RATE;
  return {
    seller: { ...DEFAULT_SETTINGS.seller, ...(s.seller || {}) },
    buyer: { ...DEFAULT_SETTINGS.buyer, ...(s.buyer || {}) },
    items,
    vatRate,
    header: { ...DEFAULT_SETTINGS.header, ...(s.header || {}) },
  };
}

// ---- load (cloud-authoritative with safe merge) ---------------------------
export async function loadTracker() {
  const localOrders = (await get(ORDERS_KEY)) || {};
  const localSettings = (await get(SETTINGS_KEY)) || null;
  const localMeta = (await get(META_KEY)) || null;

  if (useCloud()) {
    try {
      const [co, cs, cm] = await Promise.all([cloudGet(ORDERS_KEY), cloudGet(SETTINGS_KEY), cloudGet(META_KEY)]);

      // orders: merge cloud with any offline-buffered local writes (no loss)
      const orders = mergeOrders(co || {}, localOrders);
      if (JSON.stringify(orders) !== JSON.stringify(co || {})) {
        try { await cloudSet(ORDERS_KEY, orders); } catch { /* keep going */ }
      }

      // settings / meta: cloud wins when present; otherwise seed from local
      let settings = cs;
      if (settings == null && localSettings) { settings = localSettings; try { await cloudSet(SETTINGS_KEY, settings); } catch {} }
      let meta = cm;
      if (meta == null && localMeta) { meta = localMeta; try { await cloudSet(META_KEY, meta); } catch {} }

      // refresh the local cache to match
      await set(ORDERS_KEY, orders);
      if (settings) await set(SETTINGS_KEY, settings);
      if (meta) await set(META_KEY, meta);

      return { orders, settings: normalizeSettings(settings), meta: meta || {} };
    } catch (e) {
      console.warn("[tracker] cloud load failed, using local:", e.message);
    }
  }
  return { orders: localOrders, settings: normalizeSettings(localSettings), meta: localMeta || {} };
}

// ---- writes (cloud + local mirror; local buffer on cloud failure) ---------
async function writeKey(key, value) {
  if (useCloud()) {
    try {
      await cloudSet(key, value);
      await set(key, value); // keep local cache in step with the cloud
      return;
    } catch (e) {
      console.warn("[tracker] cloud write failed, buffered locally:", e.message);
    }
  }
  await set(key, value);
}

async function deleteKey(key) {
  if (useCloud()) {
    try { await cloudDel(key); await del(key); return; } catch (e) { console.warn("[tracker] cloud delete failed:", e.message); }
  }
  await del(key);
}

export const setOrders = (orders) => writeKey(ORDERS_KEY, orders);
export const clearOrders = () => deleteKey(ORDERS_KEY);
export const saveSettings = (settings) => writeKey(SETTINGS_KEY, settings);
export const setMeta = (meta) => writeKey(META_KEY, meta);

// ---- realtime: notify when this user's tracker rows change elsewhere -------
export function subscribeTracker(onChange) {
  if (!useCloud()) return () => {};
  const uid = getUserId();
  let channel;
  try {
    channel = supabase
      .channel("tracker:" + uid)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tracker_data", filter: `user_id=eq.${uid}` },
        () => onChange(),
      )
      .subscribe();
  } catch (e) {
    console.warn("[tracker] realtime subscribe failed:", e.message);
  }
  return () => { try { if (channel) supabase.removeChannel(channel); } catch {} };
}
