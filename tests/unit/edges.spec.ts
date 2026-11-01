import { describe, expect, it } from "vitest";
import { defaultPiece, defaultTornEdge } from "@/lib/document/defaults";
import { PAPER_KINDS, type Piece, type TornEdge } from "@/lib/document/types";
import { PAPERS } from "@/lib/edges/paper";
import { HURST, tearOutline } from "@/lib/edges/tear";
import { isSimplePolygon, polygonBounds } from "@/lib/geometry/polygon";
import type { Vec } from "@/lib/geometry/vec";
import { edgeDistance } from "@/lib/raster/distance";
import { rasterizePolygon } from "@/lib/raster/rasterize";
import { renderPiece } from "@/lib/render/piece";
import { MAX_SLOPE, reliefProfile } from "@/lib/render/relief";
import { SHAPE_GENERATORS } from "@/lib/shapes/generators";
import { shapeOutline } from "@/lib/shapes/outline";
import { defaultParams } from "@/lib/shapes/params";
import { PREDEFINED_SHAPES } from "@/lib/shapes/predefined";
import { MIN_PIECE_AREA } from "@/lib/shapes/repair";
import { area } from "@/lib/geometry/polygon";

const NO_IMAGES = () => undefined;
const torn = (patch: Partial<TornEdge> = {}): TornEdge => ({ ...defaultTornEdge(11), enabled: true, ...patch });
const circle = (r: number, n: number): Vec[] =>
  Array.from({ length: n }, (_, i) => ({ x: r * Math.cos((i / n) * 2 * Math.PI), y: r * Math.sin((i / n) * 2 * Math.PI) }));

describe("torn outline", () => {
  it("is off unless the edge is enabled", () => {
    expect(tearOutline(circle(20, 64), defaultTornEdge(1))).toBeNull();
  });

  it("never makes an outline that can't be cut, for every shape, seed, paper and the full roughness range", () => {
    const shapes = [
      ...PREDEFINED_SHAPES.map((s) => shapeOutline({ kind: "predefined", shapeId: s.id, params: defaultParams(s.params) })),
      ...SHAPE_GENERATORS.map((g) => shapeOutline({ kind: "generated", generatorId: g.id, params: defaultParams(g.params), seed: 3 })),
    ];
    for (const base of shapes) {
      for (const paper of PAPER_KINDS) {
        for (const roughness of [0.8, 4, 10]) {
          for (let seed = 1; seed <= 3; seed++) {
            const t = tearOutline(base, torn({ paper, roughness, seed, scale: 3 }));
            expect(t, `${paper} r${roughness} s${seed}`).not.toBeNull();
            expect(isSimplePolygon(t!.outline)).toBe(true);
            expect(area(t!.outline)).toBeGreaterThan(MIN_PIECE_AREA);
          }
        }
      }
    }
  }, 60_000);

  it("is the same for the same seed and differs for another", () => {
    const base = circle(20, 64);
    expect(tearOutline(base, torn({ seed: 5 }))!.outline).toEqual(tearOutline(base, torn({ seed: 5 }))!.outline);
    expect(tearOutline(base, torn({ seed: 6 }))!.outline).not.toEqual(tearOutline(base, torn({ seed: 5 }))!.outline);
  });

  /** Radial offsets of a torn circle, sampled every `step` mm of arc. */
  function offsets(edge: TornEdge, r = 100) {
    const t = tearOutline(circle(r, 2000), edge)!;
    return t.outline.map((p) => Math.hypot(p.x, p.y) - r);
  }

  it("closes without a seam where the outline starts", () => {
    const o = offsets(torn({ roughness: 2 }));
    const jumps = o.map((v, i) => Math.abs(v - o[(i + 1) % o.length]));
    const typical = jumps.reduce((a, b) => a + b, 0) / jumps.length;
    expect(Math.abs(o[0] - o[o.length - 1])).toBeLessThan(typical * 6);
  });

  it("is self-affine with a Hurst exponent near the measured 0.6–0.8", () => {
    // Structure function: the mean absolute height difference at a lag grows as lag^H. Lags well under `scale`.
    const o = offsets(torn({ roughness: 2, scale: 40, grain: 0, paper: "cotton" }));
    const step = (2 * Math.PI * 100) / o.length;
    const diff = (lagMm: number) => {
      const k = Math.round(lagMm / step);
      let s = 0;
      for (let i = 0; i < o.length; i++) s += Math.abs(o[(i + k) % o.length] - o[i]);
      return s / o.length;
    };
    const h = Math.log(diff(4) / diff(0.5)) / Math.log(8);
    expect(h).toBeGreaterThan(HURST - 0.2);
    expect(h).toBeLessThan(HURST + 0.2);
  });

  it("wanders less along the grain than across it on machine-made paper", () => {
    const base: Vec[] = [
      { x: -100, y: -10 },
      { x: 100, y: -10 },
      { x: 100, y: 10 },
      { x: -100, y: 10 },
    ];
    const rms = (grain: number) => {
      const t = tearOutline(base, torn({ grain, paper: "copy", roughness: 2 }))!;
      const long = t.outline.filter((p) => Math.abs(p.x) < 90);
      return Math.sqrt(long.reduce((s, p) => s + (Math.abs(p.y) - 10) ** 2, 0) / long.length);
    };
    expect(rms(0) / rms(90)).toBeLessThan(0.7);
  });

  it("tears only the covered share of the outline, ramping into the cut line", () => {
    const t = tearOutline(circle(30, 400), torn({ coverage: 0.4 }))!;
    const share = Array.from(t.torn).filter((w) => w > 0).length / t.torn.length;
    expect(share).toBeGreaterThan(0.3);
    expect(share).toBeLessThan(0.45);
    expect(Array.from(t.torn).some((w) => w > 0 && w < 1)).toBe(true);
  });

  it("varies the band about its average width, and grows wisps of the paper's fibre length", () => {
    for (const paper of PAPER_KINDS) {
      const t = tearOutline(circle(50, 600), torn({ paper, rimWidth: 1, fibres: 20 }))!;
      const mean = t.band.reduce((a, b) => a + b, 0) / t.band.length;
      expect(mean).toBeGreaterThan(0.7);
      expect(mean).toBeLessThan(1.3);
      expect(Math.min(...t.band)).toBeLessThan(0.5);
      const length = 2 * Math.PI * 50;
      expect(t.wisps.length).toBeGreaterThan(((20 * length) / 10) * 0.8);
      for (const w of t.wisps) {
        const reach = Math.hypot(w.points.at(-1)!.x - w.points[0].x, w.points.at(-1)!.y - w.points[0].y);
        expect(reach).toBeLessThanOrEqual(PAPERS[paper].fibreLength / 2 + 1e-6);
      }
    }
  });
});

