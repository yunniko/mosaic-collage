"use client";

import type { Piece } from "@/lib/document/types";
import { type PieceSprite, renderPiece } from "@/lib/render/piece";
import { pieceOutline } from "@/lib/shapes/outline";

/** A rendered piece uploaded to a canvas; the RGBA buffer is not kept. Origin and scale as in `PieceSprite`. */
export interface CanvasSprite {
  canvas: HTMLCanvasElement;
  scale: number;
  originX: number;
  originY: number;
}

/** Power-of-two px/mm steps a sprite is rendered at; a board draws the smallest step at or above what it needs. */
const MIN_STEP = 1;
const MAX_STEP = 32;

export function scaleStep(pxPerMm: number): number {
  const s = 2 ** Math.ceil(Math.log2(Math.max(pxPerMm, 0.01)));
  return Math.min(MAX_STEP, Math.max(MIN_STEP, s));
}

const cache = new WeakMap<Piece, Map<number, CanvasSprite>>();

function spriteToCanvas(sprite: PieceSprite): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = sprite.image.width;
  canvas.height = sprite.image.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(sprite.image.data as Uint8ClampedArray<ArrayBuffer>, sprite.image.width, sprite.image.height), 0, 0);
  return canvas;
}

/**
 * The piece rendered at the step for `pxPerMm`. Pieces are replaced rather than mutated, and placed pieces never
 * change (D002), so a cached sprite is valid for as long as its piece object lives.
 */
export function getSprite(piece: Piece, pxPerMm: number): CanvasSprite {
  const step = scaleStep(pxPerMm);
  let byStep = cache.get(piece);
  if (!byStep) {
    byStep = new Map();
    cache.set(piece, byStep);
  }
  let s = byStep.get(step);
  if (!s) {
    const sprite = renderPiece(piece, pieceOutline(piece), step);
    s = { canvas: spriteToCanvas(sprite), scale: sprite.scale, originX: sprite.originX, originY: sprite.originY };
    byStep.set(step, s);
  }
  return s;
}

/** Draws a sprite with its local origin at the current transform's origin, sized in mm. */
export function drawSpriteAtOrigin(ctx: CanvasRenderingContext2D, s: CanvasSprite) {
  const k = 1 / s.scale;
  ctx.drawImage(s.canvas, -s.originX * k, -s.originY * k, s.canvas.width * k, s.canvas.height * k);
}
