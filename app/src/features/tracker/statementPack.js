// statementPack.js — one combined "Statement of Account" bundle: the Weekly
// Statement page(s) followed by a signed TAX INVOICE for every line in the
// statement, merged into a SINGLE PDF the buyer can verify line-by-line.
//
// Reuses buildWeekly + buildInvoice (each returns its own jsPDF doc) and stitches
// their pages together with pdf-lib (already a dep from the Sign-a-PDF feature).
// The active signature is stamped on the statement AND on every invoice, so the
// whole pack ships "signed" — that's what the buyer means by "attach all
// invoices in SoA".
import { PDFDocument } from "pdf-lib";
import { buildWeekly } from "./weeklyPdf.js";
import { buildInvoice } from "./invoicePdf.js";

// Build the merged bundle bytes. rows are already in statement order (matches
// the statement's line numbering / invoice numbers).
export async function buildStatementPackBytes({ rows, settings, periodStart, periodEnd, sig, letterhead }) {
  const parts = [];
  // 1) the statement itself
  parts.push(buildWeekly({ rows, settings, periodStart, periodEnd, sig, letterhead }));
  // 2) one signed invoice per line, in the same order
  for (const r of rows) {
    parts.push(buildInvoice({ order: r.order, date: r.date, index: r.index, settings, sig, letterhead }));
  }

  const merged = await PDFDocument.create();
  for (const doc of parts) {
    const src = await PDFDocument.load(doc.output("arraybuffer"));
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return merged.save();
}

export async function downloadStatementPack(args) {
  const bytes = await buildStatementPackBytes(args);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const start = args.periodStart.replace(/-/g, "");
  const end = args.periodEnd.replace(/-/g, "");
  a.href = url;
  a.download = `BAM-SoA-${start}-${end}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
