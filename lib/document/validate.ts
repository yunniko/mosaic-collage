import type { Vec } from "../geometry/vec";
import { UnknownShapeError, shapeOutline } from "../shapes/outline";
import { OutlineError } from "../shapes/repair";
import { DEFAULT_BACKGROUND, DEFAULT_BOARD, DEFAULT_RELIEF, DEFAULT_TEXTURE_TRANSFORM, FALLBACK_COLOR, defaultTornEdge } from "./defaults";
import {
  type AssetMeta,
  type Background,
  BLEND_MODES,
  type BlendMode,
  type BoardSettings,
  type ColorLayer,
  DOCUMENT_VERSION,
  type MosaicDocument,
  type Params,
  type Piece,
  type Placement,
  type Relief,
  RELIEF_STYLES,
  type ShapeSource,
  type TextureSource,
  type TextureTransform,
  type TornEdge,
} from "./types";

/** A file that cannot be read as a mosaic at all. The message is shown to the user. */
export class InvalidDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDocumentError";
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number, min = -Infinity, max = Infinity) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const COLOR = /^#[0-9a-f]{6}$/i;
const color = (v: unknown, d: string) => (typeof v === "string" && COLOR.test(v) ? v.toLowerCase() : d);
const colorList = (v: unknown) => (Array.isArray(v) ? v.slice(0, 8).map((c) => color(c, FALLBACK_COLOR)) : []);
const id = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : null);

function params(v: unknown): Params {
  const out: Params = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v)) if (typeof x === "number" && Number.isFinite(x)) out[k] = x;
  return out;
}

