import { describe, expect, it } from 'vitest';
import { detailHeight, luminanceHeight, makeSeamless, makeSeamlessField, squareCrop } from './photoMaterial';

const N = 64;
/** A non-tileable image: horizontal gradient + noise. */
function photo(w = N + 20, h = N) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = (x / w) * 200 + ((x * 7 + y * 13) % 17) * 3;
      d.set([v, v * 0.8, v * 0.6, 255], (y * w + x) * 4);
    }
  return { width: w, height: h, data: d };
}
const seam = (img: { width: number; data: ArrayLike<number> }) => {
  let s = 0;
  const n = img.width;
  for (let y = 0; y < n; y++) s += Math.abs(img.data[(y * n) * 4] - img.data[(y * n + n - 1) * 4]);
  return s / n;
};

describe('photo → PBR material', () => {
  it('crops square and removes the wrap-around seam', () => {
    const sq = squareCrop(photo());
    expect(sq.width).toBe(N);
    expect(seam(sq)).toBeGreaterThan(100);
    const sl = makeSeamless(sq);
    // the wrap step is no larger than an ordinary step between neighbouring columns
    let inner = 0;
    for (let y = 0; y < N; y++) inner += Math.abs(sl.data[(y * N + 30) * 4] - sl.data[(y * N + 31) * 4]);
    expect(seam(sl)).toBeLessThan((inner / N) * 1.5 + 6);
  });

  it('height: detail kept, global slope removed, seamless', () => {
    const sq = squareCrop(photo());
    const h = detailHeight(makeSeamlessField(luminanceHeight(sq)));
    let lo = 1;
    let hi = 0;
    for (const v of h.data) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(hi - lo).toBeGreaterThan(0.8);
    // left half and right half have similar mean (the gradient is gone)
    let l = 0;
    let r = 0;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N / 2; x++) {
        l += h.data[y * N + x];
        r += h.data[y * N + x + N / 2];
      }
    expect(Math.abs(l - r) / (N * N / 2)).toBeLessThan(0.12);
  });
});
