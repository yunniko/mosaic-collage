import type { Relief } from "../document/types";
import { blurInside } from "../raster/blur";
import type { Mask, RgbaImage } from "../raster/image";

/** The steepest slope (rise over run) paper takes before it tears: `depth` 1 reaches it (D011). */
export const MAX_SLOPE = 0.3;
/** Height a texture's lightness adds at `textureBump` 1, mm from darkest to lightest: paper grain, cloth weave. */
const BUMP_HEIGHT = 0.15;
/**
 * The slope is smoothed over this share of its width: paper bends over millimetres, so a bevel must not crease at
 * every sub-millimetre notch of a torn line.
 */
const SLOPE_SMOOTHING = 0.3;

/**
 * The relief's height above the flat paper (mm) at distance `d` (mm) inside the edge, or null for no relief.
 * `softness` rounds the slope; the height is scaled so the steepest point stays within `depth` × `MAX_SLOPE`.
 */
export function reliefProfile(r: Relief): ((d: number) => number) | null {
  if (r.style === "none" || r.size <= 0) return null;
  const s = r.softness;
  // Profile p(x) on 0..1: straight at softness 0, a quarter-round at 1. Its steepest slope is 1 + s, at the edge.
  const p = (x: number) => (x >= 1 ? 1 : x <= 0 ? 0 : (1 - s) * x + s * (1 - (1 - x) * (1 - x)));
  const height = (r.depth * MAX_SLOPE * r.size) / (1 + s);
  const size = r.size;
  switch (r.style) {
    case "bevel":
      return (d) => height * p(d / size);
    case "emboss":
      // A ridge: up over `size`, back down over the next `size`.
      return (d) => height * (d <= size ? p(d / size) : p(2 - d / size));
    case "pillow":
      // Pressed in: the edge stands high and the paper falls away inward.
      return (d) => height * (1 - p(d / size));
  }
}

/**
 * Lights the piece's relief in place (D011): a height field from the edge distance and the texture's lightness, its
 * normals by central differences, Lambertian shading relative to flat paper, so flat areas keep their colour.
 * `inside` is the distance to the edge in pixels; `scale` is px per mm.
 */
export function shadeRelief(image: RgbaImage, mask: Mask, inside: Float32Array, scale: number, r: Relief): void {
  const profile = reliefProfile(r);
  if (!profile && r.textureBump <= 0) return;
  const { width: w, height: h, data } = image;
  const m = mask.data;
  let height = new Float32Array(w * h);
  if (profile) {
    for (let i = 0; i < w * h; i++) if (m[i] > 0) height[i] = profile(inside[i] / scale);
    height = blurInside(height, mask, Math.round(SLOPE_SMOOTHING * r.size * scale));
  }
  const bump = (r.textureBump * BUMP_HEIGHT) / 255;
  if (bump > 0) {
    for (let i = 0; i < w * h; i++) {
      if (m[i] <= 0) continue;
      const k = i * 4;
      height[i] += bump * (0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2] - 127.5);
    }
  }

  const alt = (r.lightAltitude * Math.PI) / 180;
  const ang = (r.lightAngle * Math.PI) / 180;
  const lx = Math.cos(alt) * Math.cos(ang);
  const ly = Math.cos(alt) * Math.sin(ang);
  const lz = Math.sin(alt);
  // Height differences over two pixels, as a slope in mm per mm.
  const k2 = scale / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (m[i] <= 0) continue;
      const hc = height[i];
      // A neighbour outside the piece takes this pixel's height, so the cut edge itself makes no false slope.
      const at = (j: number) => (m[j] > 0 ? height[j] : hc);
      const hl = x > 0 ? at(i - 1) : hc;
      const hr = x < w - 1 ? at(i + 1) : hc;
      const hu = y > 0 ? at(i - w) : hc;
      const hd = y < h - 1 ? at(i + w) : hc;
      const gx = (hr - hl) * k2;
      const gy = (hd - hu) * k2;
      // The normal (-gx, -gy, 1) dotted with the direction to the light, relative to flat paper (n·L = sin alt).
      const shade = (-gx * lx - gy * ly + lz) / Math.sqrt(gx * gx + gy * gy + 1) / lz;
      if (shade === 1) continue;
      const f = shade < 0 ? 0 : shade;
      const k = i * 4;
      data[k] = data[k] * f;
      data[k + 1] = data[k + 1] * f;
      data[k + 2] = data[k + 2] * f;
    }
  }
}
