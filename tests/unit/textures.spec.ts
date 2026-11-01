import { describe, expect, it } from "vitest";
import { defaultPiece } from "@/lib/document/defaults";
import { BLEND_MODES, type Piece } from "@/lib/document/types";
import { type Rgb, adjustHsl, applyLayers, blend, hslToRgb, prepareLayers, rgbToHsl } from "@/lib/raster/blend";
import { type RgbaImage, createImage } from "@/lib/raster/image";
import { renderPiece } from "@/lib/render/piece";
import { pieceOutline } from "@/lib/shapes/outline";
import { defaultParams } from "@/lib/shapes/params";
import { TEXTURE_GENERATORS } from "@/lib/textures/generators";
import { ramp, textureImageKey, textureSampling } from "@/lib/textures/sample";

const NO_IMAGES = () => undefined;
const close = (a: Rgb, b: Rgb, digits = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));
const BOUNDS = { minX: -20, minY: -10, maxX: 20, maxY: 10 };
const IDENTITY = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };

describe("blend modes (W3C Compositing)", () => {
  const cb: Rgb = [0.2, 0.5, 0.8];
  const cs: Rgb = [0.6, 0.3, 0.9];

  it("matches the spec formulas for the separable modes", () => {
    close(blend("normal", cb, cs), cs);
    close(blend("multiply", cb, cs), [0.12, 0.15, 0.72]);
    close(blend("screen", cb, cs), [0.68, 0.65, 0.98]);
    close(blend("darken", cb, cs), [0.2, 0.3, 0.8]);
    close(blend("lighten", cb, cs), [0.6, 0.5, 0.9]);
    close(blend("difference", cb, cs), [0.4, 0.2, 0.1]);
    close(blend("exclusion", cb, cs), [0.56, 0.5, 0.26]);
    // overlay(cb, cs) = hard-light(cs, cb).
    close(blend("overlay", cb, cs), blend("hard-light", cs, cb));
    // hard-light: cs <= 0.5 multiplies by 2cs; above, screens by 2cs - 1.
    close(blend("hard-light", cb, cs), [1 - (1 - 0.2) * (1 - 0.2), 0.5 * 0.6, 1 - (1 - 0.8) * (1 - 0.8)]);
    // color-dodge: cb / (1 - cs), capped at 1; color-burn: 1 - min(1, (1 - cb) / cs).
    close(blend("color-dodge", cb, cs), [0.5, 0.5 / 0.7, 1]);
    close(blend("color-burn", cb, cs), [1 - 0.8 / 0.6, 1 - 0.5 / 0.3, 1 - 0.2 / 0.9].map((v) => Math.max(0, v)) as Rgb);
  });

  it("keeps the backdrop's luminosity under the hue, saturation and color modes", () => {
    const lum = ([r, g, b]: Rgb) => 0.3 * r + 0.59 * g + 0.11 * b;
    for (const mode of ["hue", "saturation", "color"] as const) expect(lum(blend(mode, cb, cs))).toBeCloseTo(lum(cb), 6);
    expect(lum(blend("luminosity", cb, cs))).toBeCloseTo(lum(cs), 6);
  });

  it("stays inside 0..1 for every mode over a grid of colours", () => {
    const vals = [0, 0.25, 0.5, 0.75, 1];
    for (const mode of BLEND_MODES)
      for (const a of vals)
        for (const b of vals) {
          const out = blend(mode, [a, b, 1 - a], [b, a, 0.5]);
          for (const v of out) {
            expect(v).toBeGreaterThanOrEqual(-1e-9);
            expect(v).toBeLessThanOrEqual(1 + 1e-9);
          }
        }
  });
});

describe("HSL", () => {
  it("round-trips through rgb", () => {
    for (const c of [
      [0.2, 0.5, 0.8],
      [1, 0, 0],
      [0.5, 0.5, 0.5],
      [0.9, 0.85, 0.1],
    ] as Rgb[])
      close(hslToRgb(rgbToHsl(c)), c);
  });

  it("turns hue and pushes saturation and lightness to their ends", () => {
    close(adjustHsl([1, 0, 0], 120, 0, 0), [0, 1, 0]);
    close(adjustHsl([0.2, 0.5, 0.8], 0, -1, 0), [0.5, 0.5, 0.5]);
    close(adjustHsl([0.2, 0.5, 0.8], 0, 0, 1), [1, 1, 1]);
    close(adjustHsl([0.2, 0.5, 0.8], 0, 0, -1), [0, 0, 0]);
  });

  it("leaves greys grey when saturation is raised, as an image editor does", () => {
    close(adjustHsl([0.5, 0.5, 0.5], 40, 0.8, 0), [0.5, 0.5, 0.5]);
  });

  it("applies layers in order, a tint mixed by its opacity", () => {
    const layers = prepareLayers([
      { kind: "tint", color: "#ff0000", mode: "normal", opacity: 0.5 },
      { kind: "hsl", hue: 0, saturation: -1, lightness: 0 },
    ]);
    // Grey #808080 half-tinted red is (1, 0.25, 0.25) * ..., then desaturated to its lightness.
    const mid = [0.5 + 0.5 * 0.5, 0.5 * 0.5, 0.5 * 0.5] as Rgb;
    const l = (Math.max(...mid) + Math.min(...mid)) / 2;
    close(applyLayers([0.5, 0.5, 0.5], layers), [l, l, l]);
  });
});

