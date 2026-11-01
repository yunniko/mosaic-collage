"use client";

import { Noise2D } from "@/lib/textures/noise";
import { type Camera, screenToWorld } from "@/lib/view/camera";

let woodTile: HTMLCanvasElement | null = null;

/** A seamless 512 px oak-like table-top tile, generated once (no third-party image, so nothing to license). */
function getWoodTile(): HTMLCanvasElement {
  if (woodTile) return woodTile;
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const noise = new Noise2D(7);
  const light = [196, 154, 108];
  const dark = [150, 103, 62];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Grain runs along x. Every noise term is periodic over the tile on both axes (its period equals its scale), and
      // the stripes repeat a whole number of times, so the tile wraps without a seam.
      const warp = noise.fbm(u * 2, v * 8, 4, 0.5, 2, 8) * 1.4;
      const stripes = 0.5 + 0.5 * Math.sin((v * 14 + warp) * Math.PI * 2);
      const fine = 0.5 + 0.5 * noise.fbm(u * 32, v * 64, 2, 0.6, 32, 64);
      const t = Math.min(1, Math.max(0, stripes ** 2.2 * 0.65 + fine * 0.35));
      const i = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) img.data[i + k] = light[k] + (dark[k] - light[k]) * t;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  woodTile = c;
  return c;
}

/** Fills the whole canvas with the table top, anchored to the board so it moves with panning and zooming. */
export function drawTable(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number) {
  const pattern = ctx.createPattern(getWoodTile(), "repeat")!;
  // One tile spans 400 mm of table.
  const k = (400 / 512) * cam.zoom;
  const origin = { x: w / 2 - cam.x * cam.zoom, y: h / 2 - cam.y * cam.zoom };
  pattern.setTransform(new DOMMatrix([k, 0, 0, k, origin.x, origin.y]));
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
}

/** A green self-healing cutting mat with a 1 cm grid, bolder every 5 cm, filling the view. */
export function drawCuttingMat(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number) {
  ctx.fillStyle = "#2f6b55";
  ctx.fillRect(0, 0, w, h);
  const tl = screenToWorld(cam, { x: 0, y: 0 }, w, h);
  const br = screenToWorld(cam, { x: w, y: h }, w, h);
  const line = (mm: number, width: number, color: string) => {
    if (mm * cam.zoom < 6) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let x = Math.floor(tl.x / mm) * mm; x <= br.x; x += mm) {
      const sx = Math.round((x - cam.x) * cam.zoom + w / 2) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
    }
    for (let y = Math.floor(tl.y / mm) * mm; y <= br.y; y += mm) {
      const sy = Math.round((y - cam.y) * cam.zoom + h / 2) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();
  };
  line(1, 1, "rgba(255,255,255,0.06)");
  line(10, 1, "rgba(255,255,255,0.18)");
  line(50, 1.5, "rgba(255,255,255,0.32)");
}
