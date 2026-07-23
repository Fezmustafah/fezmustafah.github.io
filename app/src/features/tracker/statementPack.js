// statementPack.js — one combined "Statement of Account" bundle: the Weekly
// Statement page(s) followed by a signed TAX INVOICE for every line in the
// statement, all in a SINGLE PDF the buyer can verify line-by-line.
//
// Built as ONE jsPDF document (not many docs merged) so the letterhead image
// and the signature PNG are embedded only ONCE for the whole bundle — jsPDF
// caches identical images per-document. The earlier merge-with-pdf-lib approach
// re-embedded the full-res letterhead on every page (~12×), which is what blew
// the file up to ~26 MB.
import { newDoc } from "./pdfShared.js";
import { buildWeekly } from "./weeklyPdf.js";
import { buildInvoice } from "./invoicePdf.js";

// rows are already in statement order (matches the statement's line numbering /
// invoice numbers).
export function buildStatementPackDoc({ rows, settings, periodStart, periodEnd, sig, letterhead, title }) {
  const doc = newDoc(); // starts on a blank page 1
  buildWeekly({ rows, settings, periodStart, periodEnd, sig, letterhead, title, doc });
  for (const r of rows) {
    doc.addPage();
    buildInvoice({ order: r.order, date: r.date, index: r.index, settings, sig, letterhead, doc });
  }
  return doc;
}

export function downloadStatementPack(args) {
  const doc = buildStatementPackDoc(args);
  const start = args.periodStart.replace(/-/g, "");
  const end = args.periodEnd.replace(/-/g, "");
  doc.save(start === end ? `BAM-SoA-${start}.pdf` : `BAM-SoA-${start}-${end}.pdf`);
}