describe("texture generators", () => {
  it("are listed once each, with a known colour list and params", () => {
    const ids = TEXTURE_GENERATORS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(7);
    for (const g of TEXTURE_GENERATORS) {
      expect(g.colors.length).toBeGreaterThanOrEqual(2);
      for (const c of g.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("stay in 0..1, are deterministic per seed and vary across the plane, at every parameter extreme", () => {
    for (const g of TEXTURE_GENERATORS) {
      const cases = [defaultParams(g.params)];
      for (const spec of g.params) for (const v of [spec.min, spec.max]) cases.push({ ...defaultParams(g.params), [spec.key]: v });
      for (const params of cases) {
        const a = g.field(params, 1234);
        const b = g.field(params, 1234);
        let lo = 1;
        let hi = 0;
        for (let i = 0; i < 400; i++) {
          const u = ((i * 37) % 101) * 1.7 - 80;
          const v = ((i * 53) % 97) * 1.3 - 60;
          const x = a(u, v);
          expect(Number.isFinite(x), `${g.id} ${JSON.stringify(params)}`).toBe(true);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(1);
          expect(b(u, v)).toBe(x);
          lo = Math.min(lo, x);
          hi = Math.max(hi, x);
        }
        // Defaults must give a visible pattern, not a flat colour.
        if (params === cases[0]) expect(hi - lo, g.id).toBeGreaterThan(0.2);
      }
    }
  });

  it("give a different pattern for a different seed", () => {
    for (const g of TEXTURE_GENERATORS) {
      if (g.id === "stripes") continue; // Unwobbled stripes are the same for every seed, by design.
      const p = defaultParams(g.params);
      const a = g.field(p, 1);
      const b = g.field(p, 2);
      let diff = 0;
      for (let i = 0; i < 50; i++) diff += Math.abs(a(i * 3.1, i * 1.7) - b(i * 3.1, i * 1.7));
      expect(diff, g.id).toBeGreaterThan(0.5);
    }
  });
});

describe("texture sampling", () => {
  it("ramps evenly through the colour stops", () => {
    const r = ramp(["#000000", "#ffffff", "#ff0000"]);
    close(r(0), [0, 0, 0]);
    close(r(0.25), [0.5, 0.5, 0.5]);
    close(r(0.5), [1, 1, 1]);
    close(r(1), [1, 0, 0]);
    close(r(2), [1, 0, 0]);
  });

  const gen = TEXTURE_GENERATORS[0];
  const generated = { kind: "generated" as const, generatorId: gen.id, params: defaultParams(gen.params), colors: gen.colors, seed: 7 };

  it("shifts, scales and turns a generated texture about the piece's bounds centre", () => {
    const base = textureSampling(generated, IDENTITY, BOUNDS, NO_IMAGES).sample;
    const shifted = textureSampling(generated, { ...IDENTITY, offsetX: 5, offsetY: -3 }, BOUNDS, NO_IMAGES).sample;
    close(shifted(7, 1), base(2, 4));
    const scaled = textureSampling(generated, { ...IDENTITY, scale: 2 }, BOUNDS, NO_IMAGES).sample;
    close(scaled(6, -4), base(3, -2));
    const turned = textureSampling(generated, { ...IDENTITY, rotation: Math.PI / 2 }, BOUNDS, NO_IMAGES).sample;
    // A texture turned 90° shows at (0, 3) what was at (3, 0).
    close(turned(0, 3), base(3, 0));
  });

  it("covers the bounds with an image at scale 1, centred and wrapping beyond", () => {
    // 4 x 4 pixels: left half black, right half white.
    const img: RgbaImage = createImage(4, 4);
    for (let i = 0; i < 16; i++) img.data.set(i % 4 < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255], i * 4);
    const tex = { kind: "image" as const, assetId: "a" };
    const s = textureSampling(tex, IDENTITY, BOUNDS, (k) => (k === "a" ? img : undefined));
    expect(s.kind).toBe("image");
    // The 40 x 20 mm bounds: 4 px across 40 mm is 0.1 px/mm (cover takes the smaller ratio), so 10 mm per pixel.
    close(s.sample(-15, 0), [0, 0, 0]);
    close(s.sample(15, 0), [1, 1, 1]);
  });

  it("composites a transparent image over white and stands in while it is decoding", () => {
    const img = createImage(1, 1); // fully transparent
    const tex = { kind: "pdf" as const, assetId: "doc", page: 3 };
    expect(textureImageKey(tex)).toBe("doc#3");
    close(textureSampling(tex, IDENTITY, BOUNDS, () => img).sample(0, 0), [1, 1, 1]);
    expect(textureSampling(tex, IDENTITY, BOUNDS, NO_IMAGES)).toMatchObject({ kind: "flat", pending: true });
    // A file that could not be decoded is drawn in the fallback colour and no longer waited for.
    expect(textureSampling(tex, IDENTITY, BOUNDS, () => "failed")).toMatchObject({ kind: "flat", pending: false });
  });
});

describe("renderPiece with textures", () => {
  const square = (patch: Partial<Piece>): Piece => ({ ...defaultPiece(0), ...patch });

  it("draws a generated texture with its colour layers applied, inside the outline only", () => {
    const gen = TEXTURE_GENERATORS.find((g) => g.id === "stripes")!;
    const piece = square({
      texture: {
        kind: "generated",
        generatorId: "stripes",
        params: { ...defaultParams(gen.params), size: 10, softness: 0 },
        colors: ["#000000", "#ffffff"],
        seed: 1,
      },
    });
    const s = renderPiece(piece, pieceOutline(piece), 2, NO_IMAGES);
    const shades = new Set<number>();
    for (let i = 0; i < s.image.data.length; i += 4) if (s.image.data[i + 3] === 255) shades.add(s.image.data[i]);
    expect(shades.has(0) && shades.has(255)).toBe(true);
    expect(s.image.data[3]).toBe(0);
    expect(s.pending).toBe(false);

    const inverted = renderPiece(
      { ...piece, colors: [{ kind: "tint", color: "#ffffff", mode: "difference", opacity: 1 }] },
      pieceOutline(piece),
      2,
      NO_IMAGES
    );
    for (let i = 0; i < s.image.data.length; i += 4)
      if (s.image.data[i + 3] === 255) expect(inverted.image.data[i]).toBe(255 - s.image.data[i]);
  });

  it("marks a sprite pending while its image is not decoded", () => {
    const piece = square({ texture: { kind: "image", assetId: "x" } });
    expect(renderPiece(piece, pieceOutline(piece), 1, NO_IMAGES).pending).toBe(true);
    expect(renderPiece(piece, pieceOutline(piece), 1, () => createImage(2, 2)).pending).toBe(false);
  });

  it("renders a 60 mm image piece with a tint and a hue shift at 8 px/mm quickly enough to drag sliders", () => {
    const img = createImage(256, 256);
    for (let i = 0; i < img.data.length; i += 4) img.data.set([(i / 4) % 256, (i / 1024) % 256, 128, 255], i);
    const piece = square({
      shape: { kind: "predefined", shapeId: "rectangle", params: { width: 60, height: 60, radius: 0 } },
      texture: { kind: "image", assetId: "photo" },
      colors: [
        { kind: "tint", color: "#c08040", mode: "overlay", opacity: 0.6 },
        { kind: "hsl", hue: 20, saturation: 0.2, lightness: 0 },
      ],
    });
    const t0 = performance.now();
    renderPiece(piece, pieceOutline(piece), 8, () => img);
    const ms = performance.now() - t0;
    console.log(`image + 2 layers 480x480 px render: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(2000);
  });

  it("renders a 60 mm textured piece at 8 px/mm quickly enough to drag sliders", () => {
    const gen = TEXTURE_GENERATORS.find((g) => g.id === "paper")!;
    const piece = square({
      shape: { kind: "predefined", shapeId: "rectangle", params: { width: 60, height: 60, radius: 0 } },
      texture: { kind: "generated", generatorId: gen.id, params: defaultParams(gen.params), colors: gen.colors, seed: 3 },
      colors: [{ kind: "hsl", hue: 20, saturation: 0.2, lightness: 0 }],
    });
    const t0 = performance.now();
    renderPiece(piece, pieceOutline(piece), 8, NO_IMAGES);
    const ms = performance.now() - t0;
    console.log(`paper 480x480 px render: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(2000);
  });
});
