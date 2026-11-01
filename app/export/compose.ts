/**
 * Composes the artwork into an image file: the background, then every placed piece in z-order with the board's drop
 * shadow. It uses only `OffscreenCanvas` and the pure renderers, and runs in the export worker (D015).
 */
import { getPiece } from "@/lib/document/ops";
import type { MosaicDocument } from "@/lib/document/types";
import { type ExportOptions, type ExportPlan, SHADOW_REFERENCE_PX_PER_MM, pieceShadow } from "@/lib/export/plan";
import { type RgbaImage, toImageData } from "@/lib/raster/image";
import { renderBackground } from "@/lib/render/background";
import { isLit, renderPiece } from "@/lib/render/piece";
import type { ImageLookup } from "@/lib/textures/sample";

/** JPG quality: visually lossless for paper textures, a fraction of the PNG's size. */
const JPEG_QUALITY = 0.92;

/** How often, at most, progress is reported; a yield to the event loop goes with each report. */
const PROGRESS_MS = 100;

interface Sprite {
  canvas: OffscreenCanvas;
  originX: number;
  originY: number;
  scale: number;
}

function toCanvas(img: RgbaImage): OffscreenCanvas {
  const c = new OffscreenCanvas(img.width, img.height);
  c.getContext("2d")!.putImageData(toImageData(img), 0, 0);
  return c;
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
    } else {
      // Opaque and the size of the output: written straight in, with no intermediate canvas.
      ctx.putImageData(toImageData(renderBackground(doc.background, bounds, s, images).image), 0, 0);
    }
  }
  onProgress(1 / steps);
  let reported = performance.now();

  const shadow = doc.board.shadow > 0 ? pieceShadow(doc.board.shadow, s / SHADOW_REFERENCE_PX_PER_MM) : null;
  // A piece placed many times is rendered once. A lit one differs with every turn (D013), so it is not kept.
  const sprites = new Map<string, Sprite>();
  for (const [i, pl] of doc.placements.entries()) {
    const piece = getPiece(doc, pl.pieceId);
    let sprite = sprites.get(piece.id);
    if (!sprite) {
      const r = renderPiece(piece, s, images, pl.pose.rotation);
      sprite = { canvas: toCanvas(r.image), originX: r.originX, originY: r.originY, scale: r.scale };
      if (!isLit(piece)) sprites.set(piece.id, sprite);
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
    if (performance.now() - reported > PROGRESS_MS) {
      onProgress((i + 2) / steps);
      reported = performance.now();
      // Let the progress message out.
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress(1);
  return out.convertToBlob(opts.format === "jpeg" ? { type: "image/jpeg", quality: JPEG_QUALITY } : { type: "image/png" });
}
