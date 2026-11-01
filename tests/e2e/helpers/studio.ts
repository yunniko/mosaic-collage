import { readFile } from "node:fs/promises";
import { type Download, type Locator, type Page, expect } from "@playwright/test";
import JSZip from "jszip";
import type { MosaicDocument } from "../../../lib/document/types";

/** Locators for the studio's shared UI, defined once (STANDARDS: one home per shared test affordance). */
export const ui = (page: Page) => ({
  tab: (v: "cutboard" | "workboard") => page.getByTestId(`tab-${v}`),
  newPiece: page.getByTestId("new-piece"),
  duplicatePiece: page.getByTestId("duplicate-piece"),
  pieceItems: page.getByTestId("piece-item"),
  lockedNote: page.getByTestId("piece-locked-note"),
  shapeKind: page.getByTestId("shape-kind"),
  param: (key: string) => page.getByTestId(`param-${key}`),
  textureColor: page.getByTestId("texture-color"),
  undo: page.getByTestId("undo"),
  redo: page.getByTestId("redo"),
  fileNew: page.getByTestId("file-new"),
  save: page.getByTestId("file-save"),
  open: page.getByTestId("file-open"),
  trayItems: page.getByTestId("tray-item"),
  board: page.getByTestId("workboard-canvas"),
  toggleLock: page.getByTestId("toggle-lock"),
  remove: page.getByTestId("remove-placement"),
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
