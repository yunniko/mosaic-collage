import type { Piece } from "../document/types";
import { type Polygon, polygonBounds } from "../geometry/polygon";
import { type RgbaImage, createImage, fillImage } from "../raster/image";
import { rasterizePolygon } from "../raster/rasterize";

/** A rendered piece: its pixels, and where the piece's local origin (its centroid) falls in them. */
export interface PieceSprite {
  image: RgbaImage;
  /** Pixel position of local (0, 0). */
  originX: number;
  originY: number;
  /** Pixels per millimetre the sprite was rendered at. */
  scale: number;
}

/** Transparent pixels kept around the outline, so anti-aliased edges are never clipped. */
const PAD_PX = 2;

/** The largest sprite side; a piece asked for at a bigger scale is rendered at the scale that fits. */
export const MAX_SPRITE_PX = 4096;

/**
 * Renders a piece at `scale` px/mm. Each step is a pure function of the piece, so the same pixels come out in a unit
 * test, on the boards and in an export.
 */
export function renderPiece(piece: Piece, outline: Polygon, requestedScale: number): PieceSprite {
  const b = polygonBounds(outline);
  const scale = Math.min(requestedScale, (MAX_SPRITE_PX - 2 * PAD_PX) / Math.max(b.maxX - b.minX, b.maxY - b.minY, 1));
  const width = Math.ceil((b.maxX - b.minX) * scale) + 2 * PAD_PX;
  const height = Math.ceil((b.maxY - b.minY) * scale) + 2 * PAD_PX;
  const originX = PAD_PX - b.minX * scale;
  const originY = PAD_PX - b.minY * scale;
  const px = outline.map((p) => ({ x: p.x * scale + originX, y: p.y * scale + originY }));
  const mask = rasterizePolygon(px, width, height);

  const image = createImage(width, height);
  fillImage(image, piece.texture.kind === "plain" ? piece.texture.color : "#888888");
  const d = image.data;
  for (let i = 0; i < mask.data.length; i++) d[i * 4 + 3] = Math.round(d[i * 4 + 3] * mask.data[i]);
  return { image, originX, originY, scale };
}
