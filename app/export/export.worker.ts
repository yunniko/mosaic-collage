/// <reference lib="webworker" />
/** Composes an export off the page (D015), so a large one never freezes the boards. */
import type { MosaicDocument } from "@/lib/document/types";
import type { ExportOptions, ExportPlan } from "@/lib/export/plan";
import type { RgbaImage } from "@/lib/raster/image";
import { composeArtwork } from "./compose";

export interface ExportJob {
  doc: MosaicDocument;
  plan: ExportPlan;
  opts: ExportOptions;
  /** Every decoded texture the artwork uses, by `textureImageKey`. */
  images: Record<string, RgbaImage | "failed">;
}

export type ExportReply = { progress: number } | { blob: Blob } | { error: string };

self.onmessage = async (e: MessageEvent<ExportJob>) => {
  const { doc, plan, opts, images } = e.data;
  try {
    const blob = await composeArtwork(
      doc,
      plan,
      opts,
      (key) => images[key],
      (progress) => self.postMessage({ progress } satisfies ExportReply)
    );
    self.postMessage({ blob } satisfies ExportReply);
  } catch (err) {
    self.postMessage({ error: String(err) } satisfies ExportReply);
  }
};
