import type { TornOutline } from "../edges/tear";
import { type Rgb, lerpRgb, luma } from "../raster/blend";
import { blurInside } from "../raster/blur";
import type { Mask, RgbaImage } from "../raster/image";

/** Diameter of a loose fibre, mm: wood and cotton fibres are 20–40 µm across. */
const FIBRE_WIDTH = 0.03;
/** Opacity of the fuzz right at the torn line; it fades to nothing at the fuzz width. */
const FUZZ_ALPHA = 0.35;
/** Opacity of the band at its outer lip, where the bevelled paper is thinnest (the reference gives about 0.4). */
const LIP_ALPHA = 0.4;
/** Width over which the band's inner boundary blends into the face, mm. */
const BAND_SOFTNESS = 0.08;
/**
 * The band's cover is smoothed over this distance, mm: its inner boundary follows the torn line's notches, and
 * without it each notch leaves a hard step where the nearest vertex changes.
 */
const BAND_SMOOTHING = 0.12;

const WHITE: Rgb = [1, 1, 1];

/** The colour of exposed paper core: the face colour, greyer and paler (D011). */
export function coreColor(c: Rgb): Rgb {
  const l = luma(c[0], c[1], c[2]);
  return lerpRgb(lerpRgb(c, [l, l, l], 0.5), WHITE, 0.5);
}

/** The outline's vertices bucketed in a pixel grid, to find the nearest one to a pixel near the edge. */
class VertexGrid {
  private readonly starts: Int32Array;
  private readonly items: Int32Array;
  private readonly cols: number;
  private readonly rows: number;

  constructor(
    private readonly xs: Float32Array,
    private readonly ys: Float32Array,
    width: number,
    height: number,
    private readonly cell: number
  ) {
    this.cols = Math.ceil(width / cell) + 1;
    this.rows = Math.ceil(height / cell) + 1;
    const count = new Int32Array(this.cols * this.rows + 1);
    const cellOf = (i: number) => this.cellIndex(xs[i], ys[i]);
    for (let i = 0; i < xs.length; i++) count[cellOf(i) + 1]++;
    for (let c = 1; c < count.length; c++) count[c] += count[c - 1];
    this.starts = count.slice();
    this.items = new Int32Array(xs.length);
    const fill = count;
    for (let i = 0; i < xs.length; i++) this.items[fill[cellOf(i)]++] = i;
  }

