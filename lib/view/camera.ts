import type { Bounds } from "../geometry/polygon";
import { distance, midpoint, type Vec } from "../geometry/vec";

/** A view onto an unbounded board: the world point at the viewport's centre, and CSS pixels per millimetre. */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 40;
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function worldToScreen(cam: Camera, p: Vec, viewW: number, viewH: number): Vec {
  return { x: (p.x - cam.x) * cam.zoom + viewW / 2, y: (p.y - cam.y) * cam.zoom + viewH / 2 };
}

export function screenToWorld(cam: Camera, p: Vec, viewW: number, viewH: number): Vec {
  return { x: (p.x - viewW / 2) / cam.zoom + cam.x, y: (p.y - viewH / 2) / cam.zoom + cam.y };
}

/** Zooms by `factor`, keeping the world point under the screen point `anchor` fixed. */
export function zoomAt(cam: Camera, anchor: Vec, factor: number, viewW: number, viewH: number): Camera {
  const zoom = clampZoom(cam.zoom * factor);
  const before = screenToWorld(cam, anchor, viewW, viewH);
  const next = { ...cam, zoom };
  const after = screenToWorld(next, anchor, viewW, viewH);
  return { x: next.x + before.x - after.x, y: next.y + before.y - after.y, zoom };
}

export function panBy(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  return { ...cam, x: cam.x - dxScreen / cam.zoom, y: cam.y - dyScreen / cam.zoom };
}

/** A camera showing all of `b` with `marginPx` to spare. */
export function fitBounds(b: Bounds, viewW: number, viewH: number, marginPx = 40, maxZoom = 8): Camera {
  const w = Math.max(1, b.maxX - b.minX);
  const h = Math.max(1, b.maxY - b.minY);
  const zoom = clampZoom(Math.min((viewW - 2 * marginPx) / w, (viewH - 2 * marginPx) / h, maxZoom));
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, zoom };
}

/** A wheel turn of `deltaY` zooms about the screen point `anchor`. */
export function wheelZoom(cam: Camera, anchor: Vec, deltaY: number, viewW: number, viewH: number): Camera {
  return zoomAt(cam, anchor, Math.exp(-deltaY * 0.0015), viewW, viewH);
}

/** Two fingers at `a` and `b`, last seen at `prev`: the view pans with their midpoint and zooms with their spread. */
export function pinch(cam: Camera, prev: { a: Vec; b: Vec }, a: Vec, b: Vec, viewW: number, viewH: number): Camera {
  const m0 = midpoint(prev.a, prev.b);
  const m = midpoint(a, b);
  const d0 = distance(prev.a, prev.b);
  const moved = panBy(cam, m.x - m0.x, m.y - m0.y);
  return d0 > 0 ? zoomAt(moved, m, distance(a, b) / d0, viewW, viewH) : moved;
}
