"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import type { AssetStore, MosaicDocument } from "@/lib/document/types";
import type { RgbaImage } from "@/lib/raster/image";
import { parseTextureImageKey, textureImageKey } from "@/lib/textures/sample";
import { store } from "../state/store";
import { createCanvas2d } from "./canvas";

/**
 * Decoded image and PDF-page textures, keyed as `textureImageKey` keys them. Decoding is asynchronous; a lookup that
 * misses starts it and returns undefined, the piece is drawn with a stand-in colour, and when the decode settles
 * (pixels, or "failed") `textureVersion` is bumped so every board redraws. See D010.
 */

/** The longest side a texture is decoded at: enough for a piece several times the screen without holding 100 MB. */
export const MAX_TEXTURE_PX = 2048;

const decoded = new Map<string, RgbaImage | "failed">();
const decoding = new Set<string>();

/** The pixels for `key`, "failed", or undefined while they are being decoded (the decode starts on the first miss). */
export function lookupTextureImage(key: string): RgbaImage | "failed" | undefined {
  const hit = decoded.get(key);
  if (hit || decoding.has(key)) return hit;
  const { assetId, page } = parseTextureImageKey(key);
  const bytes = store.getState().assets.get(assetId);
  // Without bytes there is nothing to decode. Not cached, in case the asset is added later.
  if (!bytes) return "failed";
  decoding.add(key);
  const meta = store.doc.assets.find((a) => a.id === assetId);
  const work = page !== null ? decodePdfPage(assetId, page) : decodeImage(bytes, meta?.mime ?? "");
  work
    .catch((e): "failed" => {
      console.error(e);
      store.notify("error", { key: "errors.texture-unreadable", values: { name: meta?.name ?? assetId } });
      return "failed";
    })
    .then((result) => {
      decoding.delete(key);
      // The asset may have gone with a loaded or new document while it was decoding: the result is dropped, but
      // waiters (an export) are still told to look again, so they see the asset missing instead of waiting on.
      if (store.getState().assets.get(assetId) === bytes) decoded.set(key, result);
      store.set({ textureVersion: store.getState().textureVersion + 1 });
    });
  return undefined;
}

/** The pixels for `key` once decoded (or "failed"), for work such as an export that cannot use a stand-in. */
export function settledTextureImage(key: string): Promise<RgbaImage | "failed"> {
  return new Promise((resolve) => {
    const check = () => {
      const img = lookupTextureImage(key);
      if (img === undefined) return false;
      resolve(img);
      return true;
    };
    if (check()) return;
    const stop = store.subscribe(() => {
      if (check()) stop();
    });
  });
}

/**
 * Drops decoded pixels no piece or background uses any more (an earlier PDF page, a replaced picture: each can hold 16 MB), and
 * closes PDFs whose asset left the store. Undoing back to such a texture decodes it again.
 */
function prune(doc: MosaicDocument, assets: AssetStore) {
  const used = new Set([...doc.pieces.map((p) => p.texture), doc.background.texture].map(textureImageKey));
  for (const key of decoded.keys()) if (!used.has(key)) decoded.delete(key);
  for (const [assetId, open] of pdfs) {
    if (assets.get(assetId) === open.bytes) continue;
    pdfs.delete(assetId);
    open.task.then((t) => t.destroy()).catch(() => {});
  }
}
let last = { doc: store.doc, assets: store.getState().assets };
store.subscribe(() => {
  const now = { doc: store.doc, assets: store.getState().assets };
  if (now.doc === last.doc && now.assets === last.assets) return;
  last = now;
  prune(now.doc, now.assets);
});

const fit = (w: number, h: number) => Math.min(1, MAX_TEXTURE_PX / Math.max(w, h));

async function decodeImage(bytes: Uint8Array, mime: string): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }));
  const k = fit(bitmap.width, bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * k));
  const height = Math.max(1, Math.round(bitmap.height * k));
  const { ctx } = createCanvas2d(width, height, { willReadFrequently: true });
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
  // A chunk that failed to load (a dropped connection) is tried again next time, not remembered as failed.
  pdfjs.catch(() => (pdfjs = null));
  return pdfjs;
}

/** Open PDFs by asset id: each file is parsed once for its page count and all its pages, and closed by `prune`. */
const pdfs = new Map<string, { bytes: Uint8Array; task: Promise<{ destroy(): Promise<void> }>; doc: Promise<PDFDocumentProxy> }>();

function openPdf(assetId: string): Promise<PDFDocumentProxy> {
  const bytes = store.getState().assets.get(assetId);
  if (!bytes) return Promise.reject(new Error(`no bytes for asset ${assetId}`));
  const open = pdfs.get(assetId);
  if (open && open.bytes === bytes) return open.doc;
  // pdf.js takes ownership of (detaches) the buffer it is given, so it always gets a copy.
  const task = loadPdfJs().then((lib) => lib.getDocument({ data: bytes.slice() }));
  const doc = task.then((t) => t.promise);
  pdfs.set(assetId, { bytes, task, doc });
  // A file pdf.js cannot read is not kept open: a later attempt starts again.
  doc.catch(() => pdfs.get(assetId)?.doc === doc && pdfs.delete(assetId));
  return doc;
}

async function decodePdfPage(assetId: string, pageNumber: number): Promise<RgbaImage> {
  const pdf = await openPdf(assetId);
  const page = await pdf.getPage(Math.min(Math.max(1, pageNumber), pdf.numPages));
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: MAX_TEXTURE_PX / Math.max(base.width, base.height) });
  const { canvas, ctx } = createCanvas2d(Math.round(viewport.width), Math.round(viewport.height), { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** The number of pages in a PDF asset, for the page picker. */
export async function pdfPageCount(assetId: string): Promise<number> {
  return (await openPdf(assetId)).numPages;
}
