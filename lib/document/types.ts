import type { Pose } from "../geometry/pose";
import type { Vec } from "../geometry/vec";

/**
 * The editable document: an immutable piece library (made on the cutboard) and placements of those pieces on the
 * workboard. Lengths are millimetres. A piece is a template: any number of placements may refer to it, and once one
 * does, the piece is never edited again (D002).
 */
export interface MosaicDocument {
  /** File-format version; `parseDocument` migrates older ones. */
  version: typeof DOCUMENT_VERSION;
  name: string;
  pieces: Piece[];
  /** Back to front: later placements draw over earlier ones. */
  placements: Placement[];
  board: BoardSettings;
  background: Background;
  /** Metadata of uploaded images and PDFs; their bytes live in the `AssetStore` and in the saved file. */
  assets: AssetMeta[];
}

export const DOCUMENT_VERSION = 1 as const;

export type Params = Record<string, number>;

export type ShapeSource =
  | { kind: "predefined"; shapeId: string; params: Params }
  | { kind: "generated"; generatorId: string; params: Params; seed: number }
  /**
   * A hand cut: the raw stroke in millimetres and the stabilisation (0–100) applied to it. The outline is derived
   * (`lib/shapes/hand.ts`), so changing the stabilisation re-smooths the same cut. See D007.
   */
  | { kind: "hand"; points: Vec[]; stabilization: number };

export type TextureSource =
  | { kind: "plain"; color: string }
  | { kind: "generated"; generatorId: string; params: Params; colors: string[]; seed: number }
  | { kind: "image"; assetId: string }
  | { kind: "pdf"; assetId: string; page: number };

/** How the texture is laid on the piece: shifted (mm), scaled, and turned (radians). */
export interface TextureTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
}

/** Blend modes from the W3C Compositing spec, the same set CSS and Canvas name. */
export const BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

/** The most colour layers a piece keeps: the editor stops adding at this, and the file reader drops any beyond it. */
export const MAX_COLOR_LAYERS = 16;

/** Colour changes applied over the texture, in order. */
export type ColorLayer =
  | { kind: "tint"; color: string; mode: BlendMode; opacity: number }
  /** hue in degrees (-180..180); saturation and lightness in -1..1. */
  | { kind: "hsl"; hue: number; saturation: number; lightness: number };

export const RELIEF_STYLES = ["none", "bevel", "emboss", "pillow"] as const;
export type ReliefStyle = (typeof RELIEF_STYLES)[number];

export interface Relief {
  style: ReliefStyle;
  /** Width of the sloped band, mm. */
  size: number;
  /** Height of the slope as a share of the steepest paper takes without tearing (rise/run 0.3), 0..1. See D011. */
  depth: number;
  /** Rounding of the slope, 0 (hard) .. 1 (soft). */
  softness: number;
  /** Direction the light comes from, degrees (0 = from the right, 90 = from below, on screen). */
  lightAngle: number;
  /** Light height above the surface, degrees. */
  lightAltitude: number;
  /** Bump taken from the texture's own lightness, 0..1: the "3D texture" of paper grain or cloth. */
  textureBump: number;
}

/** The most a tear may wander, mm. */
export const MAX_ROUGHNESS = 10;

/** Kinds of paper a torn edge can be: they differ in fibre length and so in how fuzzy a tear is (D011). */
export const PAPER_KINDS = ["copy", "newsprint", "cotton", "tissue"] as const;
export type PaperKind = (typeof PAPER_KINDS)[number];

export interface TornEdge {
  enabled: boolean;
  paper: PaperKind;
  /** How far the torn line wanders from the cut line, mm (across the grain; along it, half as far). */
  roughness: number;
  /** Scale of the largest wiggle, mm. */
  scale: number;
  /** Direction of the paper's grain in the piece, degrees. */
  grain: number;
  /** Average width of the exposed paper core along the tear, mm; it varies along the edge. */
  rimWidth: number;
  /** Colour of the exposed core, or null for the texture's own colour, paler and greyer. */
  rimColor: string | null;
  /** Loose fibres per centimetre of tear. */
  fibres: number;
  /** Share of the outline that is torn rather than cut, 0..1. */
  coverage: number;
  seed: number;
}

export interface Piece {
  id: string;
  name: string;
  shape: ShapeSource;
  texture: TextureSource;
  textureTransform: TextureTransform;
  colors: ColorLayer[];
  relief: Relief;
  edge: TornEdge;
}

export interface Placement {
  id: string;
  pieceId: string;
  pose: Pose;
  locked: boolean;
}

export interface BoardSettings {
  allowOverlap: boolean;
  /** Minimum gap between pieces when overlap is off, mm. */
  margin: number;
  /** When a dragged piece is stopped by a neighbour, it turns about the contact point. */
  autoRotate: boolean;
  /** Drop shadow under the pieces, 0 (none) .. 1. */
  shadow: number;
}

/**
 * What the artwork is laid on: any texture a piece can have, laid over the artwork's bounds the way a piece's texture
 * is laid over the piece's (D014), and how far it reaches past the outermost pieces, mm.
 */
export interface Background {
  texture: TextureSource;
  transform: TextureTransform;
  padding: number;
}

export interface AssetMeta {
  id: string;
  name: string;
  mime: string;
  kind: "image" | "pdf";
}

/** The bytes of uploaded assets, keyed by asset id. Kept out of the document so undo history stays small. */
export type AssetStore = Map<string, Uint8Array>;
