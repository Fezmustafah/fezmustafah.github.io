// trackerStorage.js — persistence for the Daily Invoice Tracker.
//
// Model: when signed in (and cloud configured) Supabase is the SOURCE OF TRUTH
// (table `tracker_data`, per-user RLS) so data follows the account across
// devices. Local idb-keyval is a cache + an offline buffer.
//
// Load is cloud-authoritative: the cloud value replaces the local cache. This
// is deliberate — an empty/absent cloud key means a real deletion, and must NOT
// be resurrected by a stale local cache on another device (the old union-merge
// did exactly that: deletes never stuck). Genuine offline edits are not lost —
// a cloud write/delete that fails while online is recorded in a local PENDING
// map and replayed on the next load. A key with NO pending op always yields to
// the cloud. When signed out it's purely local.
import { get, set, del } from "idb-keyval";
import { getUserId } from "../../lib/authState.js";
import { cloudEnabled, supabase } from "../../lib/supabase.js";
import { DEFAULT_SETTINGS, DEFAULT_VAT_RATE, isTemplate, isLayout } from "./constants.js";

const ORDERS_KEY = "tracker-orders"; // { [isoDate]: Order[] }
const SETTINGS_KEY = "tracker-settings"; // { seller, buyer, items, vatRate, header }
const META_KEY = "tracker-meta"; // { trackingStart: isoDate, periodMode }
const TRASH_KEY = "tracker-trash"; // [{ ...order, date, deletedAt }] — recycle bin
const PENDING_KEY = "tracker-pending"; // { [key]: "write" | "delete" } — local-only
const BACKUP_KEY = "tracker-backup"; // [{ at, reason, count, orders }] — LOCAL-ONLY safety net

const BACKUP_RING = 8; // how many order snapshots this device keeps

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

// ---- pending-op tracking: local intent not yet confirmed on the cloud -------
// "write" = a cloud upsert failed while online (offline edit to replay).
// "delete" = a cloud delete failed (deletion to replay). Load replays these;
// a key with NO entry yields to the cloud so deletions are never resurrected.
async function getPending() { return (await get(PENDING_KEY)) || {}; }
async function markPending(key, op) {
  const p = await getPending();
  p[key] = op;
  await set(PENDING_KEY, p);
}
async function clearPending(key) {
  const p = await getPending();
  if (key in p) { delete p[key]; await set(PENDING_KEY, p); }
}

// ---- local order snapshots: the last line of defence against a lost week ----
// Deletions are deliberate and must stick (see the cloud-authoritative note
// above), so the tracker never resurrects orders by itself. But a wipe should
// still be UNDOABLE by the person who made it — so every time this device is
// about to lose orders (a delete, a period clear, or a cloud that has gone
// empty while this device still holds data) the previous set is snapshotted
// into a LOCAL-ONLY ring. Never uploaded, never auto-cleared, never merged on
// load: the Deleted tab offers it as an explicit, user-initiated restore.
export function countOrders(orders) {
  return Object.values(orders || {}).reduce((n, list) => n + (list ? list.length : 0), 0);
}

async function snapshotOrders(orders, reason) {
  const count = countOrders(orders);
  if (!count) return;
  const ring = (await get(BACKUP_KEY)) || [];
  if (ring[0] && ring[0].count === count && JSON.stringify(ring[0].orders) === JSON.stringify(orders)) return;
  ring.unshift({ at: new Date().toISOString(), reason, count, orders });
  await set(BACKUP_KEY, ring.slice(0, BACKUP_RING));
}

export async function listBackups() {
  return (await get(BACKUP_KEY)) || [];
}

