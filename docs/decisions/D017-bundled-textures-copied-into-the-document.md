# D017 · Bundled image textures are copied into the document when chosen
Date: 2026-11-02 · Goal: G-001 M4 · Status: active (superseded by: —)
Context: criterion 2 asks for a predefined set of image textures. The Owner approved four CC0 ambientCG maps on 2026-11-02.
Decision: the maps are served from `public/textures/`. Choosing one fetches its bytes and stores them as an ordinary image asset named after the file, as an upload is stored.
Force: judgment — a `.mosaic` file then opens the same anywhere, offline and if the library changes, at the cost of about 20–170 KB per texture used.
Rejected: a new `library` texture kind referring to the URL (a saved file would depend on this site and on the files never changing); embedding the images in the JS bundle (every visitor would download all of them).
Consequence: the picker recognises a library texture by its asset's file name (`findLibraryTexture`). A library file must never be replaced under the same name; a changed image gets a new name.
Evidence: lib/textures/library.ts; tests/unit/texture-library.spec.ts; tests/e2e/textures.spec.ts; assets/ATTRIBUTION.md
