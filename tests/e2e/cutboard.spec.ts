import { expect, test } from "@playwright/test";
import { drawStroke, loop, openStudio, savedDocument, ui } from "./helpers/studio";

test("a new piece can be shaped and coloured, and undo walks it back", async ({ page }) => {
  await openStudio(page);
  const u = ui(page);
  await u.newPiece.click();
  await expect(u.pieceItems).toHaveCount(1);

  await u.shapeKind.selectOption("star");
  await expect(u.param("points")).toBeVisible();
  await u.param("points").fill("7");
  await u.textureColor.fill("#3366cc");

  let { doc } = await savedDocument(page);
  expect(doc.pieces[0].shape).toMatchObject({ kind: "predefined", shapeId: "star", params: { points: 7 } });
  expect(doc.pieces[0].texture).toEqual({ kind: "plain", color: "#3366cc" });

  await u.undo.click();
  ({ doc } = await savedDocument(page));
  expect(doc.pieces[0].texture).not.toEqual({ kind: "plain", color: "#3366cc" });
  await u.redo.click();
  ({ doc } = await savedDocument(page));
  expect(doc.pieces[0].texture).toEqual({ kind: "plain", color: "#3366cc" });
});

test("a saved file opens back to the same document", async ({ page }) => {
  await openStudio(page);
  const u = ui(page);
  await u.newPiece.click();
  await u.newPiece.click();
  await u.shapeKind.selectOption("heart");
  const { doc, download } = await savedDocument(page);
  const path = await download.path();

  page.once("dialog", (d) => d.accept());
  await u.fileNew.click();
  await expect(u.pieceItems).toHaveCount(0);

  const chooser = page.waitForEvent("filechooser");
  await u.open.click();
  await (await chooser).setFiles(path);
  await expect(u.pieceItems).toHaveCount(2);
  expect((await savedDocument(page)).doc).toEqual(doc);
});

test("a generated shape takes parameters and rerolls to a new variation", async ({ page }) => {
  await openStudio(page);
  const u = ui(page);
  await u.newPiece.click();
  await u.shapeSource.selectOption("generated");
  await u.generatorKind.selectOption("shard");
  await u.param("neighbours").fill("9");
  let { doc } = await savedDocument(page);
  const first = doc.pieces[0].shape;
  expect(first).toMatchObject({ kind: "generated", generatorId: "shard", params: { neighbours: 9 } });

  await u.reroll.click();
  ({ doc } = await savedDocument(page));
  const second = doc.pieces[0].shape;
  expect(second).toMatchObject({ kind: "generated", generatorId: "shard", params: { neighbours: 9 } });
  expect(second.kind === "generated" && first.kind === "generated" && second.seed !== first.seed).toBe(true);
});

test("a hand cut is drawn on the cutboard and its stabilisation can be changed", async ({ page }) => {
  await openStudio(page);
  const u = ui(page);
  await u.newPiece.click();
  await u.shapeSource.selectOption("hand");
  await expect(u.cutHint).toBeVisible();
  await drawStroke(page, u.cutboard, loop(0.5, 0.5, 0.25));
  await expect(u.cutHint).toBeHidden();

  let { doc } = await savedDocument(page);
  const shape = doc.pieces[0].shape;
  expect(shape.kind).toBe("hand");
  expect(shape.kind === "hand" && shape.points.length).toBeGreaterThan(20);
  expect(shape).toMatchObject({ stabilization: 40 });

  await u.param("stabilization").fill("80");
  ({ doc } = await savedDocument(page));
  expect(doc.pieces[0].shape).toMatchObject({ kind: "hand", stabilization: 80 });

  // Esc leaves cut mode without touching the piece.
  await u.cutAgain.click();
  await expect(u.cutHint).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(u.cutHint).toBeHidden();
});

test("a cut that crosses itself into two pieces is refused with a message", async ({ page }) => {
  await openStudio(page);
  const u = ui(page);
  await u.newPiece.click();
  await u.shapeSource.selectOption("hand");
  // A figure-eight: two loops joined at the crossing.
  await drawStroke(page, u.cutboard, [
    [0.3, 0.3],
    [0.7, 0.7],
    [0.7, 0.3],
    [0.3, 0.7],
    [0.3, 0.3],
  ]);
  await expect(u.notice(/separate pieces/)).toBeVisible();
  await expect(u.cutHint).toBeVisible();
  const { doc } = await savedDocument(page);
  expect(doc.pieces[0].shape.kind).toBe("predefined");
});

test("Esc during a stroke cancels the cut, and a stray click is not an error", async ({ page }) => {
  await openStudio(page);
  const u = ui(page);
  await u.newPiece.click();
  await u.shapeSource.selectOption("hand");
  const b = (await u.cutboard.boundingBox())!;
  // A click without a drag is ignored: no notice, still cutting.
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(u.notice(/./)).toHaveCount(0);
  await expect(u.cutHint).toBeVisible();

  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.3, { steps: 8 });
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.7, { steps: 8 });
  await page.keyboard.press("Escape");
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3, { steps: 8 });
  await page.mouse.up();
  await expect(u.cutHint).toBeHidden();
  const { doc } = await savedDocument(page);
  expect(doc.pieces[0].shape.kind).toBe("predefined");
});
