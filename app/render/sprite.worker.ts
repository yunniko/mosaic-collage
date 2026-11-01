/// <reference lib="webworker" />
/**
 * Renders piece sprites off the main thread (D012). It runs the same pure `renderPiece` as the page, so a sprite is
 * pixel-identical wherever it was drawn. The page sends each decoded image once, the first time a job needs it.
 */
import type { Piece } from "@/lib/document/types";
import type { RgbaImage } from "@/lib/raster/image";
import type { PieceSprite } from "@/lib/render/piece";
import { renderPiece } from "@/lib/render/piece";

export interface SpriteJob {
  id: number;
  piece: Piece;
  step: number;
  imageKey: string | null;
  /** The decoded image for `imageKey`, sent only when the worker does not hold it yet. */
  image: RgbaImage | "failed" | undefined;
}

export interface SpriteResult {
  id: number;
  sprite?: PieceSprite;
  error?: string;
}

const images = new Map<string, RgbaImage | "failed">();

self.onmessage = (e: MessageEvent<SpriteJob>) => {
  const { id, piece, step, imageKey, image } = e.data;
  if (imageKey && image !== undefined) images.set(imageKey, image);
  try {
    const sprite = renderPiece(piece, step, (key) => images.get(key));
    self.postMessage({ id, sprite } satisfies SpriteResult, { transfer: [sprite.image.data.buffer] });
  } catch (err) {
    self.postMessage({ id, error: String(err) } satisfies SpriteResult);
  }
};
