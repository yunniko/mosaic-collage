import { mixSeed } from "../../random";
import { Noise2D } from "../noise";
import { type TextureGenerator, clamp01 } from "./registry";

/** How far from the texture origin the tree's centre lies, mm: far enough that rings read as gently curved bands. */
const TREE_CENTRE = 400;

/** Plain-sawn wood: growth rings around a distant centre, warped, with fine grain along the board. */
export const wood: TextureGenerator = {
  id: "wood",
  label: "wood",
  params: [
    { key: "size", label: "ringSpacing", min: 0.5, max: 30, step: 0.5, default: 4, unit: "mm" },
    { key: "warp", label: "warp", min: 0, max: 100, step: 1, default: 40, unit: "percent" },
    { key: "grain", label: "grain", min: 0, max: 100, step: 1, default: 40, unit: "percent" },
  ],
  colors: ["#8a5a33", "#c4955f", "#ddb682"],
  field(p, seed) {
    const noise = new Noise2D(seed);
    const fine = new Noise2D(mixSeed(seed, 1));
    const warp = (p.warp / 100) * 3;
    const grain = p.grain / 100;
    return (u, v) => {
      // The board runs along x: the centre is far off along y and x is compressed, so rings run along x too.
      const r = Math.hypot(u * 0.15, v + TREE_CENTRE) / p.size + warp * noise.fbm(u / 80, v / 20, 4);
      const ring = (r - Math.floor(r)) ** 2.2;
      const streak = 0.5 + 0.5 * fine.fbm(u / 25, v / 0.35, 3);
      return clamp01(1 - (ring * (1 - grain * 0.5) + streak * grain * 0.5));
    };
  },
};
