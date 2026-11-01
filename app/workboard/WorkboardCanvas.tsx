"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { getPiece } from "@/lib/document/ops";
import { newId } from "@/lib/document/defaults";
import type { MosaicDocument, Placement } from "@/lib/document/types";
import { type Pose, transformPolygon, worldToLocal } from "@/lib/geometry/pose";
import { type Bounds, polygonBounds } from "@/lib/geometry/polygon";
import { angleBetween, angleDelta, distance, type Vec } from "@/lib/geometry/vec";
import { pieceOutline } from "@/lib/shapes/outline";
import { type Camera, fitBounds, panBy, pinch, screenToWorld, wheelZoom } from "@/lib/view/camera";
import { type DragState, dragTo, rotateDrag, startDrag } from "@/lib/workboard/drag";
import { type DragRules, moveFree, obstaclesFor, placeFree } from "@/lib/workboard/placement";
import { artworkBounds, hitTest, placedShape } from "@/lib/workboard/scene";
import { CLICK_SLOP, applyCamera, canvasPoint, prepareCanvas, useElementSize } from "../components/canvas-hooks";
import { drawTable } from "../render/surfaces";
import { errorText } from "../state/errors";
import { store, useAppState } from "../state/store";
import { drawArtworkBackground, drawLockBadge, drawOutlineMark, drawPiece, drawPlacements } from "./draw";
import { type IncomingEvent, incoming } from "./incoming";

/** Radians per wheel "notch" (deltaY 100) while dragging: 15°, or 1° with Shift held. */
const WHEEL_ROTATE = (15 * Math.PI) / 180 / 100;
const WHEEL_ROTATE_FINE = Math.PI / 180 / 100;
/** Screen pixels around the view still drawn, so shadows of pieces just outside it are not cut off. */
const CULL_MARGIN_PX = 40;

/** Where a dragged piece came from: a placement held by a board pointer, or a tray piece not yet on the board. */
type DragSource = { kind: "board"; placementId: string; pointerId: number } | { kind: "tray" };

