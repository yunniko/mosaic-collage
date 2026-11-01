"use client";

import { useEffect, useState } from "react";
import type { Vec } from "@/lib/geometry/vec";
import type { Camera } from "@/lib/view/camera";

/** Screen pixels a press may wander before it counts as a drag rather than a click. */
export const CLICK_SLOP = 4;

export const dpr = () => window.devicePixelRatio || 1;

/** An event's position in the CSS pixels of `el`. */
export function canvasPoint(el: Element, e: { clientX: number; clientY: number }): Vec {
  const r = el.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

/** Sets the context so drawing is in board millimetres under `cam`. */
export function applyCamera(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number) {
  ctx.translate(w / 2 - cam.x * cam.zoom, h / 2 - cam.y * cam.zoom);
  ctx.scale(cam.zoom, cam.zoom);
}

/** The CSS size of an element, kept current with a ResizeObserver. */
export function useElementSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize({ width: Math.round(r.width), height: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Sizes a canvas's backing store to its CSS size times the device pixel ratio, and returns a context scaled to CSS px. */
export function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D {
  const k = dpr();
  const w = Math.max(1, Math.round(width * k));
  const h = Math.max(1, Math.round(height * k));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  return ctx;
}
