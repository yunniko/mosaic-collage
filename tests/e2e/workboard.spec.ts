import { expect, test } from "@playwright/test";
import { boardToPage, centreOf, keepApart, mouseDrag, openStudio, savedDocument, ui } from "./helpers/studio";

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

const xy = (p: { x: number; y: number }): [number, number] => [p.x, p.y];

test.describe("with overlap off", () => {
  test.beforeEach(async ({ page }) => {
    const u = ui(page);
    await u.allowOverlap.uncheck();
    await u.autoRotate.uncheck();
    // Two clicks place two pieces: the second finds the free spot nearest the first.
    await u.trayItems.first().click();
    await u.trayItems.first().click();
  });

  test("a second piece placed on the first moves to free space", async ({ page }) => {
    const [a, b] = (await savedDocument(page)).doc.placements;
    expect(keepApart(a, b, 2)).toBe(true);
    expect(Math.hypot(b.pose.x - a.pose.x, b.pose.y - a.pose.y)).toBeLessThan(80);
  });

  test("a dragged piece stops at its neighbour, then jumps past it", async ({ page }) => {
    const [a, b] = (await savedDocument(page)).doc.placements;
    // Push the second piece straight at the first: it stops at the margin.
    await mouseDrag(page, await boardToPage(page, b.pose), await boardToPage(page, a.pose), 20);
    const stopped = (await savedDocument(page)).doc.placements[1];
    expect(keepApart(a, stopped, 2)).toBe(true);
    expect(keepApart(a, stopped, 3)).toBe(false);
    expect(stopped.pose.rotation).toBe(0);

    // Pull on through to the far side: once the spot under the pointer is free, the piece is there.
    const far = { x: a.pose.x - (b.pose.x - a.pose.x) * 1.5, y: a.pose.y - (b.pose.y - a.pose.y) * 1.5 };
    await mouseDrag(page, await boardToPage(page, stopped.pose), await boardToPage(page, far), 30);
    const jumped = (await savedDocument(page)).doc.placements[1];
    expect(keepApart(a, jumped, 2)).toBe(true);
    expect(Math.hypot(jumped.pose.x - far.x, jumped.pose.y - far.y)).toBeLessThan(1);
  });

  test("with auto-rotate on, a piece stopped on its corner swings about it toward the pointer", async ({ page }) => {
    const u = ui(page);
    await u.autoRotate.check();
    const [a, b] = (await savedDocument(page)).doc.placements;
    // Carry the second piece clear to the right of the first, turning it 45° on the way: a diamond.
    const side = { x: a.pose.x + 70, y: a.pose.y };
    await page.mouse.move(...xy(await boardToPage(page, b.pose)));
    await page.mouse.down();
    await page.mouse.move(...xy(await boardToPage(page, side)), { steps: 20 });
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 100);
    await page.mouse.up();
    const diamond = (await savedDocument(page)).doc.placements[1];
    expect(diamond.pose.rotation).toBeCloseTo(Math.PI / 4, 5);

    // Pull it up and to the left, past the first piece: its left corner meets the first piece's side and it swings.
    const to = { x: a.pose.x + 10, y: a.pose.y - 40 };
    await mouseDrag(page, await boardToPage(page, diamond.pose), await boardToPage(page, to), 30);
    const swung = (await savedDocument(page)).doc.placements[1];
    expect(Math.abs(swung.pose.rotation - Math.PI / 4)).toBeGreaterThan(0.05);
    expect(keepApart(a, swung, 2)).toBe(true);
  });
});
