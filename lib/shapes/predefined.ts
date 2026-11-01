import type { Params } from "../document/types";
import { type Polygon, centerPolygon, signedArea } from "../geometry/polygon";
import type { ParamSpec } from "./params";

/** A fixed shape family the user sizes with a few numbers. Outlines are in mm. */
export interface PredefinedShape {
  id: string;
  /** Message key under `shapes.` */
  label: string;
  params: ParamSpec[];
  build(p: Params): Polygon;
}

const W: ParamSpec = { key: "width", label: "width", min: 4, max: 400, step: 1, default: 40, unit: "mm" };
const H: ParamSpec = { key: "height", label: "height", min: 4, max: 400, step: 1, default: 40, unit: "mm" };

/** Points along an ellipse arc, `n` of them, angles in radians. */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number, n: number): Polygon {
  const pts: Polygon = [];
  for (let i = 0; i < n; i++) {
    const a = from + ((to - from) * i) / (n - 1);
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return pts;
}

/** Segments for a smooth curve of radius r: about one per 1.5 mm of arc, at least 8. */
const segs = (r: number, angle: number) => Math.max(8, Math.ceil((Math.abs(angle) * r) / 1.5));

export const PREDEFINED_SHAPES: PredefinedShape[] = [
  {
    id: "rectangle",
    label: "rectangle",
    params: [W, H, { key: "radius", label: "cornerRadius", min: 0, max: 100, step: 0.5, default: 0, unit: "mm" }],
    build: ({ width: w, height: h, radius }) => {
      const r = Math.min(radius, w / 2, h / 2);
      if (r <= 0.01)
        return [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: h },
          { x: 0, y: h },
        ];
      const n = segs(r, Math.PI / 2);
      return [
        ...arc(w - r, r, r, r, -Math.PI / 2, 0, n),
        ...arc(w - r, h - r, r, r, 0, Math.PI / 2, n),
        ...arc(r, h - r, r, r, Math.PI / 2, Math.PI, n),
        ...arc(r, r, r, r, Math.PI, (3 * Math.PI) / 2, n),
      ];
    },
  },
  {
    id: "ellipse",
    label: "ellipse",
    params: [W, H],
    build: ({ width: w, height: h }) => {
      const n = segs(Math.max(w, h) / 2, 2 * Math.PI);
      return arc(0, 0, w / 2, h / 2, 0, 2 * Math.PI * (1 - 1 / n), n);
    },
  },
  {
    id: "triangle",
    label: "triangle",
    params: [W, H, { key: "apex", label: "apexPosition", min: 0, max: 100, step: 1, default: 50, unit: "percent" }],
    build: ({ width: w, height: h, apex }) => [
      { x: (w * apex) / 100, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ],
  },
  {
    id: "polygon",
    label: "regularPolygon",
    params: [
      { key: "sides", label: "sides", min: 3, max: 16, step: 1, default: 6, unit: "count" },
      { key: "size", label: "size", min: 4, max: 400, step: 1, default: 40, unit: "mm" },
    ],
    build: ({ sides, size }) => {
      const n = Math.round(sides);
      const r = size / 2;
      return Array.from({ length: n }, (_, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
        return { x: r * Math.cos(a), y: r * Math.sin(a) };
      });
    },
  },
  {
    id: "star",
    label: "star",
    params: [
      { key: "points", label: "points", min: 3, max: 24, step: 1, default: 5, unit: "count" },
      { key: "size", label: "size", min: 4, max: 400, step: 1, default: 50, unit: "mm" },
      { key: "inner", label: "innerRatio", min: 10, max: 90, step: 1, default: 45, unit: "percent" },
    ],
    build: ({ points, size, inner }) => {
      const n = Math.round(points) * 2;
      return Array.from({ length: n }, (_, i) => {
        const r = (i % 2 === 0 ? size : (size * inner) / 100) / 2;
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
        return { x: r * Math.cos(a), y: r * Math.sin(a) };
      });
    },
  },
  {
    id: "heart",
    label: "heart",
    params: [{ key: "size", label: "size", min: 4, max: 400, step: 1, default: 50, unit: "mm" }],
    build: ({ size }) => {
      // The classic parametric heart, scaled to `size` wide.
      const n = 96;
      const s = size / 34;
      return Array.from({ length: n }, (_, i) => {
        const t = (2 * Math.PI * i) / n;
        return {
          x: s * 16 * Math.sin(t) ** 3,
          y: -s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
        };
      });
    },
  },
  {
    id: "leaf",
    label: "leaf",
    params: [
      { ...W, default: 30 },
      { ...H, default: 70 },
    ],
    build: ({ width: w, height: h }) => {
      // Two circular arcs meeting in points at top and bottom (a vesica).
      const half = w / 2;
      const r = (half * half + (h / 2) ** 2) / (2 * half);
      const off = r - half;
      const theta = Math.asin(h / 2 / r);
      const n = segs(r, 2 * theta);
      const right = arc(-off, 0, r, r, -theta, theta, n);
      const left = arc(off, 0, r, r, Math.PI - theta, Math.PI + theta, n);
      return [...right.slice(0, -1), ...left.slice(0, -1)];
    },
  },
  {
    id: "diamond",
    label: "diamond",
    params: [W, { ...H, default: 60 }],
    build: ({ width: w, height: h }) => [
      { x: 0, y: -h / 2 },
      { x: w / 2, y: 0 },
      { x: 0, y: h / 2 },
      { x: -w / 2, y: 0 },
    ],
  },
  {
    id: "arc",
    label: "arcSegment",
    params: [
      { key: "outer", label: "outerRadius", min: 6, max: 300, step: 1, default: 60, unit: "mm" },
      { key: "thickness", label: "thickness", min: 2, max: 200, step: 1, default: 15, unit: "mm" },
      { key: "angle", label: "angle", min: 5, max: 350, step: 1, default: 40, unit: "deg" },
    ],
    build: ({ outer, thickness, angle }) => {
      const inner = Math.max(1, outer - thickness);
      const a = (angle * Math.PI) / 180;
      const from = -Math.PI / 2 - a / 2;
      const outerArc = arc(0, 0, outer, outer, from, from + a, segs(outer, a));
      const innerArc = arc(0, 0, inner, inner, from + a, from, segs(inner, a));
      return [...outerArc, ...innerArc];
    },
  },
];

export function findPredefinedShape(id: string): PredefinedShape | undefined {
  return PREDEFINED_SHAPES.find((s) => s.id === id);
}

/** Centred, with positive signed area, so every outline has the same winding. */
export function normalizeOutline(poly: Polygon): Polygon {
  const centred = centerPolygon(poly);
  return signedArea(centred) < 0 ? centred.reverse() : centred;
}
