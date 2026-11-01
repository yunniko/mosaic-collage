"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { getPiece, movePlacement, placePiece } from "@/lib/document/ops";
import type { MosaicDocument, Placement } from "@/lib/document/types";
import { type Pose, transformPolygon, worldToLocal } from "@/lib/geometry/pose";
import { angleDelta, type Vec } from "@/lib/geometry/vec";
import { pieceOutline } from "@/lib/shapes/outline";
import { type Camera, fitBounds, panBy, screenToWorld, zoomAt } from "@/lib/view/camera";
import { type DragState, dragTo, rotateDrag, startDrag } from "@/lib/workboard/drag";
import { artworkBounds, hitTest, placedShape } from "@/lib/workboard/scene";
import { prepareCanvas, useElementSize } from "../components/canvas-hooks";
import { drawTable } from "../render/surfaces";
import { errorText } from "../state/errors";
import { store, useAppState } from "../state/store";
import { applyCamera, drawArtworkBackground, drawLockBadge, drawOutlineMark, drawPiece, drawPlacements } from "./draw";
import { type IncomingPiece, incoming } from "./incoming";

/** Radians per wheel "notch" (deltaY 100) while dragging: 15°, or 1° with Shift held. */
const WHEEL_ROTATE = (15 * Math.PI) / 180 / 100;
const WHEEL_ROTATE_FINE = Math.PI / 180 / 100;
/** Screen pixels a press may wander before it counts as a drag rather than a click. */
const CLICK_SLOP = 4;

type Gesture =
  | { kind: "none" }
  | { kind: "pan"; pointerId: number; last: Vec; start: Vec; moved: boolean }
  | { kind: "pinch"; last: { d: number; mid: Vec } }
  | {
      kind: "drag";
      pointerId: number;
      /** null while a piece comes in from the tray and is not yet on the board. */
      placementId: string | null;
      pieceId: string;
      state: DragState;
      start: Vec;
      moved: boolean;
      /** A second finger turning the piece: its id and the angle of the line between the two fingers. */
      twist: { pointerId: number; angle: number } | null;
    }
  | { kind: "locked"; pointerId: number; start: Vec; warned: boolean };

/** The static layer: every piece but the one in hand, redrawn only when they or the view change. */
interface StaticLayer {
  canvas: HTMLCanvasElement;
  cam: Camera;
  w: number;
  h: number;
  doc: MosaicDocument;
  exclude: string | null;
}

