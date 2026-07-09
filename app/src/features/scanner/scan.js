// scan.js — pure pixel math for Scan & Enhance. No DOM: runs in the worker and
// in vitest. Everything here is deterministic arithmetic on input pixels — no
// generative AI anywhere, so document content can never change.

// ---- geometry ----

// Solve the 3x3 homography (h33=1) mapping output point (X,Y) -> source (x,y)
// from 4 corner pairs. Standard DLT: 8x8 gaussian elimination, partial pivot.
export function homography(outPts, srcPts) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [X, Y] = outPts[i], [x, y] = srcPts[i];
    A.push([X, Y, 1, 0, 0, 0, -X * x, -Y * x]); b.push(x);
    A.push([0, 0, 0, X, Y, 1, -X * y, -Y * y]); b.push(y);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c || !A[c][c]) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = A.map((row, i) => b[i] / row[i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyH(H, X, Y) {
  const d = H[6] * X + H[7] * Y + 1;
  return [(H[0] * X + H[1] * Y + H[2]) / d, (H[3] * X + H[4] * Y + H[5]) / d];
}

// Output size from the quad: keep its real proportions, resample up to >=1600px
// long edge (that IS the resolution increase — no invented detail), cap 300dpi A4.
export function outputSize(quad, cap = 3508) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const w = Math.max(d(quad[0], quad[1]), d(quad[3], quad[2]));
  const h = Math.max(d(quad[0], quad[3]), d(quad[1], quad[2]));
  const long = Math.max(w, h) || 1;
  const s = Math.min(cap, Math.max(1600, Math.round(long * 2))) / long;
  return { w: Math.max(8, Math.round(w * s)), h: Math.max(8, Math.round(h * s)) };
}

// Perspective warp: inverse-map every output pixel through H, bilinear sample.
export function warp(src, sw, sh, quad, ow, oh) {
  const H = homography([[0, 0], [ow, 0], [ow, oh], [0, oh]], quad);
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let Y = 0; Y < oh; Y++) {
    for (let X = 0; X < ow; X++) {
      const den = H[6] * X + H[7] * Y + 1;
      let x = (H[0] * X + H[1] * Y + H[2]) / den;
      let y = (H[3] * X + H[4] * Y + H[5]) / den;
      x = x < 0 ? 0 : x > sw - 1.001 ? sw - 1.001 : x;
      y = y < 0 ? 0 : y > sh - 1.001 ? sh - 1.001 : y;
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
      const i00 = (y0 * sw + x0) * 4, i01 = i00 + sw * 4;
      const o = (Y * ow + X) * 4;
      for (let c = 0; c < 3; c++) {
        const top = src[i00 + c] * (1 - fx) + src[i00 + 4 + c] * fx;
        const bot = src[i01 + c] * (1 - fx) + src[i01 + 4 + c] * fx;
        out[o + c] = top * (1 - fy) + bot * fy;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

// ---- auto-straighten ----

// Rect corners rotated by deg about the centre — feed to warp() to rotate an image.
export function quadRot(w, h, deg) {
  const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const cx = w / 2, cy = h / 2;
  return [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => [
    cx + (x - cx) * cos - (y - cy) * sin,
    cy + (x - cx) * sin + (y - cy) * cos,
  ]);
}

// Residual tilt of an already-cropped page (user's corners were a bit off, or
// the page itself sat crooked): shear-project ink onto rows at candidate
// angles — text lines make the row profile spiky when aligned. Returns the
// angle to pass to quadRot() to straighten, or 0 when there is no clear winner
// (so pages without text lines are never rotated on a guess).
export function deskewAngle(img, w, h) {
  const dw = 320, dh = Math.max(8, Math.round((h * dw) / w));
  const g = downscale((x, y) => {
    const i = (y * w + x) * 4;
    return (img[i] * 77 + img[i + 1] * 150 + img[i + 2] * 29) >> 8;
  }, w, h, dw, dh);
  const cx = dw / 2, pad = 24;
  let best = 0, bestScore = -1, zeroScore = 0;
  for (let a = -5; a <= 5.001; a += 0.25) {
    const t = Math.tan((a * Math.PI) / 180);
    const rows = new Float32Array(dh + pad * 2);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const yy = Math.round(y + (x - cx) * t) + pad;
        if (yy >= 0 && yy < rows.length) rows[yy] += 255 - g[y * dw + x];
      }
    }
    let m = 0;
    for (const v of rows) m += v;
    m /= rows.length;
    let s = 0;
    for (const v of rows) s += (v - m) * (v - m);
    if (Math.abs(a) < 0.01) zeroScore = s;
    if (s > bestScore) { bestScore = s; best = a; }
  }
  // the best shear t cancels the content slope (t = -tan(tilt)); quadRot(tilt)
  // samples along the content, so the correction is -best.
  return bestScore > zeroScore * 1.03 ? -best : 0;
}

// ---- filters ----

// In-place separable box blur on a Float32 channel; 2 passes ~ gaussian.
// Running-sum, so cost is radius-independent.
export function boxBlur(a, w, h, r, passes = 2) {
  const tmp = new Float32Array(Math.max(w, h));
  const line = (off, stride, n) => {
    const norm = 1 / (2 * r + 1);
    const at = (i) => a[off + stride * (i < 0 ? 0 : i >= n ? n - 1 : i)];
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += at(i);
    for (let i = 0; i < n; i++) { tmp[i] = sum * norm; sum += at(i + r + 1) - at(i - r); }
    for (let i = 0; i < n; i++) a[off + stride * i] = tmp[i];
  };
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) line(y * w, 1, w);
    for (let x = 0; x < w; x++) line(x, w, h);
  }
}