export async function deleteBackup(at) {
  const ring = (await get(BACKUP_KEY)) || [];
  await set(BACKUP_KEY, ring.filter((b) => b.at !== at));
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// fill defaults + migrate old shapes: single `item` -> items[] + vatRate, and a
// single `buyer` -> buyers[] roster + active buyerId.
function sanitizeExtra(extra) {
  return Array.isArray(extra)
    ? extra.map((f) => ({ label: String(f?.label || ""), value: String(f?.value || "") }))
    : [];
}

function normalizeSettings(saved) {
  const s = saved || {};
  const items = Array.isArray(s.items) && s.items.length
    ? s.items.map((it) => ({ description: String(it.description || ""), unitPrice: Number(it.unitPrice) || 0 }))
    : s.item
      ? [{ description: s.item.description, unitPrice: Number(s.item.unitPrice) || 0 }]
      : DEFAULT_SETTINGS.items.map((x) => ({ ...x }));
  const vatRate = s.vatRate != null ? Number(s.vatRate) : s.item?.vatRate != null ? Number(s.item.vatRate) : DEFAULT_VAT_RATE;

  const sellerBank = (se) => ({ ...DEFAULT_SETTINGS.seller.bank, ...((se && se.bank) || {}) });

  // seller / beneficiary roster (each seller keeps its OWN bank details)
  let sellers = Array.isArray(s.sellers) && s.sellers.length
    ? s.sellers.map((se) => ({ id: se.id || uid(), ...DEFAULT_SETTINGS.seller, ...se, extra: sanitizeExtra(se.extra), bank: sellerBank(se) }))
    : [{ id: "default", ...DEFAULT_SETTINGS.seller, ...(s.seller || {}), extra: sanitizeExtra(s.seller?.extra), bank: sellerBank(s.seller) }];
  const sellerId = s.sellerId && sellers.some((se) => se.id === s.sellerId) ? s.sellerId : sellers[0].id;
  const activeSeller = sellers.find((se) => se.id === sellerId) || sellers[0];

  // buyer roster
  let buyers = Array.isArray(s.buyers) && s.buyers.length
    ? s.buyers.map((b) => ({ id: b.id || uid(), ...DEFAULT_SETTINGS.buyer, ...b, extra: sanitizeExtra(b.extra) }))
    : [{ id: "default", ...DEFAULT_SETTINGS.buyer, ...(s.buyer || {}), extra: sanitizeExtra(s.buyer?.extra) }];
  const buyerId = s.buyerId && buyers.some((b) => b.id === s.buyerId) ? s.buyerId : buyers[0].id;
  const active = buyers.find((b) => b.id === buyerId) || buyers[0];

  return {
    sellers,
    sellerId,
    seller: { ...DEFAULT_SETTINGS.seller, ...activeSeller }, // active seller, denormalised for the PDFs (incl. bank + extra)
    buyers,
    buyerId,
    buyer: { ...DEFAULT_SETTINGS.buyer, ...active }, // active buyer, denormalised for the PDFs (incl. extra)
    items,
    vatRate,
    header: { ...DEFAULT_SETTINGS.header, ...(s.header || {}) },
    theme: isTemplate(s.theme) ? s.theme : "classic",
    layout: isLayout(s.layout) ? s.layout : "standard",
  };
}

// ---- load (cloud-authoritative; pending ops replayed) ---------------------
// Resolve one key against the cloud, honouring any pending local intent.
// seedFromLocal: when the cloud has NOTHING for this key, adopt (and upload) the
// local copy. On for settings/meta (config, never deliberately cleared); OFF
// for orders — an empty orders key is a real "clear week", so it must not be
// re-seeded from a stale local cache (that was the resurrection bug).
async function resolveKey(key, seedFromLocal) {
  const local = await get(key);
  if (!useCloud()) return local ?? undefined;

  const pending = (await getPending())[key];

  // this device deleted while the cloud call failed — finish the delete.
  if (pending === "delete") {
    try { await cloudDel(key); await clearPending(key); }
    catch (e) { console.warn("[tracker] pending delete retry failed:", e.message); }
    await del(key);
    return undefined;
  }

  let cloud;
  try { cloud = await cloudGet(key); }
  catch (e) { console.warn("[tracker] cloud read failed, using local:", e.message); return local ?? undefined; }

  // offline edit not yet synced — local wins, push it up.
  if (pending === "write") {
    try { await cloudSet(key, local); await clearPending(key); }
    catch (e) { console.warn("[tracker] pending write retry failed:", e.message); }
    return local ?? undefined;
  }

  // no local intent → the cloud is the source of truth.
  if (cloud == null) {
    if (seedFromLocal && local != null) {
      try { await cloudSet(key, local); } catch {}
      return local;
    }
    // Cloud is empty and we trust it. Before dropping this device's copy, keep
    // a local snapshot — this is the case where a device that has been offline
    // since a wipe is holding the only surviving copy of those invoices.
    if (key === ORDERS_KEY && local && countOrders(local)) await snapshotOrders(local, "cleared on another device");
    await del(key); // clear the stale cache
    return undefined;
  }
  await set(key, cloud); // refresh local cache to match the cloud
  return cloud;
}

export async function loadTracker() {
  const orders = (await resolveKey(ORDERS_KEY, false)) || {};
  const settings = await resolveKey(SETTINGS_KEY, true);
  const meta = (await resolveKey(META_KEY, true)) || {};
  // trash seeds from local when the cloud has never seen it (first load after
  // this feature shipped); an EMPTY array on the cloud is a real "emptied bin"
  // and is not a missing key, so emptying still sticks across devices.
  const trash = (await resolveKey(TRASH_KEY, true)) || [];
  return { orders, settings: normalizeSettings(settings), meta, trash };
}

// ---- writes (optimistic local mirror; pending buffer on cloud failure) ----
async function writeKey(key, value) {
  await set(key, value); // optimistic local cache
  if (!useCloud()) return;
  try { await cloudSet(key, value); await clearPending(key); }
  catch (e) { await markPending(key, "write"); console.warn("[tracker] cloud write failed, buffered locally:", e.message); }
}

async function deleteKey(key) {
  await del(key); // clear local first
  if (!useCloud()) return;
  try { await cloudDel(key); await clearPending(key); }
  catch (e) { await markPending(key, "delete"); console.warn("[tracker] cloud delete failed, will retry on next load:", e.message); }
}

// Snapshot first whenever a write would REMOVE invoices (edits and additions
// don't shrink the set, so they cost nothing).
export async function setOrders(orders) {
  const prev = await get(ORDERS_KEY);
  if (prev && countOrders(prev) > countOrders(orders)) await snapshotOrders(prev, "before delete");
  return writeKey(ORDERS_KEY, orders);
}

export async function clearOrders() {
  const prev = await get(ORDERS_KEY);
  if (prev) await snapshotOrders(prev, "before clear");
  return deleteKey(ORDERS_KEY);
}

export const setTrash = (trash) => writeKey(TRASH_KEY, trash);
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
