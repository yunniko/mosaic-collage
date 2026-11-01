import type { BlendMode, ColorLayer } from "../document/types";
import { parseHex } from "./image";

/**
 * Colour maths for a piece's colour layers. Channels are 0..1 floats. Blend modes follow the W3C Compositing and
 * Blending Level 1 formulas (https://www.w3.org/TR/compositing-1/#blending), the ones CSS and Canvas use, so a layer
 * looks the same here as it would in a browser or an image editor. A piece is opaque wherever it is drawn, so the
 * spec's alpha terms reduce to `(1 - opacity) * backdrop + opacity * B(backdrop, source)`.
 */
export type Rgb = [number, number, number];

/** A `#rrggbb` colour as 0..1 channels. */
export const hexToRgb = (hex: string): Rgb => parseHex(hex).map((v) => v / 255) as Rgb;

/** `a` moved toward `b` by `t` (0 gives a, 1 gives b), per channel. */
/** Relative luminance of a colour (Rec. 709 weights), on the colour's own 0..1 or 0..255 scale. */
export const luma = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export const lerpRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

type Separable = (cb: number, cs: number) => number;

const hardLight: Separable = (cb, cs) => (cs <= 0.5 ? cb * 2 * cs : screen(cb, 2 * cs - 1));
const screen: Separable = (cb, cs) => cb + cs - cb * cs;

const SEPARABLE: Partial<Record<BlendMode, Separable>> = {
  normal: (_cb, cs) => cs,
  multiply: (cb, cs) => cb * cs,
  screen,
  overlay: (cb, cs) => hardLight(cs, cb),
  darken: Math.min,
  lighten: Math.max,
  "color-dodge": (cb, cs) => (cb === 0 ? 0 : cs >= 1 ? 1 : Math.min(1, cb / (1 - cs))),
  "color-burn": (cb, cs) => (cb >= 1 ? 1 : cs <= 0 ? 0 : 1 - Math.min(1, (1 - cb) / cs)),
  "hard-light": hardLight,
  "soft-light": (cb, cs) => {
    if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb);
    const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
    return cb + (2 * cs - 1) * (d - cb);
  },
  difference: (cb, cs) => Math.abs(cb - cs),
  exclusion: (cb, cs) => cb + cs - 2 * cb * cs,
};

const lum = (c: Rgb) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

function clipColor(c: Rgb): Rgb {
  const l = lum(c);
  const n = Math.min(c[0], c[1], c[2]);
  const x = Math.max(c[0], c[1], c[2]);
  let out: Rgb = c;
  if (n < 0) out = out.map((v) => l + ((v - l) * l) / (l - n)) as Rgb;
  if (x > 1) out = out.map((v) => l + ((v - l) * (1 - l)) / (x - l)) as Rgb;
  return out;
}

function setLum(c: Rgb, l: number): Rgb {
  const d = l - lum(c);
  return clipColor([c[0] + d, c[1] + d, c[2] + d]);
}

const sat = (c: Rgb) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);

function setSat(c: Rgb, s: number): Rgb {
  const max = Math.max(c[0], c[1], c[2]);
  const min = Math.min(c[0], c[1], c[2]);
  if (max === min) return [0, 0, 0];
  return c.map((v) => ((v - min) * s) / (max - min)) as Rgb;
}

const NON_SEPARABLE: Partial<Record<BlendMode, (cb: Rgb, cs: Rgb) => Rgb>> = {
  hue: (cb, cs) => setLum(setSat(cs, sat(cb)), lum(cb)),
  saturation: (cb, cs) => setLum(setSat(cb, sat(cs)), lum(cb)),
  color: (cb, cs) => setLum(cs, lum(cb)),
  luminosity: (cb, cs) => setLum(cb, lum(cs)),
};

/** B(backdrop, source) for `mode`, before opacity. */
export function blend(mode: BlendMode, cb: Rgb, cs: Rgb): Rgb {
  const f = SEPARABLE[mode];
  if (f) return [f(cb[0], cs[0]), f(cb[1], cs[1]), f(cb[2], cs[2])];
  return NON_SEPARABLE[mode]!(cb, cs);
}

export function rgbToHsl([r, g, b]: Rgb): Rgb {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]: Rgb): Rgb {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const k = h / 360;
  return [hue(k + 1 / 3), hue(k), hue(k - 1 / 3)];
}

/**
 * Hue turned by `hue` degrees; saturation and lightness pushed toward full (positive) or none (negative) by the given
 * share, the way an image editor's Hue/Saturation dialog does: +1 saturation is fully saturated, -1 grey; +1 lightness
 * white, -1 black.
 */
export function adjustHsl(c: Rgb, hue: number, saturation: number, lightness: number): Rgb {
  const [h, s, l] = rgbToHsl(c);
  const toward = (v: number, k: number) => (k >= 0 ? v + (1 - v) * k : v * (1 + k));
  // A grey has no hue to strengthen: raising its saturation would invent one (red, hue 0), so it stays grey.
  return hslToRgb([h + hue, s === 0 ? 0 : toward(s, saturation), toward(l, lightness)]);
}

/** A colour layer prepared once per render: the tint's colour parsed, so the per-pixel step does arithmetic only. */
export type PreparedLayer =
  { kind: "tint"; color: Rgb; mode: BlendMode; opacity: number } | { kind: "hsl"; hue: number; saturation: number; lightness: number };

export function prepareLayers(layers: readonly ColorLayer[]): PreparedLayer[] {
  return layers.map((l) => (l.kind === "tint" ? { ...l, color: hexToRgb(l.color) } : l));
}

/** The colour layers applied in order over the texture colour `c`. */
export function applyLayers(c: Rgb, layers: readonly PreparedLayer[]): Rgb {
  let out = c;
  for (const l of layers) {
    if (l.kind === "hsl") {
      out = adjustHsl(out, l.hue, l.saturation, l.lightness);
      continue;
    }
    out = lerpRgb(out, blend(l.mode, out, l.color), l.opacity);
  }
  return out;
}
