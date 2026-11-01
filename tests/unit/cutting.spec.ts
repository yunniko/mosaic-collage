import { describe, expect, it } from "vitest";
import { area, isSimplePolygon, polygonBounds, signedArea } from "@/lib/geometry/polygon";
import type { Vec } from "@/lib/geometry/vec";
import { SHAPE_GENERATORS } from "@/lib/shapes/generators";
import { cutOutline } from "@/lib/shapes/hand";
import { shapeOutline } from "@/lib/shapes/outline";
import { defaultParams } from "@/lib/shapes/params";
import { MIN_PIECE_AREA, OutlineError, checkOutline, repairOutline } from "@/lib/shapes/repair";

/** Each parameter at its minimum, default and maximum, one parameter varied at a time. */
function paramCases(gen: (typeof SHAPE_GENERATORS)[number]) {
  const base = defaultParams(gen.params);
  const cases = [base];
  for (const p of gen.params) {
    cases.push({ ...base, [p.key]: p.min }, { ...base, [p.key]: p.max });
  }
  return cases;
}

function problemOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof OutlineError) return e.problem;
    throw e;
  }
}

const circle = (r: number, n = 120, cx = 0, cy = 0): Vec[] =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
  });

describe("shape generators", () => {
  for (const gen of SHAPE_GENERATORS) {
    it(`${gen.id} makes a valid piece for every seed and parameter extreme`, () => {
      for (const params of paramCases(gen)) {
        for (let seed = 1; seed <= 40; seed++) {
          const o = shapeOutline({ kind: "generated", generatorId: gen.id, params, seed });
          expect(isSimplePolygon(o), `${gen.id} seed ${seed} ${JSON.stringify(params)}`).toBe(true);
          expect(signedArea(o)).toBeGreaterThan(MIN_PIECE_AREA);
        }
      }
    });

    it(`${gen.id} is deterministic per seed and varies between seeds`, () => {
      const params = defaultParams(gen.params);
      const a = shapeOutline({ kind: "generated", generatorId: gen.id, params, seed: 7 });
      const b = shapeOutline({ kind: "generated", generatorId: gen.id, params, seed: 7 });
      const c = shapeOutline({ kind: "generated", generatorId: gen.id, params, seed: 8 });
      expect(b).toEqual(a);
      expect(c).not.toEqual(a);
    });
  }

  it("sizes a blob by its size parameter", () => {
    const o = shapeOutline({ kind: "generated", generatorId: "blob", params: { size: 50, lobes: 3, wobble: 0 }, seed: 3 });
    const b = polygonBounds(o);
    expect(b.maxX - b.minX).toBeCloseTo(50, 0);
  });
});

describe("hand cutting", () => {
  it("keeps a clean stroke at stabilisation 0", () => {
    const o = cutOutline(circle(10), 0);
    expect(isSimplePolygon(o)).toBe(true);
    expect(area(o) / (Math.PI * 100)).toBeGreaterThan(0.98);
  });

  it("smooths a jittery stroke more as stabilisation rises", () => {
    // A circle with a fast zig-zag on its radius, like a shaky hand.
    const shaky = circle(20, 400).map((p, i) => {
      const k = 1 + (i % 2 ? 0.04 : -0.04);
      return { x: p.x * k, y: p.y * k };
    });
    const roughness = (o: Vec[]) => o.reduce((s, p) => s + Math.abs(Math.hypot(p.x, p.y) - 20), 0) / o.length;
    const raw = shapeOutline({ kind: "hand", points: shaky, stabilization: 0 });
    const smooth = shapeOutline({ kind: "hand", points: shaky, stabilization: 60 });
    expect(isSimplePolygon(smooth)).toBe(true);
    expect(roughness(smooth)).toBeLessThan(roughness(raw) / 2);
  });

  it("trims a small loop where the stroke crosses itself", () => {
    // A 20 mm square whose end overshoots the start and comes back, making a 1 mm loop.
    const stroke: Vec[] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
      { x: 0, y: -1 },
      { x: 1, y: -1 },
      { x: 1, y: 1 },
    ];
    const o = cutOutline(stroke, 0);
    expect(isSimplePolygon(o)).toBe(true);
    expect(area(o)).toBeGreaterThan(395);
  });

  it("refuses a figure-eight, which is two pieces", () => {
    const bowtie: Vec[] = [
      { x: 0, y: 0 },
      { x: 20, y: 20 },
      { x: 20, y: 0 },
      { x: 0, y: 20 },
    ];
    expect(problemOf(() => cutOutline(bowtie, 0))).toBe("splits");
  });

  it("refuses a tap or a tiny scribble", () => {
    expect(problemOf(() => cutOutline([{ x: 0, y: 0 }], 0))).toBe("too-few-points");
    expect(problemOf(() => cutOutline(circle(0.5), 0))).toBe("too-small");
  });
});

describe("outline repair", () => {
  it("returns a simple outline unchanged in area", () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(area(repairOutline(sq))).toBeCloseTo(100);
  });

  it("reports a crossing outline as not simple when only checked", () => {
    const crossing = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(problemOf(() => checkOutline(crossing))).toBe("not-simple");
  });
});
