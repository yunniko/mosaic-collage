import { describe, expect, it } from "vitest";
import { Noise2D } from "@/lib/textures/noise";

describe("noise", () => {
  const n = new Noise2D(7);

  it("repeats with a separate period on each axis", () => {
    for (const [x, y] of [
      [0.3, 0.7],
      [1.9, 5.2],
      [0.05, 7.99],
    ]) {
      expect(n.fbm(x, y, 4, 0.5, 2, 8)).toBeCloseTo(n.fbm(x + 2, y, 4, 0.5, 2, 8), 9);
      expect(n.fbm(x, y, 4, 0.5, 2, 8)).toBeCloseTo(n.fbm(x, y + 8, 4, 0.5, 2, 8), 9);
    }
  });

  it("refuses a period the lattice can't repeat", () => {
    expect(() => n.sample(0.5, 0.5, 300)).toThrow(RangeError);
    expect(() => n.fbm(0.5, 0.5, 3, 0.5, 32, 96)).toThrow(RangeError);
  });
});
