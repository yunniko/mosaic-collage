import { expect, test } from "@playwright/test";
import { openStudio, savedDocument, ui } from "./helpers/studio";

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
