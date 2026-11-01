import { type Page, expect, test } from "@playwright/test";
import { openStudio, savedDocument, ui } from "./helpers/studio";

/** A cheap fingerprint of everything the cutboard shows, to tell whether a change was drawn at all. */
function cutboardPrint(page: Page): Promise<number> {
  return ui(page).cutboard.evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) | 0;
    return h;
  });
}

/**
 * The cutboard's fingerprint once two readings agree. A large sprite is shown coarse and refined in the background
 * (D012), so a settled print may be either: compare prints to tell a change happened, not to match an earlier state.
 */
async function settledPrint(page: Page): Promise<number> {
  let last = NaN;
  await expect
    .poll(async () => {
      const prev = last;
      last = await cutboardPrint(page);
      return last === prev;
    })
    .toBe(true);
  return last;
}

test("a relief takes a style and its sliders, is drawn, and undo walks it back", async ({ page }) => {
  await openStudio(page);
  const u = ui(page);
  await u.newPiece.click();
  const flat = await settledPrint(page);

  await expect(page.getByTestId("relief-size")).toHaveCount(0);
  await page.getByTestId("relief-style").selectOption("emboss");
  await page.getByTestId("relief-size").fill("3");
  await page.getByTestId("relief-depth").fill("80");
  await page.getByTestId("relief-lightAngle").fill("90");
  await expect.poll(() => cutboardPrint(page)).not.toBe(flat);
  const embossed = await settledPrint(page);

  let { doc } = await savedDocument(page);
  expect(doc.pieces[0].relief).toMatchObject({ style: "emboss", size: 3, lightAngle: 90 });
  expect(doc.pieces[0].relief.depth).toBeCloseTo(0.8, 6);

  // Each slider is one undo step, the style another.
  for (let i = 0; i < 4; i++) await u.undo.click();
  ({ doc } = await savedDocument(page));
  expect(doc.pieces[0].relief.style).toBe("none");
  await expect.poll(() => cutboardPrint(page)).not.toBe(embossed);
});

test("a torn edge takes a paper, a roughness, a core colour and a new tear", async ({ page }) => {
  await openStudio(page);
  const u = ui(page);
  await u.newPiece.click();
  const cut = await settledPrint(page);

  await expect(page.getByTestId("edge-paper")).toHaveCount(0);
  await page.getByTestId("edge-enabled").check();
  await page.getByTestId("edge-paper").selectOption("tissue");
  await page.getByTestId("edge-roughness").fill("3");
  await page.getByTestId("edge-coverage").fill("50");
  await expect.poll(() => cutboardPrint(page)).not.toBe(cut);

  await page.getByTestId("edge-core-from-paper").uncheck();
  await page.getByTestId("edge-core-color").fill("#203040");

  let { doc } = await savedDocument(page);
  const edge = doc.pieces[0].edge;
  expect(edge).toMatchObject({ enabled: true, paper: "tissue", roughness: 3, rimColor: "#203040" });
  expect(edge.coverage).toBeCloseTo(0.5, 6);

  const torn = await settledPrint(page);
  await page.getByTestId("edge-reroll").click();
  ({ doc } = await savedDocument(page));
  expect(doc.pieces[0].edge.seed).not.toBe(edge.seed);
  await expect.poll(() => cutboardPrint(page)).not.toBe(torn);

  await page.getByTestId("edge-enabled").uncheck();
  await expect(page.getByTestId("edge-paper")).toHaveCount(0);
  ({ doc } = await savedDocument(page));
  expect(doc.pieces[0].edge.enabled).toBe(false);
});
