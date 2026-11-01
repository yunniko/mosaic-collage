"use client";

import type { Background } from "@/lib/document/types";
import type { Bounds } from "@/lib/geometry/polygon";
import { renderBackground } from "@/lib/render/background";
import { store } from "../state/store";
import { createCanvas2d } from "./canvas";
import { scaleStep } from "./sprites";
import { lookupTextureImage } from "./texture-images";

/**
 * The most pixels the board's background is rendered with: it is redrawn on the main thread whenever the artwork's
 * extent changes, so it is kept to about a quarter of a second at ~1 µs per pixel. The export renders at full size.
 */
const BOARD_PIXELS = 250_000;

/** How long the extent must hold still before the background is rendered again for it; meanwhile the last one stretches. */
const SETTLE_MS = 150;

interface Rendered {
  background: Background;
  bounds: Bounds;
  step: number;
  /** The `textureVersion` a stand-in was drawn under, or null when the texture was ready. */
  pendingAt: number | null;
  canvas: HTMLCanvasElement;
}

let last: Rendered | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const sameBounds = (a: Bounds, b: Bounds) =>
  Math.abs(a.minX - b.minX) + Math.abs(a.minY - b.minY) + Math.abs(a.maxX - b.maxX) + Math.abs(a.maxY - b.maxY) < 1e-6;

function render(background: Background, bounds: Bounds, step: number): Rendered {
  const r = renderBackground(background, bounds, step, lookupTextureImage);
  const { canvas, ctx } = createCanvas2d(r.image.width, r.image.height);
  ctx.putImageData(new ImageData(r.image.data as Uint8ClampedArray<ArrayBuffer>, r.image.width, r.image.height), 0, 0);
  return { background, bounds, step, pendingAt: r.pending ? store.getState().textureVersion : null, canvas };
}

/** The px/mm a background over `bounds` is rendered at for a board showing `pxPerMm`: within the board's pixel budget. */
function boardStep(bounds: Bounds, pxPerMm: number): number {
  const area = Math.max((bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY), 1e-6);
  return Math.min(scaleStep(pxPerMm), Math.sqrt(BOARD_PIXELS / area));
}

/**
 * The background's pixels for the board, to be drawn stretched over `bounds`. A plain colour needs none (null). When
 * the extent or zoom has changed, the last rendering is returned at once and a new one follows once they hold still
 * (`spriteVersion` moves), so a drag that grows the artwork never waits on a render.
 */
export function boardBackground(background: Background, bounds: Bounds, pxPerMm: number): HTMLCanvasElement | null {
  if (background.texture.kind === "plain") return null;
  const step = boardStep(bounds, pxPerMm);
  const version = store.getState().textureVersion;
  const fresh = (r: Rendered) => r.background === background && (r.pendingAt === null || r.pendingAt === version);
  if (last && fresh(last) && sameBounds(last.bounds, bounds) && last.step === step) return last.canvas;
  if (!last || last.background !== background) {
    // A new background (or the first) is drawn at once: there is nothing of it to stretch meanwhile.
    last = render(background, bounds, step);
    return last.canvas;
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    last = render(background, bounds, step);
    store.set({ spriteVersion: store.getState().spriteVersion + 1 });
  }, SETTLE_MS);
  return last.canvas;
}
