import { describe, expect, it } from "vitest";
import { area, centroid, isSimplePolygon, pointInPolygon, signedArea, simplifyPolygon, resamplePolygon } from "@/lib/geometry/polygon";
import { localToWorld, poseWithLocalAt, rotatePoseAbout, worldToLocal } from "@/lib/geometry/pose";
import { angleDelta } from "@/lib/geometry/vec";
import { fitBounds, screenToWorld, worldToScreen, zoomAt } from "@/lib/view/camera";

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe("polygon", () => {
  it("measures area and centroid", () => {
    expect(area(square)).toBe(100);
    expect(signedArea(square)).toBeGreaterThan(0);
    expect(centroid(square)).toEqual({ x: 5, y: 5 });
  });

  it("tests containment", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
  });

  it("detects a bow-tie as not simple", () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(isSimplePolygon(bowtie)).toBe(false);
    expect(isSimplePolygon(square)).toBe(true);
  });

  it("simplifies a densely resampled square back to its corners", () => {
    const dense = resamplePolygon(square, 0.5);
    expect(dense.length).toBe(80);
    const simple = simplifyPolygon(dense, 0.01);
    expect(simple.length).toBe(4);
    expect(area(simple)).toBeCloseTo(100);
  });
});

describe("pose", () => {
  const pose = { x: 30, y: -12, rotation: 0.7 };

  it("round-trips local and world", () => {
    const w = localToWorld({ x: 3, y: 4 }, pose);
    const l = worldToLocal(w, pose);
    expect(l.x).toBeCloseTo(3);
    expect(l.y).toBeCloseTo(4);
  });

  it("keeps the pivot fixed when turning about it", () => {
    const local = { x: 7, y: -2 };
    const pivot = localToWorld(local, pose);
    const turned = rotatePoseAbout(pose, pivot, 1.1);
    const after = localToWorld(local, turned);
    expect(after.x).toBeCloseTo(pivot.x);
    expect(after.y).toBeCloseTo(pivot.y);
    expect(turned.rotation).toBeCloseTo(1.8);
  });

  it("places a local point at a target", () => {
    const p = poseWithLocalAt({ x: 5, y: 1 }, { x: 100, y: 50 }, 2);
    const w = localToWorld({ x: 5, y: 1 }, p);
    expect(w.x).toBeCloseTo(100);
    expect(w.y).toBeCloseTo(50);
  });

  it("finds the short way between angles", () => {
    expect(angleDelta(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(-0.2);
    expect(angleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6);
  });
});

describe("camera", () => {
  it("keeps the anchor fixed while zooming", () => {
    const cam = { x: 10, y: 20, zoom: 2 };
    const anchor = { x: 130, y: 45 };
    const before = screenToWorld(cam, anchor, 800, 600);
    const after = screenToWorld(zoomAt(cam, anchor, 1.7, 800, 600), anchor, 800, 600);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("round-trips screen and world", () => {
    const cam = { x: -5, y: 3, zoom: 3.5 };
    const s = worldToScreen(cam, { x: 12, y: 9 }, 640, 480);
    const w = screenToWorld(cam, s, 640, 480);
    expect(w.x).toBeCloseTo(12);
    expect(w.y).toBeCloseTo(9);
  });

  it("fits bounds into the view", () => {
    const cam = fitBounds({ minX: 0, minY: 0, maxX: 100, maxY: 50 }, 540, 400, 20);
    expect(cam.zoom).toBeCloseTo(5);
    expect(cam.x).toBe(50);
  });
});
