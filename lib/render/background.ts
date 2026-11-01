import type { Background } from "../document/types";
import { type Bounds, boundsHeight, boundsWidth } from "../geometry/polygon";
import { type RgbaImage, createImage } from "../raster/image";
import { type ImageLookup, textureSampling } from "../textures/sample";
import { pixelColor } from "./piece";

/** A rendered background. */
interface BackgroundImage {
  image: RgbaImage;
  /** True when an image texture was not decoded yet and a stand-in colour was drawn. */
  pending: boolean;
}

/** The pixel size of `bounds` at `scale`: at least one pixel each way. */
export function backgroundSize(bounds: Bounds, scale: number): { width: number; height: number } {
  return {
    width: Math.max(1, Math.ceil(boundsWidth(bounds) * scale)),
    height: Math.max(1, Math.ceil(boundsHeight(bounds) * scale)),
  };
}

/**
 * The background over the artwork's bounds (board mm), opaque. Its texture is laid on those bounds as a piece's is on
 * the piece's (D014): an image covers them at scale 1 and the transform shifts, scales and turns it about their centre.
 */
export function renderBackground(bg: Background, bounds: Bounds, scale: number, images: ImageLookup): BackgroundImage {
  const { width, height } = backgroundSize(bounds, scale);
  const tex = textureSampling(bg.texture, bg.transform, bounds, images);
  const colorAt = pixelColor(tex, []);
  const image = createImage(width, height);
  const d = image.data;
  for (let j = 0; j < height; j++) {
    const y = bounds.minY + (j + 0.5) / scale;
    for (let i = 0; i < width; i++) {
      const c = colorAt(bounds.minX + (i + 0.5) / scale, y);
      const k = (j * width + i) * 4;
      d[k] = c[0] * 255;
      d[k + 1] = c[1] * 255;
      d[k + 2] = c[2] * 255;
      d[k + 3] = 255;
    }
  }
  return { image, pending: tex.kind === "flat" && tex.pending };
}
