/**
 * Composes the artwork into an image file: the background, then every placed piece in z-order with the board's drop
 * shadow. It uses only `OffscreenCanvas` and the pure renderers, so it runs in the export worker, or on the page where
 * a worker cannot start (D015).
 */
import { getPiece } from "@/lib/document/ops";
import type { MosaicDocument, Piece } from "@/lib/document/types";
import { type ExportOptions, type ExportPlan, SHADOW_REFERENCE_PX_PER_MM, pieceShadow } from "@/lib/export/plan";
import type { RgbaImage } from "@/lib/raster/image";
import { renderBackground } from "@/lib/render/background";
import { renderPiece } from "@/lib/render/piece";
import type { ImageLookup } from "@/lib/textures/sample";

/** JPG quality: visually lossless for paper textures, a fraction of the PNG's size. */
const JPEG_QUALITY = 0.92;

function toCanvas(img: RgbaImage): OffscreenCanvas {
  const c = new OffscreenCanvas(img.width, img.height);
  c.getContext("2d")!.putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);
  return c;
}

const lit = (p: Piece) => p.relief.style !== "none" || p.relief.textureBump > 0;

interface Sprite {
  canvas: OffscreenCanvas;
  originX: number;
  originY: number;
  scale: number;
}

export async function composeArtwork(
  doc: MosaicDocument,
  plan: ExportPlan,
  opts: ExportOptions,
  images: ImageLookup,
  onProgress: (done: number) => void
): Promise<Blob> {
  const { bounds, pxPerMm: s, width, height } = plan;
  const out = new OffscreenCanvas(width, height);
  const ctx = out.getContext("2d")!;
  const steps = doc.placements.length + 1;

  if (opts.background || opts.format === "jpeg") {
    const tex = doc.background.texture;
    if (tex.kind === "plain") {
      ctx.fillStyle = tex.color;
      ctx.fillRect(0, 0, width, height);
    } else ctx.drawImage(toCanvas(renderBackground(doc.background, bounds, s, images).image), 0, 0);
  }
  onProgress(1 / steps);

  const shadow = doc.board.shadow > 0 ? pieceShadow(doc.board.shadow, s / SHADOW_REFERENCE_PX_PER_MM) : null;
  // A piece placed many times is rendered once, unless its relief is lit: then once per turn (D013).
  const sprites = new Map<string, Sprite>();
  for (const [i, pl] of doc.placements.entries()) {
    const piece = getPiece(doc, pl.pieceId);
    const key = lit(piece) ? `${piece.id}@${pl.pose.rotation}` : piece.id;
    let sprite = sprites.get(key);
    if (!sprite) {
      const r = renderPiece(piece, s, images, pl.pose.rotation);
      sprite = { canvas: toCanvas(r.image), originX: r.originX, originY: r.originY, scale: r.scale };
      sprites.set(key, sprite);
    }
    ctx.save();
    if (shadow) {
      ctx.shadowColor = `rgba(0,0,0,${shadow.alpha.toFixed(3)})`;
      ctx.shadowBlur = shadow.blur;
      ctx.shadowOffsetX = shadow.offsetX;
      ctx.shadowOffsetY = shadow.offsetY;
    }
    ctx.translate((pl.pose.x - bounds.minX) * s, (pl.pose.y - bounds.minY) * s);
    ctx.rotate(pl.pose.rotation);
    // A piece too large for one sprite was rendered coarser (MAX_SPRITE_PX): it is drawn scaled up to its size.
    const k = s / sprite.scale;
    ctx.drawImage(sprite.canvas, -sprite.originX * k, -sprite.originY * k, sprite.canvas.width * k, sprite.canvas.height * k);
    ctx.restore();
    onProgress((i + 2) / steps);
    // Let a progress message out between pieces.
    await new Promise((r) => setTimeout(r, 0));
  }
  return out.convertToBlob(opts.format === "jpeg" ? { type: "image/jpeg", quality: JPEG_QUALITY } : { type: "image/png" });
}
