/**
 * The bundled image textures: photographed paper and card, served from `public/textures/` and listed in
 * `assets/ATTRIBUTION.md` (D017). Choosing one copies its bytes into the document like an upload, so a saved file
 * never depends on the site that made it.
 */
export interface LibraryTexture {
  /** Also the asset's file name in a document, which is how the picker recognises a library texture again. */
  file: string;
  /** Message key under `textureLibrary.`. */
  label: string;
}

export const TEXTURE_LIBRARY: readonly LibraryTexture[] = [
  { file: "paper-001.jpg", label: "paper001" },
  { file: "paper-003.jpg", label: "paper003" },
  { file: "paper-005.jpg", label: "paper005" },
  { file: "cardboard-001.jpg", label: "cardboard001" },
];

/** The URL a library texture is fetched from. */
export const libraryUrl = (t: LibraryTexture) => `/textures/${t.file}`;

/** The library texture a document asset was made from, judged by its file name. */
export const findLibraryTexture = (assetName: string | undefined) => TEXTURE_LIBRARY.find((t) => t.file === assetName);
