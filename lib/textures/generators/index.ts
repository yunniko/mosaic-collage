import { clouds } from "./clouds";
import { granite } from "./granite";
import { marble } from "./marble";
import { paper } from "./paper";
import type { TextureGenerator } from "./registry";
import { stripes } from "./stripes";
import { weave } from "./weave";
import { wood } from "./wood";

/** Every texture generator, in the order the cutboard lists them. Add a new texture here. */
export const TEXTURE_GENERATORS: TextureGenerator[] = [paper, clouds, marble, wood, granite, weave, stripes];

export function findTextureGenerator(id: string): TextureGenerator | undefined {
  return TEXTURE_GENERATORS.find((g) => g.id === id);
}
