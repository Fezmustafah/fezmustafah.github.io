// vendorStorage.js — persistence for Vendor Statements. Same model as the Daily
// Tracker (see trackerStorage.js): when signed in (and cloud configured) Supabase
// is the SOURCE OF TRUTH (table `vendor_data`, per-user RLS) so data follows the
// account across devices; local idb-keyval is a cache + offline buffer. Load is
// cloud-authoritative (an absent cloud key is a real deletion, never resurrected
// from a stale local cache); genuine offline edits are replayed from a PENDING map.
import { get, set, del } from "idb-keyval";
import { getUserId } from "../../lib/authState.js";
import { cloudEnabled, supabase } from "../../lib/supabase.js";

const VENDORS_KEY = "vendors"; // [{ id, name, currency, notes }]
const RATES_KEY = "rates"; // { [vendorId]: [{ id, label, rate }] }
export const ledgerKey = (vendorId, period) => `ledger:${vendorId}:${period}`; // { openingBalance, lines[] }
const PENDING_KEY = "vendor-pending"; // { [key]: "write" | "delete" } — local-only

const TABLE = "vendor_data";
const useCloud = () => cloudEnabled && !!getUserId();
export function isCloudActive() {
  return useCloud();
}

// ---- Supabase key/value helpers ------------------------------------------
async function cloudGet(key) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("value")
    .eq("user_id", getUserId())
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data ? data.value : undefined;
}
async function cloudSet(key, value) {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ user_id: getUserId(), key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
  if (error) throw error;
}
async function cloudDel(key) {
  const { error } = await supabase.from(TABLE).delete().eq("user_id", getUserId()).eq("key", key);
  if (error) throw error;
}

// ---- pending-op tracking --------------------------------------------------
async function getPending() { return (await get(PENDING_KEY)) || {}; }
async function markPending(key, op) { const p = await getPending(); p[key] = op; await set(PENDING_KEY, p); }
async function clearPending(key) { const p = await getPending(); if (key in p) { delete p[key]; await set(PENDING_KEY, p); } }

// Resolve one key against the cloud, honouring pending local intent.
// seedFromLocal: adopt the local copy when the cloud has nothing (on for config
// keys never deliberately cleared; off for ledger keys where empty = a real delete).
async function resolveKey(key, seedFromLocal) {
  const local = await get(key);
  if (!useCloud()) return local ?? undefined;

  const pending = (await getPending())[key];
  if (pending === "delete") {
    try { await cloudDel(key); await clearPending(key); }
    catch (e) { console.warn("[vendors] pending delete retry failed:", e.message); }
    await del(key);
    return undefined;
  }

  let cloud;
  try { cloud = await cloudGet(key); }
  catch (e) { console.warn("[vendors] cloud read failed, using local:", e.message); return local ?? undefined; }

  if (pending === "write") {
    try { await cloudSet(key, local); await clearPending(key); }
    catch (e) { console.warn("[vendors] pending write retry failed:", e.message); }
    return local ?? undefined;
  }

  if (cloud == null) {
    if (seedFromLocal && local != null) { try { await cloudSet(key, local); } catch {} return local; }
    await del(key);
    return undefined;
  }
  await set(key, cloud);
  return cloud;
}

async function writeKey(key, value) {
  await set(key, value); // optimistic local cache
  if (!useCloud()) return;
  try { await cloudSet(key, value); await clearPending(key); }
  catch (e) { await markPending(key, "write"); console.warn("[vendors] cloud write failed, buffered:", e.message); }
}
async function deleteKey(key) {
  await del(key);
  if (!useCloud()) return;
  try { await cloudDel(key); await clearPending(key); }
  catch (e) { await markPending(key, "delete"); console.warn("[vendors] cloud delete failed, will retry:", e.message); }
}

// ---- public API -----------------------------------------------------------
export async function loadVendors() { return (await resolveKey(VENDORS_KEY, true)) || []; }
export const saveVendors = (v) => writeKey(VENDORS_KEY, v);

export async function loadRates() { return (await resolveKey(RATES_KEY, true)) || {}; }
export const saveRates = (r) => writeKey(RATES_KEY, r);

export async function loadLedger(vendorId, period) {
  return (await resolveKey(ledgerKey(vendorId, period), false)) || { openingBalance: 0, lines: [] };
}
export const saveLedger = (vendorId, period, value) => writeKey(ledgerKey(vendorId, period), value);
export const deleteLedger = (vendorId, period) => deleteKey(ledgerKey(vendorId, period));

// realtime: notify when this user's vendor rows change on another device.
export function subscribeVendors(onChange) {
  if (!useCloud()) return () => {};
  const uid = getUserId();
  let channel;
  try {
    channel = supabase
      .channel("vendors:" + uid)
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: `user_id=eq.${uid}` }, () => onChange())
      .subscribe();
  } catch (e) {
    console.warn("[vendors] realtime subscribe failed:", e.message);
  }
  return () => { try { if (channel) supabase.removeChannel(channel); } catch {} };
}
