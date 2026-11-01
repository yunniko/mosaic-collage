"use client";

import type { Piece } from "@/lib/document/types";
import { polygonBounds } from "@/lib/geometry/polygon";
import { type PieceSprite, renderPiece } from "@/lib/render/piece";
import { pieceOutline, pieceTear } from "@/lib/shapes/outline";
import { textureImageKey } from "@/lib/textures/sample";
import { type AppState, store, useAppState } from "../state/store";
import { createCanvas2d } from "./canvas";
import type { SpriteJob, SpriteResult } from "./sprite.worker";
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

/** A piece's sprite area per (px/mm)², mm²: its bounds grown by how far its fibres reach. */
const areas = new WeakMap<Piece, number>();

/** Pixels a sprite of the piece takes at `step`. */
function pixelsAt(piece: Piece, step: number): number {
  let area = areas.get(piece);
  if (area === undefined) {
    const b = polygonBounds(pieceOutline(piece));
    const reach = 2 * (pieceTear(piece)?.reach ?? 0);
    area = (b.maxX - b.minX + reach) * (b.maxY - b.minY + reach);
    areas.set(piece, area);
  }
  return area * step * step;
}

// ---- Background renders -------------------------------------------------------------------------------------------

interface Job {
  piece: Piece;
  step: number;
  wanted: number;
  version: number;
}
/** Queued renders; few at a time, so a list searched by piece and step. */
let jobs: Job[] = [];
let busy: { id: number; job: Job } | null = null;
let nextJobId = 1;
let worker: Worker | null | undefined;
/** Image keys the worker already holds, so each decoded image is copied to it once. */
const sentImages = new Set<string>();
/** Steps whose render threw, per piece: not asked for again, the coarser sprite stays. */
const failed = new WeakMap<Piece, Set<number>>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./sprite.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<SpriteResult>) => finish(e.data.id, e.data.sprite, e.data.error);
    worker.onerror = () => {
      // The worker could not load: render on the main thread from now on, one job per task.
      worker = null;
      sentImages.clear();
      if (busy) runOnMainThread(busy);
    };
  } catch {
    worker = null;
  }
  return worker;
}

function finish(id: number, sprite: PieceSprite | undefined, error?: string) {
  if (!busy || busy.id !== id) return;
  const { job } = busy;
  busy = null;
  if (sprite) {
    remember(job.piece, job.step, sprite, job.version);
    store.set({ spriteVersion: store.getState().spriteVersion + 1 });
  } else {
    console.error(`Rendering a piece at ${job.step} px/mm failed`, error);
    const steps = failed.get(job.piece) ?? new Set<number>();
    steps.add(job.step);
    failed.set(job.piece, steps);
  }
  pump();
}

function runOnMainThread(b: NonNullable<typeof busy>) {
  setTimeout(() => {
    try {
      finish(b.id, renderPiece(b.job.piece, b.job.step, lookupTextureImage));
    } catch (err) {
      finish(b.id, undefined, String(err));
    }
  }, 0);
}

/** Starts the most recently wanted queued render, dropping any nobody has asked for lately. */
function pump() {
  if (busy) return;
  const now = performance.now();
  jobs = jobs.filter((j) => now - j.wanted <= STALE_MS);
  if (jobs.length === 0) return;
  const job = jobs.reduce((a, b) => (b.wanted > a.wanted ? b : a));
  jobs.splice(jobs.indexOf(job), 1);
  busy = { id: nextJobId++, job };
  const w = getWorker();
  if (!w) {
    runOnMainThread(busy);
    return;
  }
  const imageKey = textureImageKey(job.piece.texture);
  let image: SpriteJob["image"];
  if (imageKey && !sentImages.has(imageKey)) {
    image = lookupTextureImage(imageKey);
    // Still decoding: send nothing and let the worker draw the stand-in, as the page would.
    if (image !== undefined) sentImages.add(imageKey);
  }
  const msg: SpriteJob = { id: busy.id, piece: job.piece, step: job.step, imageKey, image };
  w.postMessage(msg);
}

function request(piece: Piece, step: number, version: number) {
  if (failed.get(piece)?.has(step)) return;
  const same = (j: Job) => j.piece === piece && j.step === step;
  if (busy && same(busy.job)) return;
  const job = jobs.find(same);
  if (job) job.wanted = performance.now();
  else jobs.push({ piece, step, wanted: performance.now(), version });
  pump();
}

// ---- Lookup ------------------------------------------------------------------------------------------------------

const valid = (s: Cached | undefined, version: number): s is Cached => !!s && (s.pendingAt === null || s.pendingAt === version);

/** The cached step nearest `step`: the smallest finer one, else the largest coarser one. */
function nearestCached(byStep: Map<number, Cached>, step: number, version: number): Cached | null {
  let finer: [number, Cached] | null = null;
  let coarser: [number, Cached] | null = null;
  for (const [s, c] of byStep) {
    if (!valid(c, version)) continue;
    if (s >= step) {
      if (!finer || s < finer[0]) finer = [s, c];
    } else if (!coarser || s > coarser[0]) coarser = [s, c];
  }
  return (finer ?? coarser)?.[1] ?? null;
}

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

  const best = byStep && nearestCached(byStep, step, version);
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
