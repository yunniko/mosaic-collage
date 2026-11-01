"use client";

import type { MosaicDocument, Piece, Placement } from "@/lib/document/types";
import type { Pose } from "@/lib/geometry/pose";
import type { Polygon } from "@/lib/geometry/polygon";
import type { Camera } from "@/lib/view/camera";
import { artworkBounds } from "@/lib/workboard/scene";
import { drawSpriteAtOrigin, getSprite } from "../render/sprites";

/** Sets the context so drawing is in board millimetres under `cam`. */
export function applyCamera(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number) {
  ctx.translate(w / 2 - cam.x * cam.zoom, h / 2 - cam.y * cam.zoom);
  ctx.scale(cam.zoom, cam.zoom);
}

/** The background under the artwork: it covers the placed pieces' extent plus its padding, so it grows with them. */
export function drawArtworkBackground(ctx: CanvasRenderingContext2D, doc: MosaicDocument) {
  const b = artworkBounds(doc);
  if (!b) return;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = doc.background.kind === "color" ? doc.background.color : "#f4efe4";
  ctx.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
  ctx.restore();
}

/** One piece at a pose, with the board's drop shadow. The shadow is in screen space, so it falls the same way at any rotation. */
export function drawPiece(ctx: CanvasRenderingContext2D, piece: Piece, pose: Pose, cam: Camera, shadow: number, lifted = false) {
  const sprite = getSprite(piece, cam.zoom * (window.devicePixelRatio || 1));
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.rotation);
  if (shadow > 0) {
    // Canvas shadows are in device-independent screen pixels, untouched by the transform: a constant on-screen depth.
    const lift = lifted ? 2 : 1;
    ctx.shadowColor = `rgba(0,0,0,${(0.6 * shadow).toFixed(3)})`;
    ctx.shadowBlur = (2 + 8 * shadow) * lift;
    ctx.shadowOffsetX = (1 + 2 * shadow) * lift;
    ctx.shadowOffsetY = (1.5 + 3 * shadow) * lift;
  }
  drawSpriteAtOrigin(ctx, sprite);
  ctx.restore();
}

export function drawPlacements(ctx: CanvasRenderingContext2D, doc: MosaicDocument, placements: readonly Placement[], cam: Camera) {
  const byId = new Map(doc.pieces.map((p) => [p.id, p]));
  for (const pl of placements) {
    const piece = byId.get(pl.pieceId);
    if (piece) drawPiece(ctx, piece, pl.pose, cam, doc.board.shadow);
  }
}

export function tracePolygon(ctx: CanvasRenderingContext2D, poly: Polygon) {
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

/** Selection and lock marks, drawn over everything at a constant screen width. */
export function drawOutlineMark(ctx: CanvasRenderingContext2D, poly: Polygon, cam: Camera, kind: "selected" | "locked" | "conflict") {
  ctx.save();
  tracePolygon(ctx, poly);
  ctx.lineWidth = (kind === "selected" ? 2 : 1.5) / cam.zoom;
  ctx.setLineDash(kind === "locked" ? [5 / cam.zoom, 4 / cam.zoom] : []);
  ctx.strokeStyle = kind === "conflict" ? "#d0342c" : kind === "locked" ? "rgba(40,30,20,0.85)" : "#1f9f96";
  ctx.stroke();
  ctx.restore();
}

/** A small padlock at a board point, in screen-sized units. */
export function drawLockBadge(ctx: CanvasRenderingContext2D, x: number, y: number, cam: Camera) {
  const s = 1 / cam.zoom;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = "rgba(43,38,32,0.9)";
  ctx.beginPath();
  ctx.roundRect(-9, -9, 18, 18, 4);
  ctx.fill();
  ctx.strokeStyle = "white";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, -1.5, 3, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = "white";
  ctx.fillRect(-4.5, -1.5, 9, 7);
  ctx.restore();
}
