import { readFile } from "node:fs/promises";
import { type Download, type Page, expect, test } from "@playwright/test";
import { openStudio, savedDocument, ui } from "./helpers/studio";

test.beforeEach(async ({ page }) => {
  await openStudio(page);
  await ui(page).newPiece.click();
  await ui(page).tab("workboard").click();
  await expect(ui(page).board).toBeVisible();
  await ui(page).trayItems.first().click();
  await expect(ui(page).trayItems.first()).toContainText("placed once");
});

/** Exports through the UI and returns the downloaded file. */
async function exported(page: Page): Promise<{ bytes: Buffer; download: Download }> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-start").click()]);
  return { bytes: await readFile(await download.path()), download };
}

/** Decodes an image in the page and reads its size and a few pixels: [corner, centre] as RGBA. */
async function decode(page: Page, bytes: Buffer, mime: string) {
  return page.evaluate(
    async ({ b64, mime }) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bin], { type: mime }));
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      const at = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data];
      return { width: bmp.width, height: bmp.height, corner: at(1, 1), centre: at(bmp.width >> 1, bmp.height >> 1) };
    },
    { b64: bytes.toString("base64"), mime }
  );
}

/** The size the panel announces, e.g. "171 × 171 px". */
async function announcedSize(page: Page) {
  const text = (await page.getByTestId("export-size").textContent())!;
  const [, w, h] = /(\d+)\s*×\s*(\d+)/.exec(text)!;
  return { width: Number(w), height: Number(h) };
}

test("a PNG export has the announced size and the background behind the piece", async ({ page }) => {
  await page.getByTestId("export-dpi").selectOption("72");
  const size = await announcedSize(page);
  // The 40 mm piece plus 10 mm of background on each side, at 72 dpi.
  expect(size.width).toBe(Math.ceil((60 * 72) / 25.4));

  const { bytes, download } = await exported(page);
  await expect(ui(page).notice(/Exported/)).toBeVisible();
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  expect(bytes.subarray(1, 4).toString("latin1")).toBe("PNG");
  const img = await decode(page, bytes, "image/png");
  expect({ width: img.width, height: img.height }).toEqual(size);
  // The default background colour #f4efe4, opaque, in the padding.
  expect(img.corner).toEqual([0xf4, 0xef, 0xe4, 255]);
});

test("without its background a PNG is transparent around the piece; a JPG always has one", async ({ page }) => {
  await page.getByTestId("export-dpi").selectOption("72");
  await page.getByTestId("export-background").uncheck();
  let img = await decode(page, (await exported(page)).bytes, "image/png");
  expect(img.corner[3]).toBe(0);
  expect(img.centre[3]).toBe(255);

  await page.getByTestId("export-format").selectOption("jpeg");
  await expect(page.getByTestId("export-background")).toBeDisabled();
  await expect(page.getByTestId("export-background")).toBeChecked();
  const { bytes, download } = await exported(page);
  expect(download.suggestedFilename()).toMatch(/\.jpg$/);
  expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
  img = await decode(page, bytes, "image/jpeg");
  // JPEG is lossy: the background colour within a few levels.
  expect(Math.max(...[0xf4, 0xef, 0xe4].map((v, i) => Math.abs(v - img.corner[i])))).toBeLessThanOrEqual(6);
});

test("the background takes a texture and a padding, and both are saved", async ({ page }) => {
  await page.getByTestId("background-kind").selectOption("generated");
  await page.getByTestId("background-generator").selectOption("marble");
  await page.getByTestId("background-padding").fill("25");
  await page.getByTestId("export-dpi").selectOption("72");
  expect((await announcedSize(page)).width).toBe(Math.ceil((90 * 72) / 25.4));

  const { doc } = await savedDocument(page);
  expect(doc.background.texture).toMatchObject({ kind: "generated", generatorId: "marble" });
  expect(doc.background.padding).toBe(25);

  // Undo takes the padding back.
  await ui(page).undo.click();
  expect((await savedDocument(page)).doc.background.padding).toBe(10);
});

test("the export is refused, with the reason, when nothing is placed", async ({ page }) => {
  await ui(page).remove.click();
  await expect(page.getByTestId("export-size")).toContainText("Place pieces");
  await expect(page.getByTestId("export-start")).toBeDisabled();
});
