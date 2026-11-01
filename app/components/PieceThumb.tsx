"use client";

import { useEffect, useRef } from "react";
import type { Piece } from "@/lib/document/types";
import { polygonBounds } from "@/lib/geometry/polygon";
import { pieceOutline } from "@/lib/shapes/outline";
import { drawSpriteAtOrigin, getSprite } from "../render/sprites";
import { useAppState } from "../state/store";
import { dpr, prepareCanvas } from "./canvas-hooks";

/** A small picture of a piece, fitted into a square. */
export function PieceThumb({ piece, size = 56 }: { piece: Piece; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const textureVersion = useAppState((s) => s.textureVersion);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = prepareCanvas(canvas, size, size);
    ctx.clearRect(0, 0, size, size);
    let b;
    try {
      b = polygonBounds(pieceOutline(piece));
    } catch {
      return;
    }
    const k = (size - 6) / Math.max(b.maxX - b.minX, b.maxY - b.minY, 1);
    const sprite = getSprite(piece, k * dpr());
    ctx.save();
    ctx.translate(size / 2 - ((b.minX + b.maxX) / 2) * k, size / 2 - ((b.minY + b.maxY) / 2) * k);
    ctx.scale(k, k);
    drawSpriteAtOrigin(ctx, sprite);
    ctx.restore();
  }, [piece, size, textureVersion]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden="true" />;
}
