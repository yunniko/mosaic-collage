"use client";

import type { Piece } from "@/lib/document/types";
import { polygonBounds } from "@/lib/geometry/polygon";
import { type PieceSprite, renderPiece } from "@/lib/render/piece";
import { pieceOutline, pieceTear } from "@/lib/shapes/outline";
import { textureImageKey } from "@/lib/textures/sample";
import { type AppState, store, useAppState } from "../state/store";
import { createCanvas2d } from "./canvas";
import type { SpriteJob } from "./sprite.worker";
import { lookupTextureImage } from "./texture-images";

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

/**
 * The most pixels a sprite is rendered with on the main thread: about 100 ms at the measured ~1 µs per pixel
 * (`tests/unit/textures.spec.ts`). A larger one is shown coarser at once and refined in the worker (D012).
 */
const SYNC_PIXELS = 120_000;

/** A queued background render nobody has asked for in this long is dropped: its piece is gone or was edited. */
const STALE_MS = 1500;

export function scaleStep(pxPerMm: number): number {
  const s = 2 ** Math.ceil(Math.log2(Math.max(pxPerMm, 0.01)));
  return Math.min(MAX_STEP, Math.max(MIN_STEP, s));
}

/** A cached sprite; a stand-in drawn while an image decodes remembers the `textureVersion` it was drawn under. */
type Cached = CanvasSprite & { pendingAt: number | null };
const cache = new WeakMap<Piece, Map<number, Cached>>();

function spriteToCanvas(sprite: PieceSprite): HTMLCanvasElement {
  const { canvas, ctx } = createCanvas2d(sprite.image.width, sprite.image.height);
  ctx.putImageData(new ImageData(sprite.image.data as Uint8ClampedArray<ArrayBuffer>, sprite.image.width, sprite.image.height), 0, 0);
  return canvas;
}

function remember(piece: Piece, step: number, sprite: PieceSprite, version: number): Cached {
  const s: Cached = {
    canvas: spriteToCanvas(sprite),
    scale: sprite.scale,
    originX: sprite.originX,
    originY: sprite.originY,
    pendingAt: sprite.pending ? version : null,
  };
  let byStep = cache.get(piece);
  if (!byStep) {
    byStep = new Map();
    cache.set(piece, byStep);
  }
  byStep.set(step, s);
  return s;
}

/** Pixels a sprite of the piece takes at `step`, from its bounds and how far its fibres reach. */
function pixelsAt(piece: Piece, step: number): number {
  const b = polygonBounds(pieceOutline(piece));
  const reach = 2 * (pieceTear(piece)?.reach ?? 0);
  return (b.maxX - b.minX + reach) * (b.maxY - b.minY + reach) * step * step;
}

// ---- Background renders -------------------------------------------------------------------------------------------

interface Job {
  piece: Piece;
  step: number;
  wanted: number;
  version: number;
}
const jobs = new Map<string, Job>();
const jobKeys = new WeakMap<Piece, number>();
let nextPieceKey = 1;
let busy: { id: number; key: string; job: Job } | null = null;
let nextJobId = 1;
let worker: Worker | null | undefined;

function jobKey(piece: Piece, step: number): string {
  let k = jobKeys.get(piece);
  if (k === undefined) {
    k = nextPieceKey++;
    jobKeys.set(piece, k);
  }
  return `${k}@${step}`;
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./sprite.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; sprite?: PieceSprite; error?: string }>) => finish(e.data.id, e.data.sprite);
    worker.onerror = () => {
      // The worker could not load: render on the main thread from now on, one job per task.
      worker = null;
      if (busy) runOnMainThread(busy);
    };
  } catch {
    worker = null;
  }
  return worker;
}

function finish(id: number, sprite: PieceSprite | undefined) {
  if (!busy || busy.id !== id) return;
  const { job } = busy;
  busy = null;
  if (sprite) {
    remember(job.piece, job.step, sprite, job.version);
    store.set({ spriteVersion: store.getState().spriteVersion + 1 });
  }
  pump();
}

