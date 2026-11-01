/**
 * A straight (not premultiplied) RGBA image, the same layout as the browser's ImageData, so the raster pipeline runs
 * unchanged in unit tests and in the page (D006).
 */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** A coverage mask: 0 outside the shape, 1 inside, fractional along anti-aliased edges. */
export interface Mask {
  width: number;
  height: number;
  data: Float32Array;
}

export const createImage = (width: number, height: number): RgbaImage => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});
export const createMask = (width: number, height: number): Mask => ({ width, height, data: new Float32Array(width * height) });

/** Parses "#rrggbb" to 0..255 channels. */
export function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function fillImage(img: RgbaImage, hex: string, alpha = 255): RgbaImage {
  const [r, g, b] = parseHex(hex);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = alpha;
  }
  return img;
}