  private cellIndex(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cell)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cell)));
    return cy * this.cols + cx;
  }

  /** The nearest vertex within about one cell of (x, y), or -1. */
  nearest(x: number, y: number): number {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    let best = -1;
    let bestD = Infinity;
    for (let gy = Math.max(0, cy - 1); gy <= Math.min(this.rows - 1, cy + 1); gy++) {
      for (let gx = Math.max(0, cx - 1); gx <= Math.min(this.cols - 1, cx + 1); gx++) {
        const c = gy * this.cols + gx;
        for (let k = this.starts[c]; k < this.starts[c + 1]; k++) {
          const i = this.items[k];
          const d = (this.xs[i] - x) ** 2 + (this.ys[i] - y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    return best;
  }
}

/** Where the sprite's pixels are in the piece's mm frame. */
export interface SpriteFrame {
  scale: number;
  originX: number;
  originY: number;
}

/**
 * Draws a torn edge onto a rendered piece (D011). `paintBand` lightens the exposed core inside the line before the
 * relief is lit; `paintFibres` adds the fuzz and the loose wisps outside it afterwards, since they stand off the paper.
 */
export class TornEdgePainter {
  private readonly grid: VertexGrid;
  /** Deepest the band reaches inside the line, mm. */
  private readonly bandReach: number;

  constructor(
    private readonly tear: TornOutline,
    private readonly frame: SpriteFrame,
    width: number,
    height: number,
    /** Fixed core colour, or null to take it from the face colour. */
    private readonly rimColor: Rgb | null
  ) {
    const { scale, originX, originY } = frame;
    const xs = new Float32Array(tear.outline.map((p) => p.x * scale + originX));
    const ys = new Float32Array(tear.outline.map((p) => p.y * scale + originY));
    let widest = 0;
    for (const b of tear.band) widest = Math.max(widest, b);
    this.bandReach = widest + BAND_SOFTNESS;
    const cell = Math.max(this.bandReach, tear.fuzzWidth) * scale + 1;
    this.grid = new VertexGrid(xs, ys, width, height, Math.max(2, cell));
  }

  private core(c: Rgb): Rgb {
    return this.rimColor ?? coreColor(c);
  }

  /** Lightens the band inside the torn line and thins the paper toward the lip. `inside` is in px. */
  paintBand(image: RgbaImage, mask: Mask, inside: Float32Array): void {
    const { scale } = this.frame;
    const { width: w, height: h, data } = image;
    const m = mask.data;
    const { band } = this.tear;
    // How much of each pixel is core, and how much of its paper the lip has thinned away; both smoothed.
    let cover = new Float32Array(w * h);
    let thin = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const d = inside[i] / scale;
        // Most of a sprite lies deeper than any band: skip the vertex lookup there.
        if (m[i] <= 0 || d >= this.bandReach) continue;
        const v = this.grid.nearest(x + 0.5, y + 0.5);
        if (v < 0) continue;
        const bw = band[v];
        if (bw <= 0 || d >= bw + BAND_SOFTNESS) continue;
        cover[i] = Math.min(1, (bw + BAND_SOFTNESS - d) / BAND_SOFTNESS);
        thin[i] = cover[i] * (1 - Math.min(1, d / bw));
      }
    }
    const radius = Math.round(BAND_SMOOTHING * scale);
    cover = blurInside(cover, mask, radius);
    thin = blurInside(thin, mask, radius);
    for (let i = 0; i < w * h; i++) {
      if (cover[i] <= 0) continue;
      const k = i * 4;
      const face: Rgb = [data[k] / 255, data[k + 1] / 255, data[k + 2] / 255];
      const c = lerpRgb(face, this.core(face), cover[i]);
      data[k] = c[0] * 255;
      data[k + 1] = c[1] * 255;
      data[k + 2] = c[2] * 255;
      data[k + 3] *= 1 - (1 - LIP_ALPHA) * thin[i];
    }
  }

  /**
   * The fuzz fringe outside the line and the loose wisps, composited over the sprite. `outside` is the distance to
   * the line in px; `colorAt` gives the face colour at a point in mm, so fibres share the paper's own core colour.
   */
  paintFibres(image: RgbaImage, outside: Float32Array, colorAt: (x: number, y: number) => Rgb): void {
    const { scale, originX, originY } = this.frame;
    const { width: w, height: h } = image;
    const toMmX = (px: number) => (px - originX) / scale;
    const toMmY = (py: number) => (py - originY) / scale;
    const { fuzzWidth, torn } = this.tear;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const d = outside[i] / scale;
        if (d <= 0 || d >= fuzzWidth) continue;
        const v = this.grid.nearest(x + 0.5, y + 0.5);
        if (v < 0 || torn[v] <= 0) continue;
        const f = 1 - d / fuzzWidth;
        over(image, i, this.core(colorAt(toMmX(x + 0.5), toMmY(y + 0.5))), torn[v] * FUZZ_ALPHA * f * f);
      }
    }
    // A fibre thinner than a pixel is drawn one pixel wide at its share of the pixel, so it fades out when zoomed out.
    const widthPx = FIBRE_WIDTH * scale;
    const half = Math.max(0.5, widthPx / 2);
    const coverage = Math.min(1, widthPx);
    for (const wisp of this.tear.wisps) {
      const root = wisp.points[0];
      const color = this.core(colorAt(root.x, root.y));
      for (let s = 0; s + 1 < wisp.points.length; s++) {
        const ax = wisp.points[s].x * scale + originX;
        const ay = wisp.points[s].y * scale + originY;
        const bx = wisp.points[s + 1].x * scale + originX;
        const by = wisp.points[s + 1].y * scale + originY;
        drawSegment(image, ax, ay, bx, by, half, (i, cover) => over(image, i, color, wisp.alpha * coverage * cover));
      }
    }
  }
}

/** Composites `color` at `alpha` over pixel `i` of a straight-alpha image. */
function over(image: RgbaImage, i: number, color: Rgb, alpha: number) {
  if (alpha <= 0) return;
  const d = image.data;
  const k = i * 4;
  const da = d[k + 3] / 255;
  const oa = alpha + da * (1 - alpha);
  if (oa <= 0) return;
  for (let c = 0; c < 3; c++) d[k + c] = (color[c] * 255 * alpha + d[k + c] * da * (1 - alpha)) / oa;
  d[k + 3] = oa * 255;
}

/** Calls `plot` for each pixel within `half` px of segment ab, with an anti-aliased coverage 0..1. */
function drawSegment(
  image: RgbaImage,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  half: number,
  plot: (i: number, cover: number) => void
) {
  const { width: w, height: h } = image;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - half - 1));
  const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + half + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - half - 1));
  const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + half + 1));
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const dist = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
      const cover = Math.min(1, Math.max(0, half + 0.5 - dist));
      if (cover > 0) plot(y * w + x, cover);
    }
  }
}
