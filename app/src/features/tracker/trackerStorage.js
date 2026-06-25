// trackerStorage.js — idb-keyval persistence for the Daily Invoice Tracker.
// Uses its OWN keys (tracker-*) so it never collides with letterhead storage
// (which is namespaced lh:/preset:/sig: inside the same idb store).
import { get, set, del } from "idb-keyval";
import { DEFAULT_SETTINGS } from "./constants.js";

const ORDERS_KEY = "tracker-orders"; // { [isoDate: string]: Order[] }
const SETTINGS_KEY = "tracker-settings"; // { seller, buyer, item }
const META_KEY = "tracker-meta"; // { trackingStart: isoDate }

// ---- orders ---------------------------------------------------------------
export async function getOrders() {
  return (await get(ORDERS_KEY)) || {};
}

export async function setOrders(orders) {
  await set(ORDERS_KEY, orders);
}

export async function clearOrders() {
  await del(ORDERS_KEY);
}

// ---- settings -------------------------------------------------------------
export async function getSettings() {
  const saved = (await get(SETTINGS_KEY)) || {};
  // merge so newly added default fields appear even on old saved blobs
  return {
    seller: { ...DEFAULT_SETTINGS.seller, ...(saved.seller || {}) },
    buyer: { ...DEFAULT_SETTINGS.buyer, ...(saved.buyer || {}) },
    item: { ...DEFAULT_SETTINGS.item, ...(saved.item || {}) },
  };
}

export async function saveSettings(settings) {
  await set(SETTINGS_KEY, settings);
}

// ---- meta (tracking period bookkeeping for the weekly reminder) -----------
export async function getMeta() {
  return (await get(META_KEY)) || {};
}

export async function setMeta(meta) {
  await set(META_KEY, meta);
}
