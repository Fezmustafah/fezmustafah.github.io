// trackerStorage.js — persistence for the Daily Invoice Tracker.
// Mirrors the app's storage strategy: when the user is signed in (and cloud is
// configured) the data lives in Supabase (table `tracker_data`, per-user RLS)
// so it follows the account across devices; otherwise it stays device-local in
// idb-keyval. Cloud failures degrade gracefully to local so the tool never
// breaks (e.g. before the schema migration is run).
import { get, set, del } from "idb-keyval";
import { getUserId } from "../../lib/authState.js";
import { cloudEnabled, supabase } from "../../lib/supabase.js";
import { DEFAULT_SETTINGS } from "./constants.js";

const ORDERS_KEY = "tracker-orders"; // { [isoDate: string]: Order[] }
const SETTINGS_KEY = "tracker-settings"; // { seller, buyer, item, header }
const META_KEY = "tracker-meta"; // { trackingStart: isoDate }

const useCloud = () => cloudEnabled && !!getUserId();

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

// ---- backend-agnostic read / write / delete ------------------------------
async function readKey(key) {
  if (useCloud()) {
    try {
      return await cloudGet(key);
    } catch (e) {
      console.warn("[tracker] cloud read failed, falling back to local:", e.message);
    }
  }
  return await get(key);
}

async function writeKey(key, value) {
  if (useCloud()) {
    try {
      await cloudSet(key, value);
      return;
    } catch (e) {
      console.warn("[tracker] cloud write failed, falling back to local:", e.message);
    }
  }
  await set(key, value);
}

async function deleteKey(key) {
  if (useCloud()) {
    try {
      await cloudDel(key);
      return;
    } catch (e) {
      console.warn("[tracker] cloud delete failed, falling back to local:", e.message);
    }
  }
  await del(key);
}

// ---- orders ---------------------------------------------------------------
export async function getOrders() {
  return (await readKey(ORDERS_KEY)) || {};
}

export async function setOrders(orders) {
  await writeKey(ORDERS_KEY, orders);
}

export async function clearOrders() {
  await deleteKey(ORDERS_KEY);
}

// ---- settings -------------------------------------------------------------
export async function getSettings() {
  const saved = (await readKey(SETTINGS_KEY)) || {};
  // merge so newly added default fields appear even on old saved blobs
  return {
    seller: { ...DEFAULT_SETTINGS.seller, ...(saved.seller || {}) },
    buyer: { ...DEFAULT_SETTINGS.buyer, ...(saved.buyer || {}) },
    item: { ...DEFAULT_SETTINGS.item, ...(saved.item || {}) },
    header: { ...DEFAULT_SETTINGS.header, ...(saved.header || {}) },
  };
}

export async function saveSettings(settings) {
  await writeKey(SETTINGS_KEY, settings);
}

// ---- meta (tracking period bookkeeping for the weekly reminder) -----------
export async function getMeta() {
  return (await readKey(META_KEY)) || {};
}

export async function setMeta(meta) {
  await writeKey(META_KEY, meta);
}

// ---- one-time local -> cloud lift -----------------------------------------
// On a device that already has local tracker data, push it up to the cloud the
// first time the signed-in user opens the tracker (only when the cloud copy is
// still empty, so we never clobber data entered on another device).
export async function migrateTrackerToCloud() {
  if (!useCloud()) return;
  for (const key of [ORDERS_KEY, SETTINGS_KEY, META_KEY]) {
    try {
      const remote = await cloudGet(key);
      const remoteEmpty = remote == null || (typeof remote === "object" && Object.keys(remote).length === 0);
      if (!remoteEmpty) continue;
      const localVal = await get(key);
      const localEmpty = localVal == null || (typeof localVal === "object" && Object.keys(localVal).length === 0);
      if (!localEmpty) await cloudSet(key, localVal);
    } catch (e) {
      console.warn("[tracker] migrate skipped for", key, e.message);
    }
  }
}
