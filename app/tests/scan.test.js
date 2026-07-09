import { describe, it, expect } from "vitest";
import { homography, applyH, outputSize, warp, enhance, enhancePro, lighten, mixMode, deskewAngle, quadRot } from "../src/features/scanner/scan.js";

// synthetic "photo": W x H, background is a shaded gradient (uneven lighting),
// with a dark ink square glyph — no DOM needed.
function synth(W = 64, H = 64) {
  const img = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const bg = 160 + (70 * x) / W; // 160..230 left-to-right shadow
      img[i] = bg; img[i + 1] = bg - 6; img[i + 2] = bg - 12; // yellowish cast
      img[i + 3] = 255;
    }
  }
  // glyph: 8x8 dark square at (12,12)
  for (let y = 12; y < 20; y++) for (let x = 12; x < 20; x++) {
    const i = (y * W + x) * 4;
    img[i] = 40; img[i + 1] = 40; img[i + 2] = 40;
  }
  return img;
}
const px = (img, W, x, y) => img[(y * W + x) * 4];

describe("homography", () => {
  it("maps the four corners exactly (round-trip)", () => {
    const out = [[0, 0], [400, 0], [400, 600], [0, 600]];
    const src = [[35, 20], [380, 55], [360, 580], [15, 540]];
    const H = homography(out, src);
    for (let i = 0; i < 4; i++) {
      const [x, y] = applyH(H, out[i][0], out[i][1]);
      expect(x).toBeCloseTo(src[i][0], 6);
      expect(y).toBeCloseTo(src[i][1], 6);
    }
  });
});

describe("outputSize", () => {
  it("upscales to >=1600 long edge, keeps quad proportions, caps at 3508", () => {
    const s = outputSize([[0, 0], [400, 0], [400, 600], [0, 600]]);
    expect(Math.max(s.w, s.h)).toBe(1600);
    expect(s.w / s.h).toBeCloseTo(400 / 600, 1);
    const big = outputSize([[0, 0], [4000, 0], [4000, 6000], [0, 6000]]);
    expect(Math.max(big.w, big.h)).toBe(3508);
  });
});

describe("warp", () => {
  it("identity quad reproduces the image", () => {
    const W = 32, H = 32;
    const img = synth(W, H);
    const out = warp(img, W, H, [[0, 0], [W, 0], [W, H], [0, H]], W, H);
    // interior pixels essentially unchanged
    expect(Math.abs(px(out, W, 15, 15) - px(img, W, 15, 15))).toBeLessThanOrEqual(3);
    expect(Math.abs(px(out, W, 14, 14) - px(img, W, 14, 14))).toBeLessThanOrEqual(6); // glyph edge
  });
});

describe("auto-straighten", () => {
  it("detects a ~3 degree tilt and quadRot(warp) removes it", () => {
    const W = 240, H = 240;
    const img = new Uint8ClampedArray(W * H * 4).fill(255);
    const s = Math.tan((3 * Math.PI) / 180);
    // dark 3px "text lines" every 24px, tilted: y = y0 + (x - W/2) * s
    for (let y0 = 40; y0 < 200; y0 += 24) {
      for (let x = 20; x < 220; x++) {
        const y = Math.round(y0 + (x - W / 2) * s);
        for (let dy = 0; dy < 3; dy++) {
          const i = ((y + dy) * W + x) * 4;
          img[i] = img[i + 1] = img[i + 2] = 30;
        }
      }
    }
    const a = deskewAngle(img, W, H);
    expect(Math.abs(Math.abs(a) - 3)).toBeLessThan(0.6);
    const out = warp(img, W, H, quadRot(W, H, a), W, H);
    // a line's left and right ends must now sit on the same row
    const firstDark = (x) => { for (let y = 30; y < 210; y++) if (out[(y * W + x) * 4] < 120) return y; return -1; };
    expect(Math.abs(firstDark(40) - firstDark(200))).toBeLessThanOrEqual(2);
  });

  it("returns 0 on a blank page (never rotates on a guess)", () => {
    const img = new Uint8ClampedArray(64 * 64 * 4).fill(230);
    expect(deskewAngle(img, 64, 64)).toBe(0);
  });
});

describe("enhance modes (content preserved, background cleaned)", () => {
  it("Enhance whitens the shaded background and keeps the glyph dark", () => {
    const img = synth();
    enhance(img, 64, 64, 1);
    expect(px(img, 64, 50, 50)).toBeGreaterThan(235); // bg -> near white
    expect(px(img, 64, 15, 15)).toBeLessThan(120);    // glyph stays ink
  });
  it("Enhance Pro produces print B&W: pure white bg, solid black glyph", () => {
    const img = synth();
    enhancePro(img, 64, 64, 1);
    expect(px(img, 64, 50, 50)).toBe(255);
    expect(px(img, 64, 15, 15)).toBe(0);
    // grayscale: channels equal
    const i = (50 * 64 + 50) * 4;
    expect(img[i]).toBe(img[i + 1]);
  });
  it("Lighten brightens everything but keeps the glyph visible", () => {
    const img = synth();
    const bgBefore = px(img, 64, 50, 50);
    lighten(img, 64, 64, 1);
    expect(px(img, 64, 50, 50)).toBeGreaterThan(bgBefore);
    expect(px(img, 64, 15, 15)).toBeLessThan(160);
  });
  it("Mix whitens the page and pushes the glyph toward black", () => {
    const img = synth();
    mixMode(img, 64, 64, 1);
    expect(px(img, 64, 50, 50)).toBeGreaterThan(230);
    expect(px(img, 64, 15, 15)).toBeLessThan(80);
  });
});
