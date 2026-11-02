import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { TEXTURE_LIBRARY, findLibraryTexture } from "@/lib/textures/library";

describe("the bundled texture library", () => {
  const attribution = readFileSync("assets/ATTRIBUTION.md", "utf-8");

  it.each(TEXTURE_LIBRARY.map((t) => [t.file, t]))("%s is served, labelled and attributed", (file, t) => {
    expect(existsSync(`public/textures/${file}`)).toBe(true);
    expect((en.textureLibrary as Record<string, string>)[t.label]).toBeTruthy();
    expect(attribution).toContain(file);
  });

  it("recognises an asset by its file name only", () => {
    expect(findLibraryTexture("paper-005.jpg")?.label).toBe("paper005");
    expect(findLibraryTexture("my-paper.jpg")).toBeUndefined();
    expect(findLibraryTexture(undefined)).toBeUndefined();
  });
});
