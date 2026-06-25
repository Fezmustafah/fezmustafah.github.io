// SignatureStrip — lets the user pick one of their saved signatures/stamps
// (the same ones created in "Sign a PDF") to stamp onto tracker invoices.
// Reads from the shared storage facade, so cloud/local both work transparently.

export default function SignatureStrip({ signatures, activeSigId, onPick }) {
  return (
    <div className="rounded-xl border border-tcreamDark bg-tcream/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-tnavy/70">
          Sign invoices with
        </span>
        {activeSigId && (
          <button
            onClick={() => onPick(null)}
            className="text-[11px] font-semibold text-tnavy/50 hover:text-tnavy"
          >
            No signature
          </button>
        )}
      </div>
      {signatures.length === 0 ? (
        <p className="text-xs text-slate">
          No saved signatures yet. Create one in{" "}
          <span className="font-semibold text-tnavy">Sign a PDF</span> and it will appear here.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {signatures.map((s) => {
            const active = s.id === activeSigId;
            return (
              <button
                key={s.id}
                onClick={() => onPick(active ? null : s.id)}
                title={s.name}
                className={
                  "grid h-14 w-24 place-items-center rounded-lg border bg-white p-1 transition " +
                  (active
                    ? "border-tgold ring-2 ring-tgold/40"
                    : "border-tcreamDark hover:border-tgold/60")
                }
              >
                <img src={s.dataUrl} alt={s.name} className="max-h-12 max-w-full object-contain" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
