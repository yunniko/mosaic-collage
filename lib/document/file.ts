import JSZip from "jszip";
import { usedAssetIds } from "./ops";
import type { AssetStore, MosaicDocument } from "./types";
import { InvalidDocumentError, parseDocument } from "./validate";

/**
 * The editable `.mosaic` file: a zip holding `mosaic.json` (the document) and `assets/<id>` (each uploaded image or
 * PDF, byte for byte as uploaded). Only assets still in use are written.
 */
export const FILE_EXTENSION = ".mosaic";
export const FILE_MIME = "application/x-mosaic+zip";
const DOC_ENTRY = "mosaic.json";
/** Refuse absurd files before unzipping them whole. */
export const MAX_FILE_BYTES = 512 * 1024 * 1024;

export async function saveMosaicFile(doc: MosaicDocument, store: AssetStore): Promise<Uint8Array> {
  const used = usedAssetIds(doc);
  const assets = doc.assets.filter((a) => used.has(a.id) && store.has(a.id));
  const zip = new JSZip();
  zip.file(DOC_ENTRY, JSON.stringify({ ...doc, assets }, null, 1));
  for (const a of assets) zip.file(`assets/${a.id}`, store.get(a.id)!, { compression: "STORE" });
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function loadMosaicFile(bytes: Uint8Array): Promise<{ doc: MosaicDocument; store: AssetStore; warnings: string[] }> {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new InvalidDocumentError("This file is too large to open.");
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new InvalidDocumentError("This file is not a mosaic file.");
  }
  const entry = zip.file(DOC_ENTRY);
  if (!entry) throw new InvalidDocumentError("This file is not a mosaic file.");
  let json: unknown;
  try {
    json = JSON.parse(await entry.async("string"));
  } catch {
    throw new InvalidDocumentError("The mosaic inside this file is damaged.");
  }
  const store: AssetStore = new Map();
  for (const name of Object.keys(zip.files)) {
    const m = /^assets\/([A-Za-z0-9-]{1,64})$/.exec(name);
    if (m) store.set(m[1], await zip.files[name].async("uint8array"));
  }
  const { doc, warnings } = parseDocument(json, new Set(store.keys()));
  for (const k of [...store.keys()]) if (!doc.assets.some((a) => a.id === k)) store.delete(k);
  return { doc, store, warnings };
}