type Gesture =
  | { kind: "none" }
  | { kind: "pan"; pointerId: number; last: Vec; start: Vec; moved: boolean }
  | { kind: "pinch"; last: { a: Vec; b: Vec } }
  | {
      kind: "drag";
      source: DragSource;
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
  textureVersion: number;
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
    const activeId = g.kind === "drag" && g.source.kind === "board" ? g.source.placementId : null;
    const ctx = prepareCanvas(canvas, w, h);

    // The artwork's extent follows the piece in hand too, so the background grows as it is dragged outward.
    const moving =
      g.kind === "drag"
        ? { exclude: activeId ?? undefined, bounds: polygonBounds(transformPolygon(g.state.outline, g.state.pose)) }
        : undefined;
    drawTable(ctx, cam, w, h);
    ctx.save();
    applyCamera(ctx, cam, w, h);
    drawArtworkBackground(ctx, doc, artworkBounds(doc, moving));
    ctx.restore();

    const layer = staticLayer(layerRef, doc, cam, w, h, activeId, store.getState().textureVersion);
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
        // With overlap off, a piece still in a conflict (it came in over others) is outlined in red until it is clear.
        drawOutlineMark(ctx, transformPolygon(g.state.outline, g.state.pose), cam, g.state.clear ? "selected" : "conflict");
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

  /**
   * Records a drop as one undo step: a placement gets its new pose; a piece without one is placed and selected. With
   * overlap off, a drop that would overlap or crowd another piece moves to the nearest free spot.
   */
  const finishDrag = useCallback(
    (pieceId: string, pose: Pose, placementId?: string) => {
      const onError = (e: unknown) => store.notify("error", errorText(t, e));
      if (placementId) {
        store.apply((d) => moveFree(d, placementId, pose), onError);
        return;
      }
      const id = newId();
      if (store.apply((d) => placeFree(d, pieceId, pose, id).doc, onError)) store.set({ selectedPlacementIds: [id] });
    },
    [t]
  );

  // Pointer, wheel and keyboard handling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pointers = pointersRef.current;
    const local = (e: { clientX: number; clientY: number }) => canvasPoint(canvas, e);

    const beginDragOf = (pl: Placement, pointerId: number, screen: Vec) => {
      const doc = store.doc;
      const outline = pieceOutline(getPiece(doc, pl.pieceId));
      const grab = worldToLocal(toWorld(screen), pl.pose);
      gestureRef.current = {
        kind: "drag",
        source: { kind: "board", placementId: pl.id, pointerId },
        pieceId: pl.pieceId,
        state: startDrag(outline, pl.pose, grab, dragRules(doc, pl.id)),
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

      // A piece coming in from the tray keeps the gesture until the tray's pointer drops it.
      if (g.kind === "drag" && g.source.kind === "tray") return;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.entries()];
        if (g.kind === "drag" && g.source.kind === "board") {
          // A second finger while holding a piece turns it about the grab point.
          const held = pointers.get(g.source.pointerId)!;
          g.twist = { pointerId: e.pointerId, angle: angleBetween(held, p) };
          return;
        }
        gestureRef.current = { kind: "pinch", last: { a: a[1], b: b[1] } };
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
        if (distance(p, g.start) > CLICK_SLOP) g.moved = true;
        redraw();
      } else if (g.kind === "pinch" && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        camRef.current = pinch(camRef.current, g.last, a, b, sizeRef.current.width, sizeRef.current.height);
        g.last = { a, b };
        redraw();
      } else if (g.kind === "drag" && g.source.kind === "board") {
        const held = g.source.pointerId;
        if (g.twist && (e.pointerId === g.twist.pointerId || e.pointerId === held)) {
          const angle = angleBetween(pointers.get(held)!, pointers.get(g.twist.pointerId)!);
          g.state = rotateDrag(g.state, angleDelta(g.twist.angle, angle));
          g.twist.angle = angle;
          g.moved = true;
        }
        if (e.pointerId === held) {
          if (distance(p, g.start) > CLICK_SLOP) g.moved = true;
          if (g.moved) g.state = dragTo(g.state, toWorld(p));
        }
        redraw();
      } else if (g.kind === "locked" && !g.warned && distance(p, g.start) > CLICK_SLOP) {
        g.warned = true;
        store.notify("info", t("workboard.lockedNotice"));
      }
    };

    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      const g = gestureRef.current;
      if (g.kind === "drag") {
        // A tray drag belongs to the tray's pointer; its drop arrives through `incoming`.
        if (g.source.kind !== "board") return;
        if (g.twist && e.pointerId === g.twist.pointerId) {
          g.twist = null;
          return;
        }
        if (e.pointerId !== g.source.pointerId) return;
        gestureRef.current = { kind: "none" };
        if (e.type !== "pointercancel" && g.moved) finishDrag(g.pieceId, g.state.pose, g.source.placementId);
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
        camRef.current = wheelZoom(camRef.current, local(e), delta, sizeRef.current.width, sizeRef.current.height);
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
    return incoming.subscribe((e: IncomingEvent) => {
      const g = gestureRef.current;
      const fromTray = g.kind === "drag" && g.source.kind === "tray" ? g : null;
      if (e.phase === "click") {
        // A click on the tray places the piece in the middle of the view.
        const { width: w, height: h } = sizeRef.current;
        const centre = toWorld({ x: w / 2, y: h / 2 });
        finishDrag(e.pieceId, { x: centre.x, y: centre.y, rotation: 0 });
      } else if (e.phase === "cancel") {
        if (fromTray) gestureRef.current = { kind: "none" };
      } else {
        const p = canvasPoint(canvas, e);
        const over = p.x >= 0 && p.y >= 0 && p.x <= sizeRef.current.width && p.y <= sizeRef.current.height;
        if (e.phase === "drop" || !over) {
          if (fromTray && e.phase === "drop" && over) finishDrag(fromTray.pieceId, fromTray.state.pose);
          if (fromTray) gestureRef.current = { kind: "none" };
        } else if (fromTray) {
          fromTray.state = dragTo(fromTray.state, toWorld(p));
        } else if (g.kind !== "drag") {
          const outline = pieceOutline(getPiece(store.doc, e.pieceId));
          gestureRef.current = {
            kind: "drag",
            source: { kind: "tray" },
            pieceId: e.pieceId,
            // Held by its centre, starting under the pointer: it follows freely until it is clear of other pieces.
            state: startDrag(outline, { ...toWorld(p), rotation: 0 }, { x: 0, y: 0 }, dragRules(store.doc)),
            start: p,
            moved: true,
            twist: null,
          };
        }
      }
      redraw();
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

/**
 * The cached layer of all pieces but `exclude`; rebuilt only when the document, the view, the excluded piece or a
 * decoded texture changes.
 */
function staticLayer(
  ref: React.RefObject<StaticLayer | null>,
  doc: MosaicDocument,
  cam: Camera,
  w: number,
  h: number,
  exclude: string | null,
  textureVersion: number
): HTMLCanvasElement {
  const cur = ref.current;
  if (
    cur &&
    cur.doc === doc &&
    cur.exclude === exclude &&
    cur.textureVersion === textureVersion &&
    cur.w === w &&
    cur.h === h &&
    sameCam(cur.cam, cam)
  )
    return cur.canvas;
  const canvas = cur?.canvas ?? document.createElement("canvas");
  const ctx = prepareCanvas(canvas, w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  applyCamera(ctx, cam, w, h);
  drawPlacements(ctx, doc, exclude ? doc.placements.filter((p) => p.id !== exclude) : doc.placements, cam, viewBounds(cam, w, h));
  ctx.restore();
  ref.current = { canvas, cam: { ...cam }, w, h, doc, exclude, textureVersion };
  return canvas;
}

const dragRules = (doc: MosaicDocument, excludeId?: string): DragRules => ({
  obstacles: obstaclesFor(doc, excludeId),
  autoRotate: doc.board.autoRotate,
});

const sameCam = (a: Camera, b: Camera) => a.x === b.x && a.y === b.y && a.zoom === b.zoom;

/** The board area the view shows, in mm, widened by `CULL_MARGIN_PX`. */
function viewBounds(cam: Camera, w: number, h: number): Bounds {
  const hw = (w / 2 + CULL_MARGIN_PX) / cam.zoom;
  const hh = (h / 2 + CULL_MARGIN_PX) / cam.zoom;
  return { minX: cam.x - hw, minY: cam.y - hh, maxX: cam.x + hw, maxY: cam.y + hh };
}
