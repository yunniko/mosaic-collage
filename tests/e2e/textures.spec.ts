import { readFile } from "node:fs/promises";
import { type Page, expect, test } from "@playwright/test";
import JSZip from "jszip";
import { solidPdf, solidPng } from "./helpers/fixtures";
import { openStudio, savedDocument, ui } from "./helpers/studio";

/** The colour at the centre of the cutboard, where the selected piece is framed. */
async function centrePixel(page: Page): Promise<[number, number, number]> {
  return page.getByTestId("cutboard-canvas").evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
    return [d[0], d[1], d[2]] as [number, number, number];
  });
}

/** Waits until the cutboard's centre is within `tol` of `rgb` in every channel (decoding is asynchronous). */
async function expectCentre(page: Page, rgb: [number, number, number], tol = 6) {
  await expect
    .poll(async () => {
      const px = await centrePixel(page);
      return Math.max(...px.map((v, i) => Math.abs(v - rgb[i])));
    })
    .toBeLessThanOrEqual(tol);
}

test("a generated texture takes a generator, parameters, colours and a new variation", async ({ page }) => {
  await openStudio(page);
  const u = ui(page);
  await u.newPiece.click();
  await u.textureKind.selectOption("generated");
  await u.textureGenerator.selectOption("marble");
  await u.param("turbulence").fill("7");
  await page.getByTestId("texture-stop-0").fill("#102030");
  await page.getByTestId("texture-rotation").fill("30");

  let { doc } = await savedDocument(page);
  const tex = doc.pieces[0].texture;
  expect(tex).toMatchObject({ kind: "generated", generatorId: "marble", params: { turbulence: 7 } });
  expect(tex.kind === "generated" && tex.colors[0]).toBe("#102030");
  expect(doc.pieces[0].textureTransform.rotation).toBeCloseTo(Math.PI / 6, 6);
  const seed = tex.kind === "generated" ? tex.seed : -1;

  await u.textureReroll.click();
  ({ doc } = await savedDocument(page));
  expect(doc.pieces[0].texture).toMatchObject({ kind: "generated", generatorId: "marble" });
  expect((doc.pieces[0].texture as { seed: number }).seed).not.toBe(seed);
});

test("an uploaded image textures the piece, is saved in the file and opens back", async ({ page }) => {
  await openStudio(page);
  const u = ui(page);
  await u.newPiece.click();
  await u.textureFile.setInputFiles({ name: "red.png", mimeType: "image/png", buffer: solidPng([220, 30, 40]) });
  await expect(page.getByTestId("texture-file-name")).toHaveText("red.png");
  await expectCentre(page, [220, 30, 40]);

  const { doc, download } = await savedDocument(page);
  const tex = doc.pieces[0].texture;
  expect(tex.kind).toBe("image");
  const zip = await JSZip.loadAsync(await readFile(await download.path()));
  const assetId = (tex as { assetId: string }).assetId;
  expect(doc.assets).toEqual([{ id: assetId, name: "red.png", mime: "image/png", kind: "image" }]);
  expect(zip.file(`assets/${assetId}`)).not.toBeNull();

  page.once("dialog", (d) => d.accept());
  await u.fileNew.click();
  const chooser = page.waitForEvent("filechooser");
  await u.open.click();
  await (await chooser).setFiles(await download.path());
  await expect(u.pieceItems).toHaveCount(1);
  await expectCentre(page, [220, 30, 40]);
  expect((await savedDocument(page)).doc).toEqual(doc);
});

test("a PDF page textures the piece, and another page can be picked", async ({ page }) => {
  await openStudio(page);
  const u = ui(page);
  await u.newPiece.click();
  await u.textureFile.setInputFiles({
    name: "two-pages.pdf",
    mimeType: "application/pdf",
    buffer: solidPdf([
      [0, 0, 1],
      [0, 0.5, 0],
    ]),
  });
  await expectCentre(page, [0, 0, 255]);
  await expect(page.getByText("PDF page (of 2)")).toBeVisible();
  await page.getByTestId("texture-pdf-page").fill("2");
  await expectCentre(page, [0, 128, 0]);
  expect((await savedDocument(page)).doc.pieces[0].texture).toMatchObject({ kind: "pdf", page: 2 });
});

test("a file that is not an image or PDF is refused with a message", async ({ page }) => {
  await openStudio(page);
  const u = ui(page);
  await u.newPiece.click();
  await u.textureFile.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(u.notice("not an image or a PDF")).toBeVisible();
  expect((await savedDocument(page)).doc.pieces[0].texture.kind).toBe("plain");
});

test("colour layers tint and shift the texture, in order, and can be removed", async ({ page }) => {
  await openStudio(page);
  const u = ui(page);
  await u.newPiece.click();
  await u.textureColor.fill("#ffffff");
  await expectCentre(page, [255, 255, 255], 1);

  await page.getByTestId("add-tint").click();
  await page.getByTestId("tint-color-0").fill("#00ff00");
  await page.getByTestId("tint-mode-0").selectOption("multiply");
  await expectCentre(page, [0, 255, 0], 1);

  await page.getByTestId("add-hsl").click();
  await page.getByTestId("hsl-hue-1").fill("120");
  // Green turned 120° is blue.
  await expectCentre(page, [0, 0, 255], 2);

  const { doc } = await savedDocument(page);
  expect(doc.pieces[0].colors).toEqual([
    { kind: "tint", color: "#00ff00", mode: "multiply", opacity: 1 },
    { kind: "hsl", hue: 120, saturation: 0, lightness: 0 },
  ]);

  await page.getByTestId("color-layer-remove-0").click();
  // Only the hue shift is left, and white has no hue to turn.
  await expectCentre(page, [255, 255, 255], 1);
});
