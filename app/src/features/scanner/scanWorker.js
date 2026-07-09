// scanWorker.js — runs the warp + enhance pipelines off the main thread.
// op "preview": warp once at <=900px, run ALL modes, return one buffer per mode.
// op "full":    warp at print resolution, run the one chosen mode.
import { warp, outputSize, PIPELINES } from "./scan.js";

self.onmessage = (e) => {
  const { id, op, buf, w, h, quad, mode, strength } = e.data;
  try {
    const src = new Uint8ClampedArray(buf);
    const full = outputSize(quad);
    if (op === "preview") {
      const k = Math.min(1, 900 / Math.max(full.w, full.h));
      const pw = Math.max(8, Math.round(full.w * k)), ph = Math.max(8, Math.round(full.h * k));
      const base = warp(src, w, h, quad, pw, ph);
      const modes = {}, transfer = [];
      for (const m of Object.keys(PIPELINES)) {
        const cp = base.slice();
        PIPELINES[m](cp, pw, ph, strength);
        modes[m] = cp.buffer;
        transfer.push(cp.buffer);
      }
      self.postMessage({ id, w: pw, h: ph, modes }, transfer);
    } else {
      const out = warp(src, w, h, quad, full.w, full.h);
      PIPELINES[mode](out, full.w, full.h, strength);
      self.postMessage({ id, w: full.w, h: full.h, buf: out.buffer }, [out.buffer]);
    }
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
