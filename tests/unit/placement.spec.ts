import { describe, expect, it } from "vitest";
import { createDocument, defaultPiece } from "@/lib/document/defaults";
import { addPiece, placePiece, setBoard } from "@/lib/document/ops";
import type { MosaicDocument } from "@/lib/document/types";
import { clashes, edgeIndex, nearestApproach, segmentGap } from "@/lib/geometry/collision";
import { pointInPolygon, polygonBounds, type Polygon } from "@/lib/geometry/polygon";
import { type Pose, transformPolygon } from "@/lib/geometry/pose";
import { distance, type Vec } from "@/lib/geometry/vec";
import { createRng } from "@/lib/random";
import { SHAPE_GENERATORS } from "@/lib/shapes/generators";
import { shapeOutline } from "@/lib/shapes/outline";
import { defaultParams } from "@/lib/shapes/params";
import { constrainMove, constrainTurn, isFree, nearestFree, obstaclesFor } from "@/lib/workboard/placement";

const rect = (w: number, h: number, cx = 0, cy = 0): Polygon => [
  { x: cx - w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy + h / 2 },
  { x: cx - w / 2, y: cy + h / 2 },
];

/** A U open at the top: 30 wide, 30 tall, arms 5 thick, the notch 20 wide and 25 deep. */
const U: Polygon = [
  { x: -15, y: -15 },
  { x: -10, y: -15 },
  { x: -10, y: 10 },
  { x: 10, y: 10 },
  { x: 10, y: -15 },
  { x: 15, y: -15 },
  { x: 15, y: 15 },
  { x: -15, y: 15 },
];

const clash = (a: Polygon, b: Polygon, margin: number) => clashes(a, polygonBounds(a), edgeIndex(b, margin + 0.5), margin);

/** The gap between two outlines the slow way: every edge pair, plus containment. */
function referenceGap(a: Polygon, b: Polygon): number {
  if (pointInPolygon(a[0], b) || pointInPolygon(b[0], a)) return 0;
  let best = Infinity;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      best = Math.min(best, segmentGap(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]).gap);
    }
  }
  return best;
}

describe("clearance between outlines", () => {
  it("measures the margin between separate pieces", () => {
    const a = rect(10, 10);
    expect(clash(a, rect(10, 10, 13, 0), 2)).toBe(false);
    expect(clash(a, rect(10, 10, 11.5, 0), 2)).toBe(true);
    expect(clash(a, rect(10, 10, 8, 3), 0)).toBe(true);
  });

  it("allows touching at margin 0 but not overlapping", () => {
    const a = rect(10, 10);
    expect(clash(a, rect(10, 10, 10, 0), 0)).toBe(false);
    expect(clash(a, rect(10, 10, 9.9, 0), 0)).toBe(true);
  });

  it("finds a piece wholly inside another, either way round", () => {
    expect(clash(rect(4, 4), rect(40, 40), 0)).toBe(true);
    expect(clash(rect(40, 40), rect(4, 4), 0)).toBe(true);
  });

  it("lets a piece sit inside a concave notch without touching", () => {
    // The box sits in the U's notch, 1 mm from both arms and the floor, though their bounds overlap fully.
    const inNotch = rect(18, 10, 0, 4);
    expect(clash(inNotch, U, 0.9)).toBe(false);
    expect(clash(inNotch, U, 1.1)).toBe(true);
  });

  it("agrees with an all-pairs reference on generated shapes", () => {
    const rng = createRng(11);
    const shapes = SHAPE_GENERATORS.map((g) =>
      shapeOutline({ kind: "generated", generatorId: g.id, params: defaultParams(g.params), seed: 5 })
    );
    let near = 0;
    for (let trial = 0; trial < 300; trial++) {
      const a = transformPolygon(shapes[trial % shapes.length], { x: 0, y: 0, rotation: rng() * 6.3 });
      const pose: Pose = { x: (rng() - 0.5) * 80, y: (rng() - 0.5) * 80, rotation: rng() * 6.3 };
      const b = transformPolygon(shapes[(trial * 7 + 1) % shapes.length], pose);
      const margin = rng() * 4;
      const gap = referenceGap(a, b);
      // Cases within a hair of the margin are left to rounding.
      if (Math.abs(gap - margin) < 1e-6) continue;
      if (Math.abs(gap - margin) < 2) near++;
      expect(clash(a, b, margin), `trial ${trial}: gap ${gap}, margin ${margin}`).toBe(gap < margin || gap === 0);
    }
    // The sweep must have tested close calls, not only pieces far apart.
    expect(near).toBeGreaterThan(20);
  });

  it("finds the point of nearest approach", () => {
    const a = rect(10, 10);
    const near = nearestApproach(a, edgeIndex(rect(10, 10, 11, 0), 2))!;
    expect(near.gap).toBeCloseTo(1, 6);
    expect(near.at.x).toBeCloseTo(5, 6);
  });
});

function board(margin: number, autoRotate = false): { doc: MosaicDocument; outline: Polygon } {
  const piece = defaultPiece(0);
  let doc = addPiece(createDocument(), piece);
  doc = setBoard(doc, { allowOverlap: false, margin, autoRotate });
  // One fixed piece at the origin.
  doc = placePiece(doc, piece.id, { x: 0, y: 0, rotation: 0 }).doc;
  return { doc, outline: shapeOutline(piece.shape) };
}

