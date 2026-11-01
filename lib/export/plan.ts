import type { MosaicDocument } from "../document/types";
import type { Bounds } from "../geometry/polygon";
import { backgroundSize } from "../render/background";
import { artworkBounds } from "../workboard/scene";

export type ExportFormat = "png" | "jpeg";

export interface ExportOptions {
  format: ExportFormat;
  /** Dots per inch of the output; the artwork's millimetres set its size. */
  dpi: number;
  /** PNG only: false leaves the background out, transparent. A JPG always has it. */
  background: boolean;
}

/** Resolutions offered, dpi: screen, draft print, print, fine print. */
export const EXPORT_DPI = [72, 150, 300, 600] as const;

/**
 * The largest export, pixels. Browsers refuse bigger canvases (Chrome stops at 268 M pixels, Safari at about 16 M on
 * some devices); 64 M keeps memory under about 1 GB while composing. Safari users may still meet their own limit.
 */
export const MAX_EXPORT_PIXELS = 64_000_000;
/** The longest side any of the browsers draws. */
const MAX_EXPORT_SIDE = 16_384;

const MM_PER_INCH = 25.4;

export interface ExportPlan {
  bounds: Bounds;
  pxPerMm: number;
  width: number;
  height: number;
  /** Too large to compose: lower the resolution. */
  tooBig: boolean;
}

/** What an export of the artwork at `dpi` covers and how big it comes out, or null when nothing is placed. */
export function exportPlan(doc: MosaicDocument, dpi: number): ExportPlan | null {
  const bounds = artworkBounds(doc);
  if (!bounds) return null;
  const pxPerMm = dpi / MM_PER_INCH;
  const { width, height } = backgroundSize(bounds, pxPerMm);
  const tooBig = width * height > MAX_EXPORT_PIXELS || Math.max(width, height) > MAX_EXPORT_SIDE;
  return { bounds, pxPerMm, width, height, tooBig };
}
