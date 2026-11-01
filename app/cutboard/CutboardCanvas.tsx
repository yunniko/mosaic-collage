"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { updatePiece } from "@/lib/document/ops";
import type { ShapeSource } from "@/lib/document/types";
import { type Bounds, polygonBounds } from "@/lib/geometry/polygon";
import { type Vec, distance } from "@/lib/geometry/vec";
import { STABILIZATION, STROKE_MIN_STEP_MM } from "@/lib/shapes/hand";
import { pieceOutline } from "@/lib/shapes/outline";
import { type Camera, fitBounds, panBy, pinch, screenToWorld, wheelZoom } from "@/lib/view/camera";
import { applyCamera, canvasPoint, dpr, prepareCanvas, useElementSize } from "../components/canvas-hooks";
import { drawSpriteAtOrigin, getSprite } from "../render/sprites";
import { drawCuttingMat } from "../render/surfaces";
import { errorText } from "../state/errors";
import { store, useAppState, useCutting, useDoc } from "../state/store";

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
  const cutting = useCutting();
  const textureVersion = useAppState((s) => s.textureVersion);
  // The stroke being drawn lives in a ref and is repainted at most once a frame, not copied into state per move.
  const strokeRef = useRef<Vec[] | null>(null);
  const [strokeFrame, setStrokeFrame] = useState(0);
  const pendingFrame = useRef(0);
  const showStroke = useCallback((points: Vec[] | null) => {
    strokeRef.current = points;
    if (pendingFrame.current) return;
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = 0;
      setStrokeFrame((n) => n + 1);
    });
  }, []);
  useEffect(
    () => () => {
      cancelAnimationFrame(pendingFrame.current);
      pendingFrame.current = 0;
    },
    []
  );
  const bounds: Bounds | null = useMemo(() => {
    if (!piece) return null;
    try {
      return polygonBounds(pieceOutline(piece));
    } catch {
      return null;
    }
  }, [piece]);

  // The view is re-framed when another piece is selected, the board is resized, or the shape becomes a different kind
  // of shape (another predefined shape or generator, a new hand cut); tuning the same shape's parameters keeps it.
  // A pan or zoom is kept against the frame it was made in, so a new frame simply supersedes it.
  const frameKey = `${piece?.id}|${piece ? shapeFamily(piece.shape) : ""}|${width}|${height}`;
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
    const stroke = strokeRef.current;
    if (piece && !(cutting && stroke)) drawPiece(ctx, piece, cam, width, height, cutting ? 0.3 : 1);
    if (stroke) drawStroke(ctx, stroke, cam, width, height);
  }, [piece, cam, width, height, cutting, strokeFrame, textureVersion]);

  // The handlers below are bound once per board size; they read the latest render through this ref.
  const live = useRef({ cam, piece, cutting });
  useLayoutEffect(() => {
    live.current = { cam, piece, cutting };
  }, [cam, piece, cutting]);

  const cancelCut = useCallback(() => {
    showStroke(null);
    store.set({ cuttingPieceId: null });
  }, [showStroke]);
  useEffect(() => {
    if (!cutting) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelCut();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [cutting, cancelCut]);

  const finishCut = useCallback(
    (points: Vec[], pieceId: string) => {
      showStroke(null);
      const current = live.current.piece;
      // The cut may have been cancelled (Esc) or the selection changed while the stroke was being drawn.
      if (!live.current.cutting || !current || current.id !== pieceId) return;
      // A click or tap is not a cut attempt: stay in cut mode without complaint.
      if (points.length < 3) return;
      const stabilization = current.shape.kind === "hand" ? current.shape.stabilization : STABILIZATION.default;
      const shape = { kind: "hand" as const, points, stabilization };
      const ok = store.apply(
        (d) => updatePiece(d, { ...current, shape }),
        (e) => store.notify("error", errorText(t, e))
      );
      // A refused cut keeps cut mode on, so the user can simply draw again.
      if (ok) store.set({ cuttingPieceId: null });
    },
    [t, showStroke]
  );

  useBoardPointers(canvasRef, { width, height, setCam, live, showStroke, finishCut });

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
  for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
  ctx.stroke();
  ctx.setLineDash([6 / cam.zoom, 4 / cam.zoom]);
  ctx.beginPath();
  ctx.moveTo(stroke[stroke.length - 1].x, stroke[stroke.length - 1].y);
  ctx.lineTo(stroke[0].x, stroke[0].y);
  ctx.stroke();
  ctx.restore();
}

/** What identifies a shape for framing: its kind and template, or for a hand cut, the stroke itself. */
const strokeIds = new WeakMap<Vec[], number>();
let nextStrokeId = 0;
function shapeFamily(shape: ShapeSource): string {
  switch (shape.kind) {
    case "predefined":
      return `p:${shape.shapeId}`;
    case "generated":
      return `g:${shape.generatorId}`;
    case "hand": {
      let id = strokeIds.get(shape.points);
      if (id === undefined) strokeIds.set(shape.points, (id = ++nextStrokeId));
      return `h:${id}`;
    }
  }
}

/** Stroke points are kept to a hundredth of a millimetre: finer than any hand, and it keeps saved files small. */
const roundMm = (v: number) => Math.round(v * 100) / 100;

/**
 * Mouse/touch handling for the cutboard. Outside cut mode every drag pans. In cut mode the first pointer (the mouse's
 * main button) draws a stroke; a second finger abandons it and pinches instead, so the view can always be moved.
 */
function useBoardPointers(
  ref: React.RefObject<HTMLCanvasElement | null>,
  opts: {
    width: number;
    height: number;
    setCam: (f: (c: Camera) => Camera) => void;
    live: React.RefObject<{ cam: Camera; cutting: boolean; piece: { id: string } | null }>;
    showStroke: (points: Vec[] | null) => void;
    finishCut: (points: Vec[], pieceId: string) => void;
  }
) {
  const { width, height, setCam, live, showStroke, finishCut } = opts;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const pointers = new Map<number, Vec>();
    let drawing: { pointerId: number; pieceId: string; points: Vec[] } | null = null;
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
        showStroke(null);
      } else if (live.current.cutting && live.current.piece && e.button === 0) {
        drawing = { pointerId: e.pointerId, pieceId: live.current.piece.id, points: [toWorld(p)] };
        showStroke(drawing.points);
      }
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const p = canvasPoint(canvas, e);
      if (drawing && drawing.pointerId === e.pointerId) {
        const w = toWorld(p);
        // Points closer than the cutter's own minimum step add nothing but file size.
        if (distance(w, drawing.points[drawing.points.length - 1]) > STROKE_MIN_STEP_MM) drawing.points.push(w);
        showStroke(drawing.points);
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
        const { points, pieceId } = drawing;
        drawing = null;
        if (e.type === "pointerup") finishCut(points, pieceId);
        else showStroke(null);
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
  }, [ref, width, height, setCam, live, showStroke, finishCut]);
}
