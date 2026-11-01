import type { TextureSource, TextureTransform } from "../document/types";
import { FALLBACK_COLOR } from "../document/defaults";
import type { Bounds } from "../geometry/polygon";
import type { Rgb } from "../raster/blend";
import { type RgbaImage, parseHex } from "../raster/image";
import { sanitizeParams } from "../shapes/params";
import { findTextureGenerator } from "./generators";

/** Decoded image and PDF-page textures, by `textureImageKey`; undefined while one is still being decoded. */
export type ImageLookup = (key: string) => RgbaImage | undefined;

/** The key a texture's decoded pixels are found under, or null for a texture that needs none. */
export function textureImageKey(t: TextureSource): string | null {
  if (t.kind === "image") return t.assetId;
  if (t.kind === "pdf") return `${t.assetId}#${t.page}`;
  return null;
}

/** A colour at a point of the piece's local plane (mm), channels 0..1. */
export type Sampler = (x: number, y: number) => Rgb;

export interface TextureSampling {
  sample: Sampler;
  /** True when the texture is the uniform colour everywhere (plain, or an image not decoded yet). */
  uniform: boolean;
  /** True when the texture needs pixels that are not decoded yet: what is drawn now is a stand-in. */
  pending: boolean;
}

const toRgb = (hex: string): Rgb => parseHex(hex).map((c) => c / 255) as Rgb;

/** Colour stops spread evenly over 0..1, interpolated linearly. */
export function ramp(colors: readonly string[]): (t: number) => Rgb {
  const stops = (colors.length ? colors : [FALLBACK_COLOR]).map(toRgb);
  if (stops.length === 1) return () => stops[0];
  const last = stops.length - 1;
  return (t) => {
    const x = Math.min(last, Math.max(0, t * last));
    const i = Math.min(last - 1, Math.floor(x));
    const f = x - i;
    const a = stops[i];
    const b = stops[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  };
}

/**
 * The image read with wrap-around and bilinear filtering, composited over white so a transparent PNG reads as
 * paper. Coordinates are in image pixels.
 */
function imageSampler(img: RgbaImage): (px: number, py: number) => Rgb {
  const { width: w, height: h, data: d } = img;
  const wrap = (v: number, n: number) => ((v % n) + n) % n;
  const texel = (x: number, y: number, out: number[], k: number) => {
    const i = (wrap(y, h) * w + wrap(x, w)) * 4;
    const a = d[i + 3] / 255;
    out[0] += k * (1 - a + (a * d[i]) / 255);
    out[1] += k * (1 - a + (a * d[i + 1]) / 255);
    out[2] += k * (1 - a + (a * d[i + 2]) / 255);
  };
  return (px, py) => {
    const fx = px - 0.5;
    const fy = py - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const out = [0, 0, 0];
    texel(x0, y0, out, (1 - tx) * (1 - ty));
    texel(x0 + 1, y0, out, tx * (1 - ty));
    texel(x0, y0 + 1, out, (1 - tx) * ty);
    texel(x0 + 1, y0 + 1, out, tx * ty);
    return out as Rgb;
  };
}

/**
 * The texture as a function of the piece's local plane. The transform is applied about the centre of the piece's
 * bounds: q = R(-rotation)(p - centre - offset) / scale, so the texture turns and scales under the piece rather than
 * about some far-off origin. An image or PDF page at scale 1 covers the bounds exactly (centred, cropped on the
 * longer axis) and tiles beyond them. See D010.
 */
export function textureSampling(
  texture: TextureSource,
  transform: TextureTransform,
  bounds: Bounds,
  images: ImageLookup = () => undefined
): TextureSampling {
  const cx = (bounds.minX + bounds.maxX) / 2 + transform.offsetX;
  const cy = (bounds.minY + bounds.maxY) / 2 + transform.offsetY;
  const cos = Math.cos(-transform.rotation) / transform.scale;
  const sin = Math.sin(-transform.rotation) / transform.scale;
  const local = (field: (u: number, v: number) => Rgb): Sampler => {
    return (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      return field(dx * cos - dy * sin, dx * sin + dy * cos);
    };
  };
  const flat = (hex: string, pending = false): TextureSampling => {
    const c = toRgb(hex);
    return { sample: () => c, uniform: true, pending };
  };

  switch (texture.kind) {
    case "plain":
      return flat(texture.color);
    case "generated": {
      const gen = findTextureGenerator(texture.generatorId);
      if (!gen) return flat(FALLBACK_COLOR);
      const field = gen.field(sanitizeParams(gen.params, texture.params), texture.seed);
      const colorOf = ramp(texture.colors);
      return { sample: local((u, v) => colorOf(field(u, v))), uniform: false, pending: false };
    }
    case "image":
    case "pdf": {
      const img = images(textureImageKey(texture)!);
      if (!img) return flat(FALLBACK_COLOR, true);
      const w = Math.max(bounds.maxX - bounds.minX, 1e-6);
      const h = Math.max(bounds.maxY - bounds.minY, 1e-6);
      // Cover: the fewest image pixels per mm that still span both sides of the bounds.
      const pxPerMm = Math.min(img.width / w, img.height / h);
      const read = imageSampler(img);
      const ox = img.width / 2;
      const oy = img.height / 2;
      return { sample: local((u, v) => read(u * pxPerMm + ox, v * pxPerMm + oy)), uniform: false, pending: false };
    }
  }
}
