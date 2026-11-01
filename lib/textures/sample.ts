import type { TextureSource, TextureTransform } from "../document/types";
import { FALLBACK_COLOR } from "../document/defaults";
import type { Bounds } from "../geometry/polygon";
import { type Rgb, hexToRgb, lerpRgb } from "../raster/blend";
import type { RgbaImage } from "../raster/image";
import { sanitizeParams } from "../shapes/params";
import { findTextureGenerator } from "./generators";
import { clamp01 } from "./generators/registry";

/**
 * Decoded image and PDF-page textures, by `textureImageKey`: the pixels, `"failed"` when the file could not be
 * decoded (the piece is then drawn in the fallback colour for good), or undefined while it is still being decoded.
 */
export type ImageLookup = (key: string) => RgbaImage | "failed" | undefined;

/** The key a texture's decoded pixels are found under, or null for a texture that needs none. */
export function textureImageKey(t: TextureSource): string | null {
  if (t.kind === "image") return t.assetId;
  if (t.kind === "pdf") return `${t.assetId}#${t.page}`;
  return null;
}

/** The inverse of `textureImageKey`: the asset, and the PDF page (null for an image). */
export function parseTextureImageKey(key: string): { assetId: string; page: number | null } {
  const at = key.indexOf("#");
  return at < 0 ? { assetId: key, page: null } : { assetId: key.slice(0, at), page: Number(key.slice(at + 1)) };
}

/** A colour at a point of the piece's local plane (mm), channels 0..1. */
export type Sampler = (x: number, y: number) => Rgb;

/**
 * A texture prepared for sampling, in the form that lets the renderer do the least work per pixel:
 * - `flat`: one colour everywhere. `pending` when it stands in for an image not decoded yet.
 * - `field`: a generated scalar field (0..1) through a colour ramp, so the colour of a pixel depends on one number.
 * - `image`: decoded pixels.
 * Every kind also offers `sample`, the colour at a point.
 */
export type TextureSampling =
  | { kind: "flat"; color: Rgb; pending: boolean; sample: Sampler }
  | { kind: "field"; value: (x: number, y: number) => number; ramp: (t: number) => Rgb; sample: Sampler }
  | { kind: "image"; sample: Sampler };

/** Colour stops spread evenly over 0..1, interpolated linearly. */
export function ramp(colors: readonly string[]): (t: number) => Rgb {
  const stops = (colors.length ? colors : [FALLBACK_COLOR]).map(hexToRgb);
  if (stops.length === 1) return () => stops[0];
  const last = stops.length - 1;
  return (t) => {
    const x = clamp01(t) * last;
    const i = Math.min(last - 1, Math.floor(x));
    return lerpRgb(stops[i], stops[i + 1], x - i);
  };
}

const mod = (v: number, n: number) => ((v % n) + n) % n;

/**
 * The image read with wrap-around and bilinear filtering, composited over white so a transparent PNG reads as
 * paper. Coordinates are in image pixels.
 */
function imageSampler(img: RgbaImage): (px: number, py: number) => Rgb {
  const { width: w, height: h, data: d } = img;
  return (px, py) => {
    const fx = px - 0.5;
    const fy = py - 0.5;
    let x0 = Math.floor(fx);
    let y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    // Inside the image (the usual case) no wrapping is needed.
    let x1 = x0 + 1;
    let y1 = y0 + 1;
    if (x0 < 0 || x1 >= w) [x0, x1] = [mod(x0, w), mod(x1, w)];
    if (y0 < 0 || y1 >= h) [y0, y1] = [mod(y0, h), mod(y1, h)];
    let r = 0;
    let g = 0;
    let b = 0;
    const add = (x: number, y: number, k: number) => {
      const i = (y * w + x) * 4;
      const a = d[i + 3] / 255;
      const white = 1 - a;
      const ka = (k * a) / 255;
      r += k * white + ka * d[i];
      g += k * white + ka * d[i + 1];
      b += k * white + ka * d[i + 2];
    };
    add(x0, y0, (1 - tx) * (1 - ty));
    add(x1, y0, tx * (1 - ty));
    add(x0, y1, (1 - tx) * ty);
    add(x1, y1, tx * ty);
    return [r, g, b];
  };
}

/**
 * The texture as a function of the piece's local plane. The transform is applied about the centre of the piece's
 * bounds: q = R(-rotation)(p - centre - offset) / scale, so the texture turns and scales under the piece rather than
 * about some far-off origin. An image or PDF page at scale 1 covers the bounds exactly (centred, cropped on the
 * longer axis) and tiles beyond them. See D010.
 */
export function textureSampling(texture: TextureSource, transform: TextureTransform, bounds: Bounds, images: ImageLookup): TextureSampling {
  const cx = (bounds.minX + bounds.maxX) / 2 + transform.offsetX;
  const cy = (bounds.minY + bounds.maxY) / 2 + transform.offsetY;
  const cos = Math.cos(-transform.rotation) / transform.scale;
  const sin = Math.sin(-transform.rotation) / transform.scale;
  function local<T>(f: (u: number, v: number) => T): (x: number, y: number) => T {
    return (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      return f(dx * cos - dy * sin, dx * sin + dy * cos);
    };
  }
  const flat = (hex: string, pending = false): TextureSampling => {
    const color = hexToRgb(hex);
    return { kind: "flat", color, pending, sample: () => color };
  };

  switch (texture.kind) {
    case "plain":
      return flat(texture.color);
    case "generated": {
      const gen = findTextureGenerator(texture.generatorId);
      if (!gen) return flat(FALLBACK_COLOR);
      const value = local(gen.field(sanitizeParams(gen.params, texture.params), texture.seed));
      const colorOf = ramp(texture.colors);
      return { kind: "field", value, ramp: colorOf, sample: (x, y) => colorOf(value(x, y)) };
    }
    case "image":
    case "pdf": {
      const img = images(textureImageKey(texture)!);
      if (img === undefined) return flat(FALLBACK_COLOR, true);
      if (img === "failed") return flat(FALLBACK_COLOR);
      const w = Math.max(bounds.maxX - bounds.minX, 1e-6);
      const h = Math.max(bounds.maxY - bounds.minY, 1e-6);
      // Cover: the fewest image pixels per mm that still span both sides of the bounds.
      const pxPerMm = Math.min(img.width / w, img.height / h);
      const read = imageSampler(img);
      const ox = img.width / 2;
      const oy = img.height / 2;
      return { kind: "image", sample: local((u, v) => read(u * pxPerMm + ox, v * pxPerMm + oy)) };
    }
  }
}
