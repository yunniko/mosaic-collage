/**
 * A placed piece's drop shadow for the board's `shadow` setting (0..1): blur and offsets in pixels at `k` = 1, alpha of
 * black. The board draws it at a constant size on screen (`k` = 1, 2 for a lifted piece); an export fixes it to that
 * look at 4 px/mm, an ordinary working zoom, so it scales with the artwork (`k` = px/mm ÷ 4, D015).
 */
export function pieceShadow(shadow: number, k = 1) {
  return { blur: (2 + 8 * shadow) * k, offsetX: (1 + 2 * shadow) * k, offsetY: (1.5 + 3 * shadow) * k, alpha: 0.6 * shadow };
}

/** The px/mm at which an export's shadow matches the board's. */
export const SHADOW_REFERENCE_PX_PER_MM = 4;
