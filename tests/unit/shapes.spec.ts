import { describe, expect, it } from "vitest";
import { area, centroid, isSimplePolygon, polygonBounds, signedArea } from "@/lib/geometry/polygon";
import { defaultParams, sanitizeParams } from "@/lib/shapes/params";
import { PREDEFINED_SHAPES } from "@/lib/shapes/predefined";
import { UnknownShapeError, shapeOutline } from "@/lib/shapes/outline";

describe("predefined shapes", () => {
  for (const def of PREDEFINED_SHAPES) {
    it(`${def.id} builds a simple, centred, positively wound outline`, () => {
      const o = shapeOutline({ kind: "predefined", shapeId: def.id, params: defaultParams(def.params) });
      expect(o.length).toBeGreaterThanOrEqual(3);
      expect(isSimplePolygon(o)).toBe(true);
      expect(signedArea(o)).toBeGreaterThan(0);
      const c = centroid(o);
      expect(Math.abs(c.x)).toBeLessThan(1e-6);
      expect(Math.abs(c.y)).toBeLessThan(1e-6);
    });
  }

  it("sizes a rectangle by its parameters", () => {
    const o = shapeOutline({ kind: "predefined", shapeId: "rectangle", params: { width: 30, height: 12, radius: 0 } });
    const b = polygonBounds(o);
    expect(b.maxX - b.minX).toBeCloseTo(30);
    expect(b.maxY - b.minY).toBeCloseTo(12);
    expect(area(o)).toBeCloseTo(360);
  });

  it("rounds corners without exceeding half the short side", () => {
    const o = shapeOutline({ kind: "predefined", shapeId: "rectangle", params: { width: 20, height: 10, radius: 50 } });
    expect(isSimplePolygon(o)).toBe(true);
    // A stadium 20 x 10: 10 x 10 square plus a circle of radius 5; arcs are inscribed polygons, so a little less.
    const exact = 100 + Math.PI * 25;
    expect(area(o)).toBeLessThan(exact);
    expect(area(o) / exact).toBeGreaterThan(0.99);
  });

  it("clamps parameters to their ranges", () => {
    const def = PREDEFINED_SHAPES[0];
    const p = sanitizeParams(def.params, { width: -5, height: 1e9, extra: 3 });
    expect(p.width).toBe(4);
    expect(p.height).toBe(400);
    expect("extra" in p).toBe(false);
  });

  it("names an unknown shape", () => {
    expect(() => shapeOutline({ kind: "predefined", shapeId: "nope", params: {} })).toThrow(UnknownShapeError);
  });
});
