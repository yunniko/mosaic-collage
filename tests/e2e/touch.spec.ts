import { expect, test } from "@playwright/test";
import { centreOf, openStudio, savedDocument, ui } from "./helpers/studio";

/** Touch: one finger holds a piece, a second finger swung around it turns it. Driven through CDP touch events. */
test("a second finger turns a held piece", async ({ page }) => {
  await openStudio(page);
  await ui(page).newPiece.click();
  await ui(page).tab("workboard").click();
  await ui(page).trayItems.first().click();
  const before = (await savedDocument(page)).doc.placements[0].pose;
  const c = await centreOf(ui(page).board);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", points: { x: number; y: number; id: number }[]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });

  const held = { x: c.x, y: c.y, id: 1 };
  await touch("touchStart", [held]);
  await touch("touchStart", [held, { x: c.x + 100, y: c.y, id: 2 }]);
  // The second finger swings 90° about the first.
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    await touch("touchMove", [held, { x: c.x + 100 * Math.cos(a), y: c.y + 100 * Math.sin(a), id: 2 }]);
  }
  await touch("touchEnd", [held]);
  await touch("touchEnd", []);

  const after = (await savedDocument(page)).doc.placements[0].pose;
  expect(after.rotation - before.rotation).toBeCloseTo(Math.PI / 2, 1);
  // Turning about the held finger at the piece's centre leaves it where it was.
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(1);
});
