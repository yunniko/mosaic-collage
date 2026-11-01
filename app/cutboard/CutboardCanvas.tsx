"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Bounds, polygonBounds } from "@/lib/geometry/polygon";
import type { Vec } from "@/lib/geometry/vec";
import { pieceOutline } from "@/lib/shapes/outline";
import { type Camera, fitBounds, panBy, pinch, wheelZoom } from "@/lib/view/camera";
import { applyCamera, canvasPoint, dpr, prepareCanvas, useElementSize } from "../components/canvas-hooks";
import { drawSpriteAtOrigin, getSprite } from "../render/sprites";
import { drawCuttingMat } from "../render/surfaces";
import { useAppState, useDoc } from "../state/store";

/** The selected piece on a cutting mat. Pan by dragging, zoom with the wheel or a pinch. */
export function CutboardCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = useElementSize(wrapRef);
  const doc = useDoc();
  const selected = useAppState((s) => s.selectedPieceId);
  const piece = doc.pieces.find((p) => p.id === selected) ?? null;
  const bounds: Bounds | null = useMemo(() => {
    if (!piece) return null;
    try {
      return polygonBounds(pieceOutline(piece));
    } catch {
      return null;
    }
  }, [piece]);

  // The view is re-framed when another piece is selected or the board is resized; editing the same piece keeps it.
  // A pan or zoom is kept against the frame it was made in, so a new frame simply supersedes it.
  const pieceId = piece?.id;
  const frameKey = `${pieceId}|${width}|${height}`;
  const framed = useMemo(() => {
    const b = bounds ?? { minX: -50, minY: -50, maxX: 50, maxY: 50 };
    const pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.35 + 10;
    return fitBounds({ minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad }, width || 1, height || 1, 20, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately not on `bounds`: see the comment above.
  }, [frameKey]);
  const [moved, setMoved] = useState<{ key: string; cam: Camera } | null>(null);
  const cam = moved && moved.key === frameKey ? moved.cam : framed;
  const setCam = useCallback(
    (f: (c: Camera) => Camera) => setMoved((m) => ({ key: frameKey, cam: f(m && m.key === frameKey ? m.cam : framed) })),
    [frameKey, framed]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !height) return;
    const ctx = prepareCanvas(canvas, width, height);
    drawCuttingMat(ctx, cam, width, height);
    if (!piece) return;
    let sprite;
    try {
      sprite = getSprite(piece, cam.zoom * dpr());
    } catch {
      return;
    }
    ctx.save();
    applyCamera(ctx, cam, width, height);
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 4;
    drawSpriteAtOrigin(ctx, sprite);
    ctx.restore();
  }, [piece, cam, width, height]);

  usePanZoom(canvasRef, width, height, setCam);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={canvasRef} className="board" style={{ width, height }} data-testid="cutboard-canvas" />
    </div>
  );
}

/** Mouse/touch pan and zoom for a board that has nothing else to drag. */
function usePanZoom(
  ref: React.RefObject<HTMLCanvasElement | null>,
  width: number,
  height: number,
  setCam: (f: (c: Camera) => Camera) => void
) {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const pointers = new Map<number, Vec>();
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, canvasPoint(canvas, e));
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const p = canvasPoint(canvas, e);
      if (pointers.size === 1) setCam((c) => panBy(c, p.x - prev.x, p.y - prev.y));
      else if (pointers.size === 2) {
        // The finger that moved, against the one that stayed put.
        const other = [...pointers].find(([id]) => id !== e.pointerId)![1];
        setCam((c) => pinch(c, { a: prev, b: other }, p, other, width, height));
      }
      pointers.set(e.pointerId, p);
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setCam((c) => wheelZoom(c, canvasPoint(canvas, e), e.deltaY, width, height));
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [ref, width, height, setCam]);
}
