import type { BoardSettings, Background, MosaicDocument, Piece, Relief, TextureTransform, TornEdge } from "./types";
import { DOCUMENT_VERSION } from "./types";
import { randomSeed } from "../random";

export const newId = (): string => crypto.randomUUID();

export const DEFAULT_TEXTURE_TRANSFORM: TextureTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };

export const DEFAULT_RELIEF: Relief = {
  style: "none",
  size: 2,
  depth: 0.5,
  softness: 0.5,
  lightAngle: 225,
  lightAltitude: 35,
  textureBump: 0,
};

export const defaultTornEdge = (seed = randomSeed()): TornEdge => ({
  enabled: false,
  paper: "copy",
  roughness: 0.8,
  scale: 6,
  grain: 0,
  rimWidth: 0.8,
  rimColor: null,
  fibres: 12,
  coverage: 1,
  seed,
});

export const DEFAULT_BOARD: BoardSettings = { allowOverlap: true, margin: 2, autoRotate: true, shadow: 0.5 };

/** Shown in place of a texture that can't be drawn (its asset is missing). */
export const FALLBACK_COLOR = "#888888";

export const DEFAULT_BACKGROUND: Extract<Background, { kind: "color" }> = { kind: "color", color: "#f4efe4", padding: 10 };

/** A warm palette the "new piece" button cycles through, so consecutive pieces are told apart at a glance. */
const STARTER_COLORS = ["#c8553d", "#f28f3b", "#ffd5c2", "#588b8b", "#2d3047", "#93b7be", "#e0ca3c", "#7d4e57"];

export function defaultPiece(index = 0): Piece {
  return {
    id: newId(),
    name: `Piece ${index + 1}`,
    shape: { kind: "predefined", shapeId: "rectangle", params: { width: 40, height: 40, radius: 0 } },
    texture: { kind: "plain", color: STARTER_COLORS[index % STARTER_COLORS.length] },
    textureTransform: { ...DEFAULT_TEXTURE_TRANSFORM },
    colors: [],
    relief: { ...DEFAULT_RELIEF },
    edge: defaultTornEdge(),
  };
}

export function createDocument(name = "Untitled mosaic"): MosaicDocument {
  return {
    version: DOCUMENT_VERSION,
    name,
    pieces: [],
    placements: [],
    board: { ...DEFAULT_BOARD },
    background: { ...DEFAULT_BACKGROUND },
    assets: [],
  };
}
