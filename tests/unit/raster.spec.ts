import { describe, expect, it } from "vitest";
import { rasterizePolygon } from "@/lib/raster/rasterize";
import { renderPiece } from "@/lib/render/piece";
import { defaultPiece } from "@/lib/document/defaults";
import { pieceOutline } from "@/lib/shapes/outline";

const sum = (a: Float32Array) => a.reduce((s, v) => s + v, 0);

describe("rasterize", () => {
  it("covers exactly the area of an axis-aligned square", () => {
    const m = rasterizePolygon(
      [
        { x: 2, y: 2 },
        { x: 12, y: 2 },
        { x: 12, y: 12 },
        { x: 2, y: 12 },
      ],
      16,
      16
    );
    expect(sum(m.data)).toBeCloseTo(100, 3);
    expect(m.data[5 * 16 + 5]).toBe(1);
    expect(m.data[0]).toBe(0);
  });

  it("gives fractional coverage on a half-pixel edge", () => {
    const m = rasterizePolygon(
      [
        { x: 0, y: 0 },
        { x: 4.5, y: 0 },
        { x: 4.5, y: 4 },
        { x: 0, y: 4 },
      ],
      8,
      8
    );
    expect(m.data[1 * 8 + 4]).toBeCloseTo(0.5, 5);
    expect(m.data[1 * 8 + 5]).toBe(0);
  });

  it("approximates the area of a rotated triangle", () => {
    const tri = [
      { x: 3.3, y: 1.7 },
      { x: 28.1, y: 9.2 },
      { x: 7.9, y: 26.4 },
    ];
    const exact = Math.abs((tri[1].x - tri[0].x) * (tri[2].y - tri[0].y) - (tri[2].x - tri[0].x) * (tri[1].y - tri[0].y)) / 2;
    const m = rasterizePolygon(tri, 32, 32);
    expect(Math.abs(sum(m.data) - exact) / exact).toBeLessThan(0.01);
  });
});

describe("renderPiece", () => {
  it("renders a plain square with the origin at its centre", () => {
    const piece = defaultPiece(0);
    const s = renderPiece(piece, pieceOutline(piece), 2);
    expect(s.image.width).toBe(84);
    expect(s.originX).toBeCloseTo(42);
    const i = (Math.round(s.originY) * s.image.width + Math.round(s.originX)) * 4;
    expect(s.image.data[i + 3]).toBe(255);
    expect(s.image.data[3]).toBe(0);
  });
});
