import { expect, test } from "@playwright/test";
import { centreOf, mouseDrag, openStudio, savedDocument, ui } from "./helpers/studio";

test.beforeEach(async ({ page }) => {
  await openStudio(page);
  await ui(page).newPiece.click();
  await ui(page).tab("workboard").click();
  await expect(ui(page).board).toBeVisible();
});

test("a piece is placed by dragging it from the tray and by clicking it", async ({ page }) => {
  const u = ui(page);
  const board = (await u.board.boundingBox())!;
  // One wheel notch while the piece comes in from the tray turns it once: 15°.
  const from = await centreOf(u.trayItems.first());
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(board.x + board.width * 0.3, board.y + board.height * 0.4, { steps: 20 });
  await page.mouse.wheel(0, 100);
  await page.mouse.up();
  await expect(u.trayItems.first()).toContainText("placed once");

  await u.trayItems.first().click();
  await expect(u.trayItems.first()).toContainText("placed 2 times");
  const { doc } = await savedDocument(page);
  expect(doc.placements).toHaveLength(2);
  // The dragged copy landed left of the clicked one, which goes to the middle of the view.
  expect(doc.placements[0].pose.x).toBeLessThan(doc.placements[1].pose.x - 10);
  expect(doc.placements[0].pose.rotation).toBeCloseTo(Math.PI / 12, 5);
});

test("a placed piece moves, turns under the wheel while held, and locks", async ({ page }) => {
  const u = ui(page);
  await u.trayItems.first().click();
  const before = (await savedDocument(page)).doc.placements[0].pose;

  const c = await centreOf(u.board);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 60, c.y + 30, { steps: 10 });
  await page.mouse.wheel(0, 100);
  await page.mouse.move(c.x + 80, c.y + 40, { steps: 4 });
  await page.mouse.up();
  await expect(u.selection).toContainText("1 piece selected");

  const moved = (await savedDocument(page)).doc.placements[0].pose;
  expect(moved.x).toBeGreaterThan(before.x + 5);
  expect(moved.y).toBeGreaterThan(before.y + 2);
  expect(moved.rotation - before.rotation).toBeCloseTo((15 * Math.PI) / 180, 3);

  // A whole drag is one undo step.
  await u.undo.click();
  expect((await savedDocument(page)).doc.placements[0].pose).toEqual(before);
  await u.redo.click();

  // Redo cleared the selection; select the piece again by clicking it, then lock it.
  const at = { x: c.x + 80, y: c.y + 40 };
  await page.mouse.click(at.x, at.y);
  await u.toggleLock.click();
  await expect(u.toggleLock).toHaveText("Unlock");
  await expect(u.remove).toBeDisabled();
  await mouseDrag(page, at, { x: at.x - 150, y: at.y - 100 });
  await expect(u.notice("is locked")).toBeVisible();
  expect((await savedDocument(page)).doc.placements[0].pose).toEqual(moved);
});

test("a placed piece can't be edited on the cutboard, but its duplicate can", async ({ page }) => {
  const u = ui(page);
  await u.trayItems.first().click();
  await u.tab("cutboard").click();
  await expect(u.lockedNote).toBeVisible();
  await expect(u.shapeKind).toBeDisabled();
  await u.duplicatePiece.click();
  await expect(u.pieceItems).toHaveCount(2);
  await expect(u.lockedNote).toBeHidden();
  await expect(u.shapeKind).toBeEnabled();
});

test("Delete removes the selected piece", async ({ page }) => {
  const u = ui(page);
  await u.trayItems.first().click();
  const c = await centreOf(u.board);
  await page.mouse.click(c.x, c.y);
  await expect(u.selection).toContainText("1 piece selected");
  await page.keyboard.press("Delete");
  await expect(u.trayItems.first()).toContainText("not placed");
});
