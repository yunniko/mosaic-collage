/// <reference lib="webworker" />
/**
 * Renders piece sprites off the main thread (D012). It runs the same pure `renderPiece` as the page, so a sprite is
 * pixel-identical wherever it was drawn. The page sends the one decoded image the piece's texture names, if any.
 */
import type { Piece } from "@/lib/document/types";
import type { RgbaImage } from "@/lib/raster/image";
import { renderPiece } from "@/lib/render/piece";

export interface SpriteJob {
  id: number;
  piece: Piece;
  step: number;
  imageKey: string | null;
  image: RgbaImage | "failed" | undefined;
}

self.onmessage = (e: MessageEvent<SpriteJob>) => {
  const { id, piece, step, imageKey, image } = e.data;
  try {
    const sprite = renderPiece(piece, step, (key) => (key === imageKey ? image : undefined));
    self.postMessage({ id, sprite }, { transfer: [sprite.image.data.buffer] });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