export function WorkboardCanvas() {
  const t = useTranslations();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = useElementSize(wrapRef);
  const camRef = useRef<Camera>({ x: 0, y: 0, zoom: 3 });
  const gestureRef = useRef<Gesture>({ kind: "none" });
  const pointersRef = useRef(new Map<number, Vec>());
  const layerRef = useRef<StaticLayer | null>(null);
  const frameRef = useRef(0);
  const sizeRef = useRef({ width, height });
  useLayoutEffect(() => {
    sizeRef.current = { width, height };
  }, [width, height]);
  const fitRequest = useAppState((s) => s.fitRequest);

  const draw = useCallback(() => {
    frameRef.current = 0;
    const canvas = canvasRef.current;
    const { width: w, height: h } = sizeRef.current;
    if (!canvas || !w || !h) return;
    const doc = store.doc;
    const cam = camRef.current;
    const g = gestureRef.current;
    const activeId = g.kind === "drag" ? g.placementId : null;
    const ctx = prepareCanvas(canvas, w, h);

    // The artwork's extent follows the piece in hand too, so the background grows as it is dragged outward.
    const shown = g.kind === "drag" ? withPose(doc, g) : doc;
    drawTable(ctx, cam, w, h);
    ctx.save();
    applyCamera(ctx, cam, w, h);
    drawArtworkBackground(ctx, shown);
    ctx.restore();

    const layer = staticLayer(layerRef, doc, cam, w, h, activeId);
    ctx.drawImage(layer, 0, 0, w, h);

    ctx.save();
    applyCamera(ctx, cam, w, h);
    const sel = new Set(store.getState().selectedPlacementIds);
    for (const pl of doc.placements) {
      if (pl.id === activeId) continue;
      const s = placedShape(doc, pl);
      if (pl.locked) {
        drawOutlineMark(ctx, s.outline, cam, "locked");
        drawLockBadge(ctx, s.bounds.maxX, s.bounds.minY, cam);
      }
      if (sel.has(pl.id)) drawOutlineMark(ctx, s.outline, cam, "selected");
    }
    if (g.kind === "drag") {
      const piece = doc.pieces.find((p) => p.id === g.pieceId);
      if (piece) {
        drawPiece(ctx, piece, g.state.pose, cam, Math.max(doc.board.shadow, 0.6), true);
        drawOutlineMark(ctx, transformPolygon(g.state.outline, g.state.pose), cam, "selected");
      }
    }
    ctx.restore();
  }, []);

  const redraw = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => store.subscribe(redraw), [redraw]);
  useEffect(redraw, [width, height, redraw]);

  // Fit the artwork into view on first show and whenever a file is opened.
  useEffect(() => {
    if (!width || !height) return;
    const b = artworkBounds(store.doc);
    camRef.current = b ? fitBounds(b, width, height, 40, 6) : { x: 0, y: 0, zoom: 3 };
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on a fit request or the first measured size.
  }, [fitRequest, width > 0 && height > 0]);

  const toWorld = useCallback((p: Vec) => screenToWorld(camRef.current, p, sizeRef.current.width, sizeRef.current.height), []);

  /** Ends a drag: a moved placement is recorded as one undo step; a piece from the tray is placed. */
  const finishDrag = useCallback(
    (g: Extract<Gesture, { kind: "drag" }>) => {
      const onError = (e: unknown) => store.notify("error", errorText(t, e));
      if (g.placementId === null) {
        let id = "";
        store.apply((d) => {
          const r = placePiece(d, g.pieceId, g.state.pose);
          id = r.id;
          return r.doc;
        }, onError);
        if (id) store.set({ selectedPlacementIds: [id] });
      } else if (g.moved) {
        store.apply((d) => movePlacement(d, g.placementId!, g.state.pose), onError);
      }
    },
    [t]
  );

  // Pointer, wheel and keyboard handling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pointers = pointersRef.current;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const beginDragOf = (pl: Placement, pointerId: number, screen: Vec) => {
      const doc = store.doc;
      const outline = pieceOutline(getPiece(doc, pl.pieceId));
      const grab = worldToLocal(toWorld(screen), pl.pose);
      gestureRef.current = {
        kind: "drag",
        pointerId,
        placementId: pl.id,
        pieceId: pl.pieceId,
        state: startDrag(outline, pl.pose, grab),
        start: screen,
        moved: false,
        twist: null,
      };
    };

    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      const g = gestureRef.current;

      if (pointers.size === 2) {
        const [a, b] = [...pointers.entries()];
        if (g.kind === "drag") {
          // A second finger while holding a piece turns it about the grab point.
          const other = a[0] === g.pointerId ? b[1] : a[1];
          const held = pointers.get(g.pointerId)!;
          g.twist = { pointerId: e.pointerId, angle: Math.atan2(other.y - held.y, other.x - held.x) };
          return;
        }
        gestureRef.current = { kind: "pinch", last: { d: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y), mid: mid(a[1], b[1]) } };
        return;
      }
      if (pointers.size > 2) return;

      const doc = store.doc;
      const hit = hitTest(doc, toWorld(p));
      if (!hit) {
        gestureRef.current = { kind: "pan", pointerId: e.pointerId, last: p, start: p, moved: false };
        return;
      }
      const sel = store.getState().selectedPlacementIds;
      if (e.shiftKey) {
        store.set({ selectedPlacementIds: sel.includes(hit.id) ? sel.filter((x) => x !== hit.id) : [...sel, hit.id] });
        gestureRef.current = { kind: "none" };
        return;
      }
      if (!sel.includes(hit.id) || sel.length > 1) store.set({ selectedPlacementIds: [hit.id] });
      if (hit.locked) {
        gestureRef.current = { kind: "locked", pointerId: e.pointerId, start: p, warned: false };
        return;
      }
      beginDragOf(hit, e.pointerId, p);
      redraw();
    };

    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const p = local(e);
      pointers.set(e.pointerId, p);
      const g = gestureRef.current;
      if (g.kind === "pan" && e.pointerId === g.pointerId) {
        camRef.current = panBy(camRef.current, p.x - g.last.x, p.y - g.last.y);
        g.last = p;
        if (Math.hypot(p.x - g.start.x, p.y - g.start.y) > CLICK_SLOP) g.moved = true;
        redraw();
      } else if (g.kind === "pinch" && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const m = mid(a, b);
        let cam = panBy(camRef.current, m.x - g.last.mid.x, m.y - g.last.mid.y);
        if (g.last.d > 0) cam = zoomAt(cam, m, d / g.last.d, sizeRef.current.width, sizeRef.current.height);
        camRef.current = cam;
        g.last = { d, mid: m };
        redraw();
      } else if (g.kind === "drag") {
        if (g.twist && (e.pointerId === g.twist.pointerId || e.pointerId === g.pointerId)) {
          const held = pointers.get(g.pointerId)!;
          const other = pointers.get(g.twist.pointerId)!;
          const angle = Math.atan2(other.y - held.y, other.x - held.x);
          g.state = rotateDrag(g.state, angleDelta(g.twist.angle, angle));
          g.twist.angle = angle;
          g.moved = true;
        }
        if (e.pointerId === g.pointerId) {
          if (Math.hypot(p.x - g.start.x, p.y - g.start.y) > CLICK_SLOP) g.moved = true;
          if (g.moved) g.state = dragTo(g.state, toWorld(p));
        }
        redraw();
      } else if (g.kind === "locked" && !g.warned && Math.hypot(p.x - g.start.x, p.y - g.start.y) > CLICK_SLOP) {
        g.warned = true;
        store.notify("info", t("workboard.lockedNotice"));
      }
    };

    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      const g = gestureRef.current;
      if (g.kind === "drag") {
        if (g.twist && e.pointerId === g.twist.pointerId) {
          g.twist = null;
          return;
        }
        if (e.pointerId !== g.pointerId) return;
        gestureRef.current = { kind: "none" };
        if (e.type === "pointercancel") {
          redraw();
          return;
        }
        finishDrag(g);
        redraw();
        return;
      }
      if (g.kind === "pan" && e.pointerId === g.pointerId && !g.moved) store.set({ selectedPlacementIds: [] });
      if (pointers.size === 0) gestureRef.current = { kind: "none" };
      else if (g.kind === "pinch") {
        // Lifting one finger of a pinch carries on as a pan with the other.
        const [id, last] = [...pointers.entries()][0];
        gestureRef.current = { kind: "pan", pointerId: id, last, start: last, moved: true };
      }
    };

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const g = gestureRef.current;
      const delta = e.deltaY || e.deltaX;
      if (g.kind === "drag") {
        g.state = rotateDrag(g.state, delta * (e.shiftKey ? WHEEL_ROTATE_FINE : WHEEL_ROTATE));
        g.moved = true;
      } else {
        camRef.current = zoomAt(camRef.current, local(e), Math.exp(-delta * 0.0015), sizeRef.current.width, sizeRef.current.height);
      }
      redraw();
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
  }, [redraw, toWorld, finishDrag, t]);

  // A piece dragged in from the tray: it joins as a drag gesture once the pointer is over the board.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return incoming.subscribe((inc: IncomingPiece | null, phase) => {
      const r = canvas.getBoundingClientRect();
      if (!inc) return;
      const p = { x: inc.clientX - r.left, y: inc.clientY - r.top };
      const over = p.x >= 0 && p.y >= 0 && p.x <= r.width && p.y <= r.height;
      const g = gestureRef.current;
      if (phase === "move") {
        if (over && g.kind !== "drag") {
          const outline = pieceOutline(getPiece(store.doc, inc.pieceId));
          gestureRef.current = {
            kind: "drag",
            pointerId: -1,
            placementId: null,
            pieceId: inc.pieceId,
            state: dragTo(startDrag(outline, { x: 0, y: 0, rotation: 0 }, { x: 0, y: 0 }), toWorld(p)),
            start: p,
            moved: true,
            twist: null,
          };
        } else if (over && g.kind === "drag" && g.placementId === null) {
          g.state = dragTo(g.state, toWorld(p));
        } else if (!over && g.kind === "drag" && g.placementId === null) {
          gestureRef.current = { kind: "none" };
        }
        redraw();
      } else if (phase === "wheel" && g.kind === "drag" && g.placementId === null) {
        g.state = rotateDrag(g.state, inc.wheel * WHEEL_ROTATE);
        redraw();
      } else if (phase === "drop") {
        if (g.kind === "drag" && g.placementId === null && over) finishDrag(g);
        gestureRef.current = { kind: "none" };
        redraw();
      } else if (phase === "click") {
        // A click on the tray places the piece in the middle of the view.
        const outline = pieceOutline(getPiece(store.doc, inc.pieceId));
        const centre = toWorld({ x: r.width / 2, y: r.height / 2 });
        const state = startDrag(outline, { x: centre.x, y: centre.y, rotation: 0 }, { x: 0, y: 0 });
        finishDrag({
          kind: "drag",
          pointerId: -1,
          placementId: null,
          pieceId: inc.pieceId,
          state,
          start: centre,
          moved: true,
          twist: null,
        });
        redraw();
      }
    });
  }, [redraw, toWorld, finishDrag]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="board cursor-grab active:cursor-grabbing"
        style={{ width, height }}
        data-testid="workboard-canvas"
      />
    </div>
  );
}

