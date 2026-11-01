import { readFile } from "node:fs/promises";
import { type Download, type Locator, type Page, expect } from "@playwright/test";
import JSZip from "jszip";
import type { MosaicDocument, Placement } from "../../../lib/document/types";
import { clashes, edgeIndex } from "../../../lib/geometry/collision";
import { polygonBounds } from "../../../lib/geometry/polygon";
import { type Pose, transformPolygon } from "../../../lib/geometry/pose";

/** Locators for the studio's shared UI, defined once (STANDARDS: one home per shared test affordance). */
export const ui = (page: Page) => ({
  tab: (v: "cutboard" | "workboard") => page.getByTestId(`tab-${v}`),
  newPiece: page.getByTestId("new-piece"),
  duplicatePiece: page.getByTestId("duplicate-piece"),
  pieceItems: page.getByTestId("piece-item"),
  lockedNote: page.getByTestId("piece-locked-note"),
  shapeKind: page.getByTestId("shape-kind"),
  shapeSource: page.getByTestId("shape-source"),
  generatorKind: page.getByTestId("generator-kind"),
  reroll: page.getByTestId("reroll-seed"),
  cutAgain: page.getByTestId("cut-again"),
  cutHint: page.getByTestId("cut-hint"),
  cutCancel: page.getByTestId("cut-cancel"),
  cutboard: page.getByTestId("cutboard-canvas"),
  param: (key: string) => page.getByTestId(`param-${key}`),
  textureColor: page.getByTestId("texture-color"),
  textureKind: page.getByTestId("texture-kind"),
  textureGenerator: page.getByTestId("texture-generator"),
  textureReroll: page.getByTestId("texture-reroll"),
  textureFile: page.getByTestId("texture-file"),
  undo: page.getByTestId("undo"),
  redo: page.getByTestId("redo"),
  fileNew: page.getByTestId("file-new"),
  save: page.getByTestId("file-save"),
  open: page.getByTestId("file-open"),
  trayItems: page.getByTestId("tray-item"),
  board: page.getByTestId("workboard-canvas"),
  toggleLock: page.getByTestId("toggle-lock"),
  remove: page.getByTestId("remove-placement"),
  allowOverlap: page.getByTestId("allow-overlap"),
  autoRotate: page.getByTestId("auto-rotate"),
  selection: page.getByTestId("selection-actions"),
  /** A toast with the given text; several can be on screen at once. */
  notice: (text: string | RegExp) => page.getByTestId(/^notice-/).filter({ hasText: text }),
});

export async function openStudio(page: Page) {
  await page.goto("/");
  await expect(ui(page).newPiece).toBeVisible();
}

/** The centre of a locator's box, in page coordinates. */
export async function centreOf(l: Locator) {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Drags with the mouse in small steps, so pointermove handlers see a real motion. */
export async function mouseDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

/** Saves through the UI and reads the downloaded .mosaic back: the document as the user's file records it. */
export async function savedDocument(page: Page): Promise<{ doc: MosaicDocument; download: Download }> {
  const [download] = await Promise.all([page.waitForEvent("download"), ui(page).save.click()]);
  const zip = await JSZip.loadAsync(await readFile(await download.path()));
  const doc = JSON.parse(await zip.file("mosaic.json")!.async("string")) as MosaicDocument;
  return { doc, download };
}

/** The workboard's view when nothing has re-framed it: board origin at the canvas centre, 3 px per mm. */
export const START_ZOOM = 3;

/** A board point (mm) in page coordinates, for the unmoved starting view. */
export async function boardToPage(page: Page, p: { x: number; y: number }) {
  const c = await centreOf(ui(page).board);
  return { x: c.x + p.x * START_ZOOM, y: c.y + p.y * START_ZOOM };
}

/** The default piece: a 40 mm square, centred on its pose. */
const square = (pose: Pose) =>
  transformPolygon(
    [
      { x: -20, y: -20 },
      { x: 20, y: -20 },
      { x: 20, y: 20 },
      { x: -20, y: 20 },
    ],
    pose
  );

/** True when two placed default pieces keep at least `margin` between them (less a rounding hair). */
export function keepApart(a: Placement, b: Placement, margin: number) {
  const pa = square(a.pose);
  const clearance = Math.max(0, margin - 0.01);
  return !clashes(pa, polygonBounds(pa), edgeIndex(square(b.pose), clearance), clearance);
}

/** Draws one closed stroke with the mouse through `points`, given as fractions of the locator's box. */
export async function drawStroke(page: Page, l: Locator, points: [number, number][]) {
  const b = (await l.boundingBox())!;
  const at = ([fx, fy]: [number, number]) => ({ x: b.x + fx * b.width, y: b.y + fy * b.height });
  const first = at(points[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const p of points.slice(1)) {
    const q = at(p);
    await page.mouse.move(q.x, q.y, { steps: 6 });
  }
  await page.mouse.up();
}

/** A closed loop of `n` points around (cx, cy), as box fractions. */
export const loop = (cx: number, cy: number, r: number, n = 24): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  });
