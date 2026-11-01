import type { Piece } from "../document/types";
import { type Polygon, polygonBounds } from "../geometry/polygon";
import { applyLayers, prepareLayers } from "../raster/blend";
import { type RgbaImage, createImage } from "../raster/image";
import { rasterizePolygon } from "../raster/rasterize";
import { type ImageLookup, textureSampling } from "../textures/sample";

/** A rendered piece: its pixels, and where the piece's local origin (its centroid) falls in them. */
export interface PieceSprite {
  image: RgbaImage;
  /** Pixel position of local (0, 0). */
  originX: number;
  originY: number;
  /** Pixels per millimetre the sprite was rendered at. */
  scale: number;
  /** True when an image texture was not decoded yet and a stand-in colour was drawn: do not cache this sprite. */
  pending: boolean;
}

/** Transparent pixels kept around the outline, so anti-aliased edges are never clipped. */
const PAD_PX = 2;

/** The largest sprite side; a piece asked for at a bigger scale is rendered at the scale that fits. */
export const MAX_SPRITE_PX = 4096;

/**
 * Renders a piece at `scale` px/mm: texture, then its colour layers in order, cut by the outline's coverage mask.
 * Each step is a pure function of the piece (and the decoded images it names), so the same pixels come out in a unit
 * test, on the boards and in an export.
 */
export function renderPiece(piece: Piece, outline: Polygon, requestedScale: number, images?: ImageLookup): PieceSprite {
  const b = polygonBounds(outline);
  const scale = Math.min(requestedScale, (MAX_SPRITE_PX - 2 * PAD_PX) / Math.max(b.maxX - b.minX, b.maxY - b.minY, 1));
  const width = Math.ceil((b.maxX - b.minX) * scale) + 2 * PAD_PX;
  const height = Math.ceil((b.maxY - b.minY) * scale) + 2 * PAD_PX;
  const originX = PAD_PX - b.minX * scale;
  const originY = PAD_PX - b.minY * scale;
  const px = outline.map((p) => ({ x: p.x * scale + originX, y: p.y * scale + originY }));
  const mask = rasterizePolygon(px, width, height);

  const tex = textureSampling(piece.texture, piece.textureTransform, b, images);
  const layers = prepareLayers(piece.colors);
  // A uniform texture gives one colour for the whole piece: compute it once.
  const flat = tex.uniform ? applyLayers(tex.sample(0, 0), layers) : null;

  const image = createImage(width, height);
  const d = image.data;
  for (let j = 0; j < height; j++) {
    const y = (j + 0.5 - originY) / scale;
    for (let i = 0; i < width; i++) {
      const m = mask.data[j * width + i];
      if (m <= 0) continue;
      const c = flat ?? applyLayers(tex.sample((i + 0.5 - originX) / scale, y), layers);
      const k = (j * width + i) * 4;
      d[k] = c[0] * 255;
      d[k + 1] = c[1] * 255;
      d[k + 2] = c[2] * 255;
      d[k + 3] = m * 255;
    }
  }
  return { image, originX, originY, scale, pending: tex.pending };
}