// Block-average downscale via a getter (reads RGBA channel or a gray array).
function downscale(get, w, h, dw, dh) {
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const y0 = (y * h / dh) | 0, y1 = Math.max(y0 + 1, ((y + 1) * h / dh) | 0);
    for (let x = 0; x < dw; x++) {
      const x0 = (x * w / dw) | 0, x1 = Math.max(x0 + 1, ((x + 1) * w / dw) | 0);
      let s = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { s += get(xx, yy); n++; }
      out[y * dw + x] = s / n;
    }
  }
  return out;
}

function bilinear(a, w, h, x, y) {
  x = x < 0 ? 0 : x > w - 1 ? w - 1 : x;
  y = y < 0 ? 0 : y > h - 1 ? h - 1 : y;
  const x0 = x | 0, y0 = y | 0, x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  return (a[y0 * w + x0] * (1 - fx) + a[y0 * w + x1] * fx) * (1 - fy) +
         (a[y1 * w + x0] * (1 - fx) + a[y1 * w + x1] * fx) * fy;
}

// Illumination background of one channel: heavy blur on a 4x-downscaled copy
// (16x cheaper than blurring full-res; visually identical for a bg estimate).
function backgroundOf(get, w, h) {
  const dw = Math.max(1, Math.round(w / 4)), dh = Math.max(1, Math.round(h / 4));
  const bg = downscale(get, w, h, dw, dh);
  boxBlur(bg, dw, dh, Math.max(2, Math.round(Math.max(dw, dh) / 40)));
  return { bg, dw, dh };
}

// Divide each channel by its blurred background -> shadows and grey cast go
// white while ink stays. amt<1 blends with the original for a softer effect.
export function flattenRGB(img, w, h, amt = 1) {
  for (let c = 0; c < 3; c++) {
    const { bg, dw, dh } = backgroundOf((x, y) => img[(y * w + x) * 4 + c], w, h);
    for (let y = 0; y < h; y++) {
      const v = (y + 0.5) * dh / h - 0.5;
      for (let x = 0; x < w; x++) {
        const b = bilinear(bg, dw, dh, (x + 0.5) * dw / w - 0.5, v);
        const i = (y * w + x) * 4 + c;
        const flat = 255 * img[i] / (b < 1 ? 1 : b);
        img[i] = img[i] + amt * (flat - img[i]);
      }
    }
  }
}

