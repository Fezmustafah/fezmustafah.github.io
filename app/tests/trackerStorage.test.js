// Regression tests for the tracker sync model. The bug: "clear week" deleted the
// cloud row, but load() union-merged the cloud with a stale local cache, so the
// deleted history came back (and got re-uploaded). These pin the fix: the cloud
// is authoritative, deletions stick, and genuine offline edits still replay.
import { describe, it, expect, beforeEach, vi } from "vitest";

// shared, inspectable state for the mocked backends
const h = vi.hoisted(() => ({
  local: new Map(), // this device's idb-keyval cache
  cloud: new Map(), // supabase rows for the signed-in user
  flags: { failWrite: false, failDelete: false, failRead: false },
}));

vi.mock("idb-keyval", () => ({
  get: async (k) => (h.local.has(k) ? h.local.get(k) : undefined),
  set: async (k, v) => { h.local.set(k, v); },
  del: async (k) => { h.local.delete(k); },
}));

vi.mock("../src/lib/authState.js", () => ({ getUserId: () => "u1" }));

// minimal supabase-js query-builder stand-in (thenable, chainable)
function builder() {
  const st = { op: null, key: null };
  const api = {
    select() { st.op = "select"; return api; },
    eq(col, val) { if (col === "key") st.key = val; return api; },
    maybeSingle() {
      if (h.flags.failRead) return Promise.reject(new Error("read fail"));
      const v = h.cloud.has(st.key) ? h.cloud.get(st.key) : null;
      return Promise.resolve({ data: v == null ? null : { value: v }, error: null });
    },
    upsert(row) {
      if (h.flags.failWrite) return Promise.resolve({ error: new Error("write fail") });
      h.cloud.set(row.key, row.value);
      return Promise.resolve({ error: null });
    },
    delete() { st.op = "delete"; return api; },
    then(res, rej) { // only awaited on the delete chain
      if (st.op === "delete") {
        if (h.flags.failDelete) return Promise.resolve({ error: new Error("del fail") }).then(res, rej);
        h.cloud.delete(st.key);
        return Promise.resolve({ error: null }).then(res, rej);
      }
      return Promise.resolve({ error: null }).then(res, rej);
    },
  };
  return api;
}

vi.mock("../src/lib/supabase.js", () => ({
  cloudEnabled: true,
  supabase: { from: () => builder() },
}));

const ORDERS_KEY = "tracker-orders";
const PENDING_KEY = "tracker-pending";
const day = { "2026-07-01": [{ id: "o1", location: "JVC", qty: 5, amount: 50 }] };

let store;
beforeEach(async () => {
  vi.resetModules();
  h.local.clear();
  h.cloud.clear();
  h.flags.failWrite = h.flags.failDelete = h.flags.failRead = false;
  store = await import("../src/features/tracker/trackerStorage.js");
});

describe("tracker sync — deletions are authoritative", () => {
  it("does NOT resurrect deleted orders from a stale local cache", async () => {
    // another device already cleared the week: cloud is empty...
    // ...but THIS device still has the old orders cached locally.
    h.local.set(ORDERS_KEY, day);
    // no pending op recorded on this device (it didn't make the edit)

    const { orders } = await store.loadTracker();

    expect(orders).toEqual({});               // stale cache does not win
    expect(h.cloud.has(ORDERS_KEY)).toBe(false); // and is NOT re-uploaded
    expect(h.local.has(ORDERS_KEY)).toBe(false); // stale cache cleared
  });

  it("clearOrders removes the cloud row so the delete sticks", async () => {
    h.cloud.set(ORDERS_KEY, day);
    h.local.set(ORDERS_KEY, day);

    await store.clearOrders();

    expect(h.cloud.has(ORDERS_KEY)).toBe(false);
    const { orders } = await store.loadTracker();
    expect(orders).toEqual({});
  });

  it("a failed cloud delete is buffered and replayed on next load", async () => {
    h.cloud.set(ORDERS_KEY, day);
    h.local.set(ORDERS_KEY, day);

    h.flags.failDelete = true;
    await store.clearOrders();               // cloud delete fails, buffered
    expect((h.local.get(PENDING_KEY) || {})[ORDERS_KEY]).toBe("delete");
    expect(h.cloud.has(ORDERS_KEY)).toBe(true); // still there for now

    h.flags.failDelete = false;
    const { orders } = await store.loadTracker(); // replays the delete
    expect(orders).toEqual({});
    expect(h.cloud.has(ORDERS_KEY)).toBe(false);
  });
});

describe("tracker sync — offline edits are not lost", () => {
  it("buffers a failed write and pushes it to the cloud on next load", async () => {
    h.flags.failWrite = true;
    await store.setOrders(day);              // cloud write fails, buffered
    expect((h.local.get(PENDING_KEY) || {})[ORDERS_KEY]).toBe("write");

    h.flags.failWrite = false;
    const { orders } = await store.loadTracker(); // replays the write
    expect(orders).toEqual(day);
    expect(h.cloud.get(ORDERS_KEY)).toEqual(day); // now on the cloud
  });

  it("cloud value wins when there is no pending local intent", async () => {
    const newer = { "2026-07-02": [{ id: "o2", location: "Satwa", qty: 3, amount: 30 }] };
    h.cloud.set(ORDERS_KEY, newer);
    h.local.set(ORDERS_KEY, day); // stale, but no pending op

    const { orders } = await store.loadTracker();
    expect(orders).toEqual(newer);
    expect(h.local.get(ORDERS_KEY)).toEqual(newer); // cache refreshed
  });
});
