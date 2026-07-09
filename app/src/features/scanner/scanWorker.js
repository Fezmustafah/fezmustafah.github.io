// scanWorker.js — runs the warp + enhance pipelines off the main thread.
// op "preview": warp once at <=900px, run ALL modes, return one buffer per mode.
// op "full":    warp at print resolution, run the one chosen mode.
import { warp, outputSize, quadRot, deskewAngle, PIPELINES } from "./scan.js";

self.onmessage = (e) => {
  const { id, op, buf, w, h, quad, mode, strength, straighten } = e.data;
  try {
    const src = new Uint8ClampedArray(buf);
    const full = outputSize(quad);
    // warp + optional auto-deskew of any residual tilt (crooked page / rough corners)
    const crop = (ow, oh) => {
      let out = warp(src, w, h, quad, ow, oh);
      if (straighten !== false) {
        const a = deskewAngle(out, ow, oh);
        if (Math.abs(a) > 0.3) out = warp(out, ow, oh, quadRot(ow, oh, a), ow, oh);
      }
      return out;
    };
    if (op === "preview") {
      const k = Math.min(1, 900 / Math.max(full.w, full.h));
      const pw = Math.max(8, Math.round(full.w * k)), ph = Math.max(8, Math.round(full.h * k));
      const base = crop(pw, ph);
      const modes = {}, transfer = [];
      for (const m of Object.keys(PIPELINES)) {
        const cp = base.slice();
        PIPELINES[m](cp, pw, ph, strength);
        modes[m] = cp.buffer;
        transfer.push(cp.buffer);
      }
      self.postMessage({ id, w: pw, h: ph, modes }, transfer);
    } else {
      const out = crop(full.w, full.h);
      PIPELINES[mode](out, full.w, full.h, strength);
      self.postMessage({ id, w: full.w, h: full.h, buf: out.buffer }, [out.buffer]);
    }
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