// Clip 1% luma tails and stretch all channels to full range.
export function stretch(img) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < img.length; i += 4)
    hist[(img[i] * 77 + img[i + 1] * 150 + img[i + 2] * 29) >> 8]++;
  const clip = (img.length / 4) * 0.01;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > clip) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > clip) { hi = v; break; } }
  if (hi - lo < 30) return;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = (v - lo) * 255 / (hi - lo);
  for (let i = 0; i < img.length; i += 4) {
    img[i] = lut[img[i]]; img[i + 1] = lut[img[i + 1]]; img[i + 2] = lut[img[i + 2]];
  }
}

// Row-buffered 3x3 laplacian unsharp: v + amt*(v - 4-neighbour mean).
export function sharpen(img, w, h, amt = 0.6) {
  const prev = new Uint8ClampedArray(w * 4), curr = new Uint8ClampedArray(w * 4);
  prev.set(img.subarray(0, w * 4));
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    curr.set(img.subarray(row, row + w * 4));
    const below = y < h - 1 ? row + w * 4 : row;
    for (let x = 0; x < w; x++) {
      const l = (x > 0 ? x - 1 : 0) * 4, r = (x < w - 1 ? x + 1 : x) * 4, m = x * 4;
      for (let c = 0; c < 3; c++) {
        const v = curr[m + c];
        img[row + m + c] = v + amt * (4 * v - curr[l + c] - curr[r + c] - prev[m + c] - img[below + m + c]) / 4;
      }
    }
    prev.set(curr);
  }
}

// ---- the four enhance modes ----

// Enhance: shadow/cast removal in colour + contrast + crisp text.
export function enhance(img, w, h, s = 1) {
  flattenRGB(img, w, h, 1);
  stretch(img);
  sharpen(img, w, h, 0.6 * s);
}

// Enhance Pro: print-ready black & white document.
// ponytail: no adaptive-threshold window — divide-by-background IS the local
// adaptation; a global soft ramp after it is equivalent and far simpler.
export function enhancePro(img, w, h, s = 1) {
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++)
    g[j] = (img[i] * 77 + img[i + 1] * 150 + img[i + 2] * 29) >> 8;
  const { bg, dw, dh } = backgroundOf((x, y) => g[y * w + x], w, h);
  const lo = 60 + 50 * s, hi = 255 - 30 * s, f = 255 / (hi - lo);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) * dh / h - 0.5;
    for (let x = 0; x < w; x++) {
      const b = bilinear(bg, dw, dh, (x + 0.5) * dw / w - 0.5, v);
      const t = (255 * g[y * w + x] / (b < 1 ? 1 : b) - lo) * f; // soft ramp keeps antialiasing
      const i = (y * w + x) * 4;
      img[i] = img[i + 1] = img[i + 2] = t;
    }
  }
}

// Lighten: whiter, brighter page — colours kept, softer than Enhance.
export function lighten(img, w, h, s = 1) {
  flattenRGB(img, w, h, Math.min(1, 0.45 + 0.35 * s));
  const gamma = Math.max(0.6, 0.98 - 0.12 * s); // <1 lifts mids
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(v / 255, gamma);
  for (let i = 0; i < img.length; i += 4) {
    img[i] = lut[img[i]]; img[i + 1] = lut[img[i + 1]]; img[i + 2] = lut[img[i + 2]];
  }
}

// Mix: Enhance, then pull text toward solid black and page toward pure white
// while keeping ~45% colour (stamps/signatures stay visible).
export function mixMode(img, w, h, s = 1) {
  enhance(img, w, h, s);
  const lo = 90, hi = 235, f = 255 / (hi - lo);
  for (let i = 0; i < img.length; i += 4) {
    const g = (img[i] * 77 + img[i + 1] * 150 + img[i + 2] * 29) >> 8;
    let t = (g - lo) * f; t = t < 0 ? 0 : t > 255 ? 255 : t;
    img[i] = 0.45 * img[i] + 0.55 * t;
    img[i + 1] = 0.45 * img[i + 1] + 0.55 * t;
    img[i + 2] = 0.45 * img[i + 2] + 0.55 * t;
  }
}

export const PIPELINES = {
  original: () => {},
  enhance,
  pro: enhancePro,
  lighten,
  mix: mixMode,
};
