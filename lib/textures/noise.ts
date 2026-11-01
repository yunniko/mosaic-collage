import { createRng } from "../random";

/**
 * Seeded gradient (Perlin-style) noise in 2D, optionally periodic so textures tile without seams.
 * Returns values in roughly [-1, 1].
 */
export class Noise2D {
  private perm: Uint8Array;
  private gx: Float32Array;
  private gy: Float32Array;

  constructor(seed: number) {
    const rng = createRng(seed);
    this.perm = new Uint8Array(512);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.gx = new Float32Array(256);
    this.gy = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const a = rng() * Math.PI * 2;
      this.gx[i] = Math.cos(a);
      this.gy[i] = Math.sin(a);
    }
  }

  /**
   * Noise at (x, y). With `period` > 0 the result repeats every `period` units along x, and every `periodY` units along
   * y (default: the same). Periods are rounded; one over 256 (the lattice size) can't repeat and is refused.
   */
  sample(x: number, y: number, period = 0, periodY = period): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    if (period > 256 || periodY > 256) throw new RangeError(`Noise period ${Math.max(period, periodY)} exceeds the 256-cell lattice`);
    const wrap = (v: number, period: number) => {
      const per = Math.max(0, Math.round(period));
      return (per > 0 ? ((v % per) + per) % per : v) & 255;
    };
    const x0 = wrap(xi, period);
    const x1 = wrap(xi + 1, period);
    const y0 = wrap(yi, periodY);
    const y1 = wrap(yi + 1, periodY);
    const h = (ix: number, iy: number) => this.perm[this.perm[ix] + iy];
    const g = (hash: number, dx: number, dy: number) => this.gx[hash] * dx + this.gy[hash] * dy;
    const n00 = g(h(x0, y0), xf, yf);
    const n10 = g(h(x1, y0), xf - 1, yf);
    const n01 = g(h(x0, y1), xf, yf - 1);
    const n11 = g(h(x1, y1), xf - 1, yf - 1);
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const nx0 = n00 + u * (n10 - n00);
    const nx1 = n01 + u * (n11 - n01);
    return (nx0 + v * (nx1 - nx0)) * 1.4142;
  }

  /** Fractal sum of `octaves` layers, each at double the frequency and `gain` times the amplitude. */
  fbm(x: number, y: number, octaves = 4, gain = 0.5, period = 0, periodY = period): number {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.sample(x * freq, y * freq, period > 0 ? period * freq : 0, periodY > 0 ? periodY * freq : 0);
      norm += amp;
      amp *= gain;
      freq *= 2;
    }
    return sum / norm;
  }
}

/** One-dimensional noise along a line (for torn edges): `fbm` on a row of the 2D field. */
export function noise1D(noise: Noise2D, t: number, octaves = 4, gain = 0.5): number {
  return noise.fbm(t, 17.31, octaves, gain);
}