const gapBetween = (outline: Polygon, a: Pose, b: Pose) => referenceGap(transformPolygon(outline, a), transformPolygon(outline, b));

describe("no-overlap dragging", () => {
  const origin: Pose = { x: 0, y: 0, rotation: 0 };

  it("prepares no obstacles while overlap is allowed", () => {
    const { doc } = board(2);
    expect(obstaclesFor(setBoard(doc, { allowOverlap: true }))).toBeNull();
    expect(obstaclesFor(doc)!.items).toHaveLength(1);
    expect(obstaclesFor(doc, doc.placements[0].id)!.items).toHaveLength(0);
  });

  it("stops a pushed piece at the margin", () => {
    const { doc, outline } = board(2);
    const rules = { obstacles: obstaclesFor(doc), autoRotate: false };
    const start: Pose = { x: -80, y: 0, rotation: 0 };
    const target: Pose = { x: -5, y: 0, rotation: 0 };
    const { pose, clear } = constrainMove(rules, outline, { pose: start, clear: true }, target, { x: 0, y: 0 }, target);
    expect(clear).toBe(true);
    expect(pose.rotation).toBe(0);
    expect(pose.x).toBeLessThan(-5);
    const gap = gapBetween(outline, pose, origin);
    expect(gap).toBeGreaterThanOrEqual(2);
    expect(gap).toBeLessThan(2.01);
  });

  it("jumps to the pointer once the spot there is free", () => {
    const { doc, outline } = board(2);
    const rules = { obstacles: obstaclesFor(doc), autoRotate: true };
    const target: Pose = { x: 80, y: 0, rotation: 0 };
    const current = { pose: { x: -80, y: 0, rotation: 0 }, clear: true };
    expect(constrainMove(rules, outline, current, target, { x: 0, y: 0 }, target)).toEqual({ pose: target, clear: true });
  });

  it("swings about the contact point toward the pointer with auto-rotate on", () => {
    const { doc, outline } = board(1, true);
    const rules = { obstacles: obstaclesFor(doc), autoRotate: true };
    const fixed = polygonBounds(outline);
    const cy = (fixed.minY + fixed.maxY) / 2;
    // A diamond held by its centre, pushed right until its corner meets the fixed piece, while the pointer pulls upward.
    const diamond = rect(10, 10);
    const start: Pose = { x: fixed.minX - 30, y: cy, rotation: Math.PI / 4 };
    const target: Pose = { x: fixed.minX, y: cy, rotation: Math.PI / 4 };
    const pointer: Vec = { x: fixed.minX, y: cy - 20 };
    const { pose } = constrainMove(rules, diamond, { pose: start, clear: true }, target, { x: 0, y: 0 }, pointer);
    // It swings about the corner toward the pointer, until a side would come within the margin: under 45° more.
    const turned = Math.abs(pose.rotation - Math.PI / 4);
    expect(turned).toBeGreaterThan(0.1);
    expect(turned).toBeLessThan(Math.PI / 4 + 0.01);
    expect(isFree(rules.obstacles, diamond, pose)).toBe(true);
    expect(referenceGap(transformPolygon(diamond, pose), transformPolygon(outline, origin))).toBeLessThan(1.05);
  });

  it("lets a piece already in a conflict move freely", () => {
    const { doc, outline } = board(2);
    const rules = { obstacles: obstaclesFor(doc), autoRotate: true };
    const target: Pose = { x: 3, y: 2, rotation: 0 };
    const current = { pose: { x: 1, y: 1, rotation: 0 }, clear: false };
    expect(constrainMove(rules, outline, current, target, { x: 0, y: 0 }, target)).toEqual({ pose: target, clear: false });
  });

  it("stops a turn at contact", () => {
    const { doc, outline } = board(1);
    const obstacles = obstaclesFor(doc);
    // Just right of the fixed piece: turning about its own centre swings its corners into the gap.
    const b = polygonBounds(outline);
    const start: Pose = { x: b.maxX - b.minX + 1.5, y: 0, rotation: 0 };
    expect(isFree(obstacles, outline, start)).toBe(true);
    const { pose } = constrainTurn(obstacles, outline, { pose: start, clear: true }, start, Math.PI / 4);
    expect(pose.rotation).toBeGreaterThan(0);
    expect(pose.rotation).toBeLessThan(Math.PI / 4);
    expect(isFree(obstacles, outline, pose)).toBe(true);
    expect(distance(pose, start)).toBeLessThan(1e-9);
  });

  it("moves a crowded drop to the nearest free spot", () => {
    const { doc, outline } = board(2);
    const obstacles = obstaclesFor(doc);
    const free: Pose = { x: 200, y: 0, rotation: 0 };
    expect(nearestFree(obstacles, outline, free)).toBe(free);
    const pose = nearestFree(obstacles, outline, { x: 2, y: 1, rotation: 0.2 });
    expect(isFree(obstacles, outline, pose)).toBe(true);
    expect(pose.rotation).toBe(0.2);
    const b = polygonBounds(outline);
    // No further than one piece across plus the margin and a search step or two.
    expect(distance(pose, { x: 2, y: 1 })).toBeLessThan(Math.hypot(b.maxX - b.minX, b.maxY - b.minY) + 2 + 10);
  });
});
