import type { Piece } from "../document/types";
import { polygonBounds } from "../geometry/polygon";
import { type PreparedLayer, type Rgb, applyLayers, hexToRgb, prepareLayers } from "../raster/blend";
import { edgeDistance } from "../raster/distance";
import { type RgbaImage, createImage } from "../raster/image";
import { rasterizePolygon } from "../raster/rasterize";
import { pieceOutline, pieceTear, shapeOutline } from "../shapes/outline";
import { type ImageLookup, type TextureSampling, textureSampling } from "../textures/sample";
import { TornEdgePainter } from "./edge";
import { shadeRelief, surfaceLightness } from "./relief";

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

/** Field values a generated texture's colours are tabulated at: finer than 8-bit output can show. */
const FIELD_STEPS = 1024;

/**
 * The colour (texture, then layers) at a point of the piece's plane. Colour layers are functions of colour alone, so a
 * flat texture is coloured once and a generated one through a table over its field value; only images run the layers
 * per pixel.
 */
function pixelColor(tex: TextureSampling, layers: readonly PreparedLayer[]): (x: number, y: number) => Rgb {
  switch (tex.kind) {
    case "flat": {
      const c = applyLayers(tex.color, layers);
      return () => c;
    }
    case "field": {
      const table = Array.from({ length: FIELD_STEPS }, (_, i) => applyLayers(tex.ramp(i / (FIELD_STEPS - 1)), layers));
      const { value } = tex;
      return (x, y) => {
        const v = value(x, y);
        return table[Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * (FIELD_STEPS - 1))];
      };
    }
    case "image":
      return layers.length ? (x, y) => applyLayers(tex.sample(x, y), layers) : tex.sample;
  }
}

/**
 * Renders a piece at `scale` px/mm: texture, then its colour layers in order, cut by the (torn) outline's coverage
 * mask; then the torn edge's band, the relief's lighting, and the fuzz and fibres outside the line (D011). Each step is
 * a pure function of the piece (and the decoded images it names), so the same pixels come out in a unit test, on the
 * boards and in an export.
 */
export function renderPiece(piece: Piece, requestedScale: number, images: ImageLookup, turn = 0): PieceSprite {
  const tear = pieceTear(piece);
  const outline = pieceOutline(piece);
  const b = polygonBounds(outline);
  const reach = tear?.reach ?? 0;
  const side = Math.max(b.maxX - b.minX, b.maxY - b.minY, 1) + 2 * reach;
  const scale = Math.min(requestedScale, (MAX_SPRITE_PX - 2 * PAD_PX) / side);
  const pad = PAD_PX + Math.ceil(reach * scale);
  const width = Math.ceil((b.maxX - b.minX) * scale) + 2 * pad;
  const height = Math.ceil((b.maxY - b.minY) * scale) + 2 * pad;
  const originX = pad - b.minX * scale;
  const originY = pad - b.minY * scale;
  const px = outline.map((p) => ({ x: p.x * scale + originX, y: p.y * scale + originY }));
  const mask = rasterizePolygon(px, width, height);

  // The texture is placed on the cut shape's bounds, so tearing or re-seeding the edge never shifts it.
  const tex = textureSampling(piece.texture, piece.textureTransform, polygonBounds(shapeOutline(piece.shape)), images);
  const colorAt = pixelColor(tex, prepareLayers(piece.colors));

  const image = createImage(width, height);
  const d = image.data;
  for (let j = 0; j < height; j++) {
    const y = (j + 0.5 - originY) / scale;
    for (let i = 0; i < width; i++) {
      const m = mask.data[j * width + i];
      if (m <= 0) continue;
      const c = colorAt((i + 0.5 - originX) / scale, y);
      const k = (j * width + i) * 4;
      d[k] = c[0] * 255;
      d[k + 1] = c[1] * 255;
      d[k + 2] = c[2] * 255;
      d[k + 3] = m * 255;
    }
  }

  const lit = piece.relief.style !== "none" || piece.relief.textureBump > 0;
  if (tear || lit) {
    const inside = edgeDistance(mask, true);
    const frame = { scale, originX, originY };
    const painter = tear
      ? new TornEdgePainter(tear, frame, width, height, piece.edge.rimColor ? hexToRgb(piece.edge.rimColor) : null)
      : null;
    const lightness = piece.relief.textureBump > 0 ? surfaceLightness(image, mask) : null;
    painter?.paintBand(image, mask, inside);
    if (lit) shadeRelief(image, mask, inside, scale, piece.relief, turn, lightness);
    painter?.paintFibres(image, edgeDistance(mask, false), colorAt);
  }
  return { image, originX, originY, scale, pending: tex.kind === "flat" && tex.pending };
}