describe("edge distance", () => {
  it("measures the distance to the edge line inside and out", () => {
    const sq = [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 50 },
      { x: 10, y: 50 },
    ];
    const mask = rasterizePolygon(sq, 60, 60);
    const inside = edgeDistance(mask, true);
    const outside = edgeDistance(mask, false);
    // Pixel (30, 30) has its centre at 30.5: 20.5 px from the nearest side.
    expect(inside[30 * 60 + 30]).toBeCloseTo(19.5, 0);
    expect(inside[30 * 60 + 10]).toBeCloseTo(0.5, 1);
    expect(outside[30 * 60 + 5]).toBeCloseTo(4.5, 1);
  });
});

describe("relief", () => {
  it("keeps the slope within depth × the paper's limit, for every style and softness", () => {
    for (const style of ["bevel", "emboss", "pillow"] as const) {
      for (const softness of [0, 0.5, 1]) {
        const p = reliefProfile({ style, size: 3, depth: 1, softness, lightAngle: 0, lightAltitude: 35, textureBump: 0 })!;
        let steepest = 0;
        for (let d = 0; d < 7; d += 0.001) steepest = Math.max(steepest, Math.abs(p(d + 0.001) - p(d)) / 0.001);
        expect(steepest, `${style} ${softness}`).toBeLessThanOrEqual(MAX_SLOPE + 1e-3);
        expect(steepest).toBeGreaterThan(MAX_SLOPE * 0.9);
      }
    }
  });

  it("lights a bevel from the light's side and leaves the flat face its own colour", () => {
    const piece: Piece = {
      ...defaultPiece(0),
      texture: { kind: "plain", color: "#808080" },
      relief: { style: "bevel", size: 4, depth: 1, softness: 0, lightAngle: 0, lightAltitude: 35, textureBump: 0 },
    };
    const s = renderPiece(piece, 4, NO_IMAGES);
    const at = (xMm: number, yMm: number) =>
      s.image.data[(Math.floor(yMm * 4 + s.originY) * s.image.width + Math.floor(xMm * 4 + s.originX)) * 4];
    // Light from the right (+x): the right bevel faces it, the left one faces away.
    expect(at(18, 0)).toBeGreaterThan(140);
    expect(at(-18, 0)).toBeLessThan(115);
    expect(at(0, 0)).toBe(128);
  });
});

describe("rendering a torn piece", () => {
  it("draws a lighter band inside the line and a faint fuzz outside it", () => {
    const piece: Piece = {
      ...defaultPiece(0),
      texture: { kind: "plain", color: "#2050a0" },
      edge: torn({ roughness: 0, rimWidth: 1.5, fibres: 0, paper: "tissue" }),
    };
    const s = renderPiece(piece, 8, NO_IMAGES);
    const b = polygonBounds(shapeOutline(piece.shape));
    const px = (xMm: number, yMm: number) => (Math.floor(yMm * 8 + s.originY) * s.image.width + Math.floor(xMm * 8 + s.originX)) * 4;
    const face = px(0, 0);
    const band = px(b.maxX - 0.2, 0);
    const fuzz = px(b.maxX + 0.3, 0);
    const d = s.image.data;
    expect(d[band]).toBeGreaterThan(d[face] + 40);
    expect(d[band + 3]).toBeLessThan(255);
    expect(d[fuzz + 3]).toBeGreaterThan(0);
    expect(d[fuzz + 3]).toBeLessThan(128);
  });

  it("uses the set core colour when there is one", () => {
    const piece: Piece = { ...defaultPiece(0), edge: torn({ roughness: 0, rimWidth: 1.5, fibres: 0, rimColor: "#00ff00" }) };
    const s = renderPiece(piece, 8, NO_IMAGES);
    const b = polygonBounds(shapeOutline(piece.shape));
    const k = (Math.floor(s.originY) * s.image.width + Math.floor((b.maxX - 0.4) * 8 + s.originX)) * 4;
    expect(s.image.data[k + 1]).toBeGreaterThan(200);
    expect(s.image.data[k]).toBeLessThan(60);
  });
});
