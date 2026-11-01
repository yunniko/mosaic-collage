"use client";

import type { AssetStore } from "@/lib/document/types";
import type { RgbaImage } from "@/lib/raster/image";
import { store } from "../state/store";

/**
 * Decoded image and PDF-page textures, keyed as `textureImageKey` keys them. Decoding is asynchronous; a lookup that
 * misses starts it and returns undefined, the piece is drawn with a stand-in colour and not cached, and when the
 * pixels arrive `textureVersion` is bumped so every board redraws with them. See D010.
 */

/** The longest side a texture is decoded at: enough for a piece several times the screen without holding 100 MB. */
export const MAX_TEXTURE_PX = 2048;

const decoded = new Map<string, RgbaImage>();
const decoding = new Set<string>();

/** The pixels for `key`, or undefined while they are being decoded (the decode is started on the first miss). */
export function lookupTextureImage(key: string): RgbaImage | undefined {
  const hit = decoded.get(key);
  if (hit || decoding.has(key)) return hit;
  const [assetId, page] = key.split("#");
  const bytes = store.getState().assets.get(assetId);
  if (!bytes) return undefined;
  decoding.add(key);
  const meta = store.doc.assets.find((a) => a.id === assetId);
  const work = page !== undefined ? decodePdfPage(bytes, Number(page)) : decodeImage(bytes, meta?.mime ?? "");
  work
    .catch((e) => {
      console.error(e);
      store.notify("error", { key: "errors.texture-unreadable", values: { name: meta?.name ?? assetId } });
      // A failed decode becomes a single white pixel, so the piece stops waiting for it.
      return { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255]) } satisfies RgbaImage;
    })
    .then((img) => {
      decoding.delete(key);
      // The asset may have gone with a loaded or new document while it was decoding.
      if (store.getState().assets.get(assetId) !== bytes) return;
      decoded.set(key, img);
      store.set({ textureVersion: store.getState().textureVersion + 1 });
    });
  return undefined;
}

/** Drops decoded pixels of assets no longer in the store (a new or loaded document replaced them). */
function prune(assets: AssetStore) {
  for (const key of decoded.keys()) if (!assets.has(key.split("#")[0])) decoded.delete(key);
}
let lastAssets = store.getState().assets;
store.subscribe(() => {
  const { assets } = store.getState();
  if (assets === lastAssets) return;
  lastAssets = assets;
  prune(assets);
});

function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext("2d", { willReadFrequently: true })! };
}

const fit = (w: number, h: number) => Math.min(1, MAX_TEXTURE_PX / Math.max(w, h));

async function decodeImage(bytes: Uint8Array, mime: string): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }));
  const k = fit(bitmap.width, bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * k));
  const height = Math.max(1, Math.round(bitmap.height * k));
  const { ctx } = canvasOf(width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return ctx.getImageData(0, 0, width, height);
}

type PdfJs = typeof import("pdfjs-dist");
let pdfjs: Promise<PdfJs> | null = null;

/** pdf.js, loaded on first use (it is large and most documents never need it), with its worker bundled beside it. */
function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    return m;
  });
  return pdfjs;
}

/**
 * Opens a PDF, runs `run` on it and releases its worker resources. pdf.js takes ownership of (detaches) the buffer
 * it is given, so it always gets a copy.
 */
async function withPdf<T>(bytes: Uint8Array, run: (pdf: import("pdfjs-dist").PDFDocumentProxy) => Promise<T>): Promise<T> {
  const lib = await loadPdfJs();
  const task = lib.getDocument({ data: bytes.slice() });
  try {
    return await run(await task.promise);
  } finally {
    await task.destroy();
  }
}

async function decodePdfPage(bytes: Uint8Array, pageNumber: number): Promise<RgbaImage> {
  return withPdf(bytes, async (pdf) => {
    const page = await pdf.getPage(Math.min(Math.max(1, pageNumber), pdf.numPages));
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: MAX_TEXTURE_PX / Math.max(base.width, base.height) });
    const { canvas, ctx } = canvasOf(Math.round(viewport.width), Math.round(viewport.height));
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  });
}

/** The number of pages in a PDF asset, for the page picker. */
export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  return withPdf(bytes, async (pdf) => pdf.numPages);
}