function points(v: unknown): Vec[] | null {
  if (!Array.isArray(v) || v.length < 3 || v.length > 20000) return null;
  const out: Vec[] = [];
  for (const p of v) {
    if (!isObj(p) || typeof p.x !== "number" || typeof p.y !== "number" || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

function shape(v: unknown): ShapeSource | null {
  if (!isObj(v)) return null;
  if (v.kind === "predefined" && typeof v.shapeId === "string") return { kind: "predefined", shapeId: v.shapeId, params: params(v.params) };
  if (v.kind === "generated" && typeof v.generatorId === "string")
    return { kind: "generated", generatorId: v.generatorId, params: params(v.params), seed: num(v.seed, 1) >>> 0 };
  if (v.kind === "hand") {
    const pts = points(v.points);
    // Files from before D007 stored the finished outline; stabilisation 0 keeps it as it was.
    return pts ? { kind: "hand", points: pts, stabilization: num(v.stabilization, 0, 0, 100) } : null;
  }
  return null;
}

function texture(v: unknown): TextureSource {
  if (isObj(v)) {
    if (v.kind === "generated" && typeof v.generatorId === "string")
      return {
        kind: "generated",
        generatorId: v.generatorId,
        params: params(v.params),
        colors: colorList(v.colors),
        seed: num(v.seed, 1) >>> 0,
      };
    const assetId = id(v.assetId);
    if (v.kind === "image" && assetId) return { kind: "image", assetId };
    if (v.kind === "pdf" && assetId) return { kind: "pdf", assetId, page: Math.round(num(v.page, 1, 1, 10000)) };
    if (v.kind === "plain") return { kind: "plain", color: color(v.color, FALLBACK_COLOR) };
  }
  return { kind: "plain", color: FALLBACK_COLOR };
}

function textureTransform(v: unknown): TextureTransform {
  const o = isObj(v) ? v : {};
  const d = DEFAULT_TEXTURE_TRANSFORM;
  return {
    offsetX: num(o.offsetX, d.offsetX, -10000, 10000),
    offsetY: num(o.offsetY, d.offsetY, -10000, 10000),
    scale: num(o.scale, d.scale, 0.01, 100),
    rotation: num(o.rotation, d.rotation),
  };
}

function colorLayers(v: unknown): ColorLayer[] {
  if (!Array.isArray(v)) return [];
  const out: ColorLayer[] = [];
  for (const l of v.slice(0, 16)) {
    if (!isObj(l)) continue;
    if (l.kind === "tint")
      out.push({
        kind: "tint",
        color: color(l.color, "#ffffff"),
        mode: (BLEND_MODES as readonly string[]).includes(l.mode as string) ? (l.mode as BlendMode) : "normal",
        opacity: num(l.opacity, 1, 0, 1),
      });
    else if (l.kind === "hsl")
      out.push({
        kind: "hsl",
        hue: num(l.hue, 0, -180, 180),
        saturation: num(l.saturation, 0, -1, 1),
        lightness: num(l.lightness, 0, -1, 1),
      });
  }
  return out;
}

function relief(v: unknown): Relief {
  const o = isObj(v) ? v : {};
  const d = DEFAULT_RELIEF;
  const style = (RELIEF_STYLES as readonly unknown[]).includes(o.style) ? (o.style as Relief["style"]) : d.style;
  return {
    style,
    size: num(o.size, d.size, 0.1, 50),
    depth: num(o.depth, d.depth, 0, 1),
    softness: num(o.softness, d.softness, 0, 1),
    lightAngle: num(o.lightAngle, d.lightAngle, 0, 360),
    lightAltitude: num(o.lightAltitude, d.lightAltitude, 1, 90),
    textureBump: num(o.textureBump, d.textureBump, 0, 1),
  };
}

function edge(v: unknown): TornEdge {
  const o = isObj(v) ? v : {};
  // Every field's default; the seed is read from the file below like the rest.
  const d = defaultTornEdge(1);
  return {
    enabled: bool(o.enabled, d.enabled),
    roughness: num(o.roughness, d.roughness, 0, 20),
    scale: num(o.scale, d.scale, 0.5, 100),
    rimWidth: num(o.rimWidth, d.rimWidth, 0, 20),
    rimColor: color(o.rimColor, d.rimColor),
    fibres: num(o.fibres, d.fibres, 0, 40),
    coverage: num(o.coverage, d.coverage, 0, 1),
    seed: num(o.seed, d.seed) >>> 0,
  };
}

function piece(v: unknown, warnings: string[]): Piece | null {
  if (!isObj(v)) return null;
  const pid = id(v.id);
  const s = shape(v.shape);
  if (!pid || !s) {
    warnings.push(`A piece with an unreadable ${pid ? "shape" : "id"} was skipped.`);
    return null;
  }
  const name = str(v.name, "Piece").slice(0, 120);
  let checked = s;
  try {
    shapeOutline(s);
  } catch (e) {
    if (!(e instanceof OutlineError || e instanceof UnknownShapeError)) throw e;
    // A shape this version doesn't know (a file from a newer one) or can't cut still loads, as a stand-in rectangle.
    const reason = e instanceof UnknownShapeError ? "uses a shape this version doesn't have" : "could not be cut";
    warnings.push(`The shape of "${name}" ${reason}; it was replaced by a rectangle.`);
    checked = { kind: "predefined", shapeId: "rectangle", params: {} };
  }
  return {
    id: pid,
    name,
    shape: checked,
    texture: texture(v.texture),
    textureTransform: textureTransform(v.textureTransform),
    colors: colorLayers(v.colors),
    relief: relief(v.relief),
    edge: edge(v.edge),
  };
}

function placement(v: unknown, pieceIds: Set<string>): Placement | null {
  if (!isObj(v) || !isObj(v.pose)) return null;
  const pid = id(v.id);
  const pieceId = id(v.pieceId);
  if (!pid || !pieceId || !pieceIds.has(pieceId)) return null;
  const pose = { x: num(v.pose.x, NaN), y: num(v.pose.y, NaN), rotation: num(v.pose.rotation, 0) };
  if (!Number.isFinite(pose.x) || !Number.isFinite(pose.y)) return null;
  return { id: pid, pieceId, pose, locked: bool(v.locked, false) };
}

function board(v: unknown): BoardSettings {
  const o = isObj(v) ? v : {};
  const d = DEFAULT_BOARD;
  return {
    allowOverlap: bool(o.allowOverlap, d.allowOverlap),
    margin: num(o.margin, d.margin, 0, 100),
    autoRotate: bool(o.autoRotate, d.autoRotate),
    shadow: num(o.shadow, d.shadow, 0, 1),
  };
}

function background(v: unknown, assetIds: Set<string>): Background {
  const o = isObj(v) ? v : {};
  const padding = num(o.padding, DEFAULT_BACKGROUND.padding, 0, 1000);
  if (o.kind === "texture" && typeof o.generatorId === "string")
    return {
      kind: "texture",
      generatorId: o.generatorId,
      params: params(o.params),
      colors: colorList(o.colors),
      seed: num(o.seed, 1) >>> 0,
      padding,
    };
  const assetId = id(o.assetId);
  if (o.kind === "image" && assetId && assetIds.has(assetId))
    return { kind: "image", assetId, fit: o.fit === "tile" ? "tile" : "cover", padding };
  return { kind: "color", color: color(o.color, DEFAULT_BACKGROUND.color), padding };
}

function assets(v: unknown): AssetMeta[] {
  if (!Array.isArray(v)) return [];
  const out: AssetMeta[] = [];
  for (const a of v) {
    if (!isObj(a)) continue;
    const aid = id(a.id);
    if (!aid || (a.kind !== "image" && a.kind !== "pdf")) continue;
    out.push({ id: aid, name: str(a.name, "asset").slice(0, 200), mime: str(a.mime, "application/octet-stream"), kind: a.kind });
  }
  return out;
}

/**
 * Reads a document from untrusted JSON. Anything missing or out of range falls back to a default; a placement whose
 * piece is gone, or a piece using an asset the file lacks, is dropped or reset with a warning. A newer file version is
 * refused rather than half-read.
 */
export function parseDocument(json: unknown, availableAssets?: ReadonlySet<string>): { doc: MosaicDocument; warnings: string[] } {
  if (!isObj(json)) throw new InvalidDocumentError("This file does not contain a mosaic.");
  const version = json.version;
  if (typeof version !== "number") throw new InvalidDocumentError("This file does not contain a mosaic.");
  if (version > DOCUMENT_VERSION) throw new InvalidDocumentError("This mosaic was saved by a newer version of the app.");
  const warnings: string[] = [];
  const metas = assets(json.assets).filter((a) => !availableAssets || availableAssets.has(a.id));
  const assetIds = new Set(metas.map((a) => a.id));
  const pieces: Piece[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(json.pieces) ? json.pieces : []) {
    const p = piece(raw, warnings);
    if (!p || seen.has(p.id)) continue;
    if ((p.texture.kind === "image" || p.texture.kind === "pdf") && !assetIds.has(p.texture.assetId)) {
      warnings.push(`The texture file of "${p.name}" is missing; it was given a plain colour.`);
      p.texture = { kind: "plain", color: FALLBACK_COLOR };
    }
    seen.add(p.id);
    pieces.push(p);
  }
  const placements: Placement[] = [];
  let dropped = 0;
  const seenPl = new Set<string>();
  for (const raw of Array.isArray(json.placements) ? json.placements : []) {
    const pl = placement(raw, seen);
    if (pl && !seenPl.has(pl.id)) {
      seenPl.add(pl.id);
      placements.push(pl);
    } else dropped++;
  }
  if (dropped) warnings.push(`${dropped} placed piece(s) could not be read and were left out.`);
  return {
    doc: {
      version: DOCUMENT_VERSION,
      name: str(json.name, "Untitled mosaic").slice(0, 200),
      pieces,
      placements,
      board: board(json.board),
      background: background(json.background, assetIds),
      assets: metas,
    },
    warnings,
  };
}
