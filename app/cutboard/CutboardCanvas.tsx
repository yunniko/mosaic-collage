"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isPiecePlaced, updatePiece } from "@/lib/document/ops";
import { type Bounds, polygonBounds } from "@/lib/geometry/polygon";
import type { Vec } from "@/lib/geometry/vec";
import { STABILIZATION } from "@/lib/shapes/hand";
import { pieceOutline } from "@/lib/shapes/outline";
import { type Camera, fitBounds, panBy, pinch, screenToWorld, wheelZoom } from "@/lib/view/camera";
import { applyCamera, canvasPoint, dpr, prepareCanvas, useElementSize } from "../components/canvas-hooks";
import { drawSpriteAtOrigin, getSprite } from "../render/sprites";
import { drawCuttingMat } from "../render/surfaces";
import { errorText } from "../state/errors";
import { store, useAppState, useDoc } from "../state/store";

/**
 * The selected piece on a cutting mat. Pan by dragging, zoom with the wheel or a pinch. In cut mode one pointer draws
 * the hand cut instead (the mouse's other buttons, or two fingers, still move the view) and releasing it cuts.
 */
export function CutboardCanvas() {
  const t = useTranslations();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = useElementSize(wrapRef);
  const doc = useDoc();
  const selected = useAppState((s) => s.selectedPieceId);
  const piece = doc.pieces.find((p) => p.id === selected) ?? null;
  const cutting = useAppState((s) => piece !== null && s.cuttingPieceId === piece.id) && !!piece && !isPiecePlaced(doc, piece.id);
  const [stroke, setStroke] = useState<Vec[] | null>(null);
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
    if (piece && !(cutting && stroke)) drawPiece(ctx, piece, cam, width, height, cutting ? 0.3 : 1);
    if (stroke) drawStroke(ctx, stroke, cam, width, height);
  }, [piece, cam, width, height, cutting, stroke]);

  // The handlers below are bound once per board size; they read the latest render through this ref.
  const live = useRef({ cam, piece, cutting });
  useLayoutEffect(() => {
    live.current = { cam, piece, cutting };
  }, [cam, piece, cutting]);

  const cancelCut = useCallback(() => {
    setStroke(null);
    store.set({ cuttingPieceId: null });
  }, []);
  useEffect(() => {
    if (!cutting) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelCut();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [cutting, cancelCut]);

  const finishCut = useCallback(
    (points: Vec[]) => {
      setStroke(null);
      const current = live.current.piece;
      if (!current) return;
      const stabilization = current.shape.kind === "hand" ? current.shape.stabilization : STABILIZATION.default;
      const shape = { kind: "hand" as const, points, stabilization };
      const ok = store.apply(
        (d) => updatePiece(d, { ...current, shape }),
        (e) => store.notify("error", errorText(t, e))
      );
      // A refused cut keeps cut mode on, so the user can simply draw again.
      if (ok) store.set({ cuttingPieceId: null });
    },
    [t]
  );

  useBoardPointers(canvasRef, width, height, setCam, live, setStroke, finishCut);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="board"
        style={{ width, height, cursor: cutting ? "crosshair" : undefined }}
        data-testid="cutboard-canvas"
      />
      {cutting ? (
        <div
          className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-3 rounded-md border border-accent bg-accent-soft px-3 py-1.5 text-sm shadow"
          role="status"
          data-testid="cut-hint"
        >
          <span>{t("cut.hint")}</span>
          <button type="button" className="btn" onClick={cancelCut} data-testid="cut-cancel">
            {t("cut.cancel")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: Parameters<typeof getSprite>[0],
  cam: Camera,
  width: number,
  height: number,
  alpha: number
) {
  let sprite;
  try {
    sprite = getSprite(piece, cam.zoom * dpr());
  } catch {
    return;
  }
  ctx.save();
  applyCamera(ctx, cam, width, height);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 4;
  drawSpriteAtOrigin(ctx, sprite);
  ctx.restore();
}

/** The stroke being cut, in world mm, with a dashed line showing how it will close. */
function drawStroke(ctx: CanvasRenderingContext2D, stroke: Vec[], cam: Camera, width: number, height: number) {
  if (stroke.length < 2) return;
  ctx.save();
  applyCamera(ctx, cam, width, height);
  ctx.lineWidth = 2 / cam.zoom;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#b4442f";
  ctx.beginPath();
  ctx.moveTo(stroke[0].x, stroke[0].y);
  for (const p of stroke) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.setLineDash([6 / cam.zoom, 4 / cam.zoom]);
  ctx.beginPath();
  ctx.moveTo(stroke[stroke.length - 1].x, stroke[stroke.length - 1].y);
  ctx.lineTo(stroke[0].x, stroke[0].y);
  ctx.stroke();
  ctx.restore();
}

/** Stroke points are kept to a hundredth of a millimetre: finer than any hand, and it keeps saved files small. */
const roundMm = (v: number) => Math.round(v * 100) / 100;

/**
 * Mouse/touch handling for the cutboard. Outside cut mode every drag pans. In cut mode the first pointer (the mouse's
 * main button) draws a stroke; a second finger abandons it and pinches instead, so the view can always be moved.
 */
function useBoardPointers(
  ref: React.RefObject<HTMLCanvasElement | null>,
  width: number,
  height: number,
  setCam: (f: (c: Camera) => Camera) => void,
  live: React.RefObject<{ cam: Camera; cutting: boolean }>,
  setStroke: (s: Vec[] | null) => void,
  finishCut: (points: Vec[]) => void
) {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const pointers = new Map<number, Vec>();
    let drawing: { pointerId: number; points: Vec[] } | null = null;
    const toWorld = (p: Vec) => {
      const w = screenToWorld(live.current.cam, p, width, height);
      return { x: roundMm(w.x), y: roundMm(w.y) };
    };
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const p = canvasPoint(canvas, e);
      pointers.set(e.pointerId, p);
      if (pointers.size > 1) {
        drawing = null;
        setStroke(null);
      } else if (live.current.cutting && e.button === 0) {
        drawing = { pointerId: e.pointerId, points: [toWorld(p)] };
        setStroke(drawing.points.slice());
      }
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const p = canvasPoint(canvas, e);
      if (drawing && drawing.pointerId === e.pointerId) {
        drawing.points.push(toWorld(p));
        setStroke(drawing.points.slice());
      } else if (pointers.size === 1) setCam((c) => panBy(c, p.x - prev.x, p.y - prev.y));
      else if (pointers.size === 2) {
        // The finger that moved, against the one that stayed put.
        const other = [...pointers].find(([id]) => id !== e.pointerId)![1];
        setCam((c) => pinch(c, { a: prev, b: other }, p, other, width, height));
      }
      pointers.set(e.pointerId, p);
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (drawing && drawing.pointerId === e.pointerId) {
        const points = drawing.points;
        drawing = null;
        if (e.type === "pointerup") finishCut(points);
        else setStroke(null);
      }
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
  }, [ref, width, height, setCam, live, setStroke, finishCut]);
}
