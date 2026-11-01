"use client";

import { getPiece } from "@/lib/document/ops";
import type { MosaicDocument } from "@/lib/document/types";
import type { ExportOptions, ExportPlan } from "@/lib/export/plan";
import type { RgbaImage } from "@/lib/raster/image";
import { textureImageKey } from "@/lib/textures/sample";
import { settledTextureImage } from "../render/texture-images";
import type { ExportJob, ExportReply } from "./export.worker";

/** Every decoded texture the artwork uses, waiting for any still decoding: an export never shows a stand-in. */
async function artworkImages(doc: MosaicDocument): Promise<Record<string, RgbaImage | "failed">> {
  const textures = [...doc.placements.map((pl) => getPiece(doc, pl.pieceId).texture), doc.background.texture];
  const keys = new Set(textures.map(textureImageKey).filter((k): k is string => k !== null));
  const images: Record<string, RgbaImage | "failed"> = {};
  await Promise.all([...keys].map(async (k) => (images[k] = await settledTextureImage(k))));
  return images;
}

/** Composes the export in a worker, or on the page when a worker cannot start. Needs `OffscreenCanvas` either way. */
export async function runExport(
  doc: MosaicDocument,
  plan: ExportPlan,
  opts: ExportOptions,
  onProgress: (p: number) => void
): Promise<Blob> {
  if (typeof OffscreenCanvas === "undefined") throw new Error("This browser cannot compose images off screen; please update it.");
  const images = await artworkImages(doc);
  let worker: Worker;
  try {
    worker = new Worker(new URL("./export.worker.ts", import.meta.url), { type: "module" });
  } catch {
    const { composeArtwork } = await import("./compose");
    return composeArtwork(doc, plan, opts, (k) => images[k], onProgress);
  }
  return new Promise<Blob>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<ExportReply>) => {
      const r = e.data;
      if ("progress" in r) return onProgress(r.progress);
      worker.terminate();
      if ("blob" in r) resolve(r.blob);
      else reject(new Error(r.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || "The export could not start."));
    };
    worker.postMessage({ doc, plan, opts, images } satisfies ExportJob);
  });
}
