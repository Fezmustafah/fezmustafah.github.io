// TrashTab — recycle bin for invoices.
//
// Deleting an invoice (or clearing a period) no longer destroys it: it lands
// here and can be restored to its original date. Purging from here is the only
// hard delete. Below the bin sits the DEVICE SNAPSHOT list — a local-only ring
// of the order set taken right before anything shrank it, which is the last
// resort for a wipe that happened before this bin existed.
import { useEffect, useState } from "react";
import { listBackups, deleteBackup } from "./trackerStorage.js";
import { money, dateShort, orderQty, orderAmount } from "./format.js";

function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export default function TrashTab({ trash, onRestore, onPurge, onEmpty, onRestoreBackup }) {
  const [backups, setBackups] = useState([]);
  const [msg, setMsg] = useState("");

  useEffect(() => { listBackups().then(setBackups).catch(() => setBackups([])); }, []);

  function restoreSnapshot(snap) {
    const added = onRestoreBackup(snap);
    setMsg(added ? `Restored ${added} invoice${added === 1 ? "" : "s"} from ${when(snap.at)}.` : "Nothing to restore — every invoice in that snapshot is already in the tracker.");
  }

  async function discard(snap) {
    if (!window.confirm(`Discard this device snapshot (${snap.count} invoices)? It cannot be brought back.`)) return;
    await deleteBackup(snap.at);
    setBackups(await listBackups());
  }

  function empty() {
    if (!trash.length) return;
    if (window.confirm(`Permanently delete ${trash.length} invoice${trash.length === 1 ? "" : "s"} from the bin? This cannot be undone.`)) onEmpty();
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-tnavy">
            Deleted invoices {trash.length ? `(${trash.length})` : ""}
          </h3>
          {trash.length > 0 && (
            <button
              onClick={empty}
              className="rounded-lg border border-[#C0392B] px-3 py-1.5 text-xs font-semibold text-[#C0392B] hover:bg-red-50"
            >
              Empty bin
            </button>
          )}
        </div>

        {!trash.length ? (
          <div className="rounded-xl border border-dashed border-tcreamDark py-10 text-center text-sm text-slate">
            Nothing deleted. Invoices you delete — or clear with a period — land here and can be put back.
          </div>
        ) : (
          <ul className="divide-y divide-tcreamDark overflow-hidden rounded-xl border border-tcreamDark bg-white">
            {trash.map((e) => (
              <li key={e.id + ":" + e.deletedAt} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-tnavy">
                    {dateShort(e.date)} · {e.location || "—"}
                  </p>
                  <p className="text-xs text-slate">
                    {orderQty(e)} pcs · AED {money(orderAmount(e))} · deleted {when(e.deletedAt)}
                  </p>
                </div>
                <button
                  onClick={() => onRestore(e)}
                  className="rounded-lg bg-tnavy px-3 py-1.5 text-xs font-semibold text-white hover:bg-tnavy/90"
                >
                  Restore
                </button>
                <button
                  onClick={() => { if (window.confirm("Delete this invoice permanently?")) onPurge(e); }}
                  title="Delete permanently"
                  className="rounded-lg border border-tcreamDark px-2.5 py-1.5 text-xs font-semibold text-[#C0392B] hover:bg-red-50"
                >
                  Delete forever
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-tnavy">Device snapshots</h3>
        <p className="text-xs text-slate">
          Automatic copies of your invoice list taken on <b className="text-tnavy">this device</b> just before
          anything was removed. They never sync, so open the tracker on an older phone or PC to look for a wipe
          that happened before the bin existed.
        </p>
        {msg && <p className="rounded-lg bg-tgold/15 px-3 py-2 text-xs text-tnavy">{msg}</p>}
        {!backups.length ? (
          <div className="rounded-xl border border-dashed border-tcreamDark py-8 text-center text-sm text-slate">
            No snapshots on this device.
          </div>
        ) : (
          <ul className="divide-y divide-tcreamDark overflow-hidden rounded-xl border border-tcreamDark bg-white">
            {backups.map((b) => (
              <li key={b.at} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-tnavy">{b.count} invoice{b.count === 1 ? "" : "s"}</p>
                  <p className="text-xs text-slate">{when(b.at)} · {b.reason || "snapshot"}</p>
                </div>
                <button
                  onClick={() => restoreSnapshot(b)}
                  className="rounded-lg bg-tnavy px-3 py-1.5 text-xs font-semibold text-white hover:bg-tnavy/90"
                >
                  Restore missing
                </button>
                <button
                  onClick={() => discard(b)}
                  className="rounded-lg border border-tcreamDark px-2.5 py-1.5 text-xs font-semibold text-slate hover:bg-tcream"
                >
                  Discard
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