function runOnMainThread(b: NonNullable<typeof busy>) {
  setTimeout(() => {
    let sprite: PieceSprite | undefined;
    try {
      sprite = renderPiece(b.job.piece, b.job.step, lookupTextureImage);
    } catch {
      sprite = undefined;
    }
    finish(b.id, sprite);
  }, 0);
}

/** Starts the most recently wanted queued render, dropping any nobody has asked for lately. */
function pump() {
  if (busy) return;
  const now = performance.now();
  let pick: [string, Job] | null = null;
  for (const entry of jobs) {
    if (now - entry[1].wanted > STALE_MS) jobs.delete(entry[0]);
    else if (!pick || entry[1].wanted > pick[1].wanted) pick = entry;
  }
  if (!pick) return;
  const [key, job] = pick;
  jobs.delete(key);
  busy = { id: nextJobId++, key, job };
  const w = getWorker();
  if (!w) {
    runOnMainThread(busy);
    return;
  }
  const imageKey = textureImageKey(job.piece.texture);
  const msg: SpriteJob = {
    id: busy.id,
    piece: job.piece,
    step: job.step,
    imageKey,
    image: imageKey ? lookupTextureImage(imageKey) : undefined,
  };
  w.postMessage(msg);
}

function request(piece: Piece, step: number, version: number) {
  const key = jobKey(piece, step);
  if (busy?.key === key) return;
  const job = jobs.get(key);
  if (job) job.wanted = performance.now();
  else jobs.set(key, { piece, step, wanted: performance.now(), version });
  pump();
}

// ---- Lookup ------------------------------------------------------------------------------------------------------

const valid = (s: Cached | undefined, version: number): s is Cached => !!s && (s.pendingAt === null || s.pendingAt === version);

/**
 * The piece rendered for `pxPerMm`. Pieces are replaced rather than mutated, and placed pieces never change (D002),
 * so a cached sprite is valid for as long as its piece object lives; a stand-in drawn while its image texture is
 * still decoding is kept only until `textureVersion` moves on. A sprite too large to render at once is drawn from a
 * coarser step and refined in the background; `spriteVersion` moves when the finer one arrives (D012).
 */
export function getSprite(piece: Piece, pxPerMm: number): CanvasSprite {
  const step = scaleStep(pxPerMm);
  const version = store.getState().textureVersion;
  const byStep = cache.get(piece);
  const exact = byStep?.get(step);
  if (valid(exact, version)) return exact;

  if (pixelsAt(piece, step) <= SYNC_PIXELS) return remember(piece, step, renderPiece(piece, step, lookupTextureImage), version);

  // Meanwhile: the nearest step already rendered — the smallest finer one, else the largest coarser one.
  let best: Cached | null = null;
  let bestStep = 0;
  for (const [s, c] of byStep ?? []) {
    if (!valid(c, version)) continue;
    const better = !best || (s >= step ? bestStep < step || s < bestStep : bestStep < step && s > bestStep);
    if (better) {
      best = c;
      bestStep = s;
    }
  }
  let coarse = step;
  while (coarse > MIN_STEP && pixelsAt(piece, coarse) > SYNC_PIXELS) coarse /= 2;
  // Even the coarsest step is too big to render at once: there is nothing finer to wait for, so render it now.
  if (coarse === step) return remember(piece, step, renderPiece(piece, step, lookupTextureImage), version);
  request(piece, step, version);
  return best ?? remember(piece, coarse, renderPiece(piece, coarse, lookupTextureImage), version);
}

/**
 * Changes whenever a texture decode or a background render settles: a component drawing sprites lists it in its
 * effect's dependencies. Both counters only grow, so their sum changes whenever either does.
 */
export const renderVersion = (s: AppState) => s.textureVersion + s.spriteVersion;
export const useRenderVersion = () => useAppState(renderVersion);

/** Draws a sprite with its local origin at the current transform's origin, sized in mm. */
export function drawSpriteAtOrigin(ctx: CanvasRenderingContext2D, s: CanvasSprite) {
  const k = 1 / s.scale;
  ctx.drawImage(s.canvas, -s.originX * k, -s.originY * k, s.canvas.width * k, s.canvas.height * k);
}