const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The document as shown mid-drag: the piece in hand at its current pose, or (from the tray) added at the end. */
function withPose(doc: MosaicDocument, g: Extract<Gesture, { kind: "drag" }>): MosaicDocument {
  const pose: Pose = g.state.pose;
  if (g.placementId === null)
    return { ...doc, placements: [...doc.placements, { id: "__incoming", pieceId: g.pieceId, pose, locked: false }] };
  return { ...doc, placements: doc.placements.map((p) => (p.id === g.placementId ? { ...p, pose } : p)) };
}

/** The cached layer of all pieces but `exclude`; rebuilt only when the document, the view or the excluded piece changes. */
function staticLayer(
  ref: React.RefObject<StaticLayer | null>,
  doc: MosaicDocument,
  cam: Camera,
  w: number,
  h: number,
  exclude: string | null
): HTMLCanvasElement {
  const cur = ref.current;
  if (cur && cur.doc === doc && cur.exclude === exclude && cur.w === w && cur.h === h && sameCam(cur.cam, cam)) return cur.canvas;
  const canvas = cur?.canvas ?? document.createElement("canvas");
  const ctx = prepareCanvas(canvas, w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  applyCamera(ctx, cam, w, h);
  drawPlacements(ctx, doc, exclude ? doc.placements.filter((p) => p.id !== exclude) : doc.placements, cam);
  ctx.restore();
  ref.current = { canvas, cam: { ...cam }, w, h, doc, exclude };
  return canvas;
}

const sameCam = (a: Camera, b: Camera) => a.x === b.x && a.y === b.y && a.zoom === b.zoom;
