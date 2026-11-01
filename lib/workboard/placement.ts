import type { MosaicDocument } from "../document/types";
import { type EdgeIndex, clashes, edgeIndex, nearestApproach } from "../geometry/collision";
import { type Bounds, polygonBounds, type Polygon } from "../geometry/polygon";
import { type Pose, localToWorld, rotatePoseAbout, transformPolygon } from "../geometry/pose";
import { angleBetween, angleDelta, distance, length, type Vec } from "../geometry/vec";
import { placedShape } from "./scene";

/**
 * The no-overlap rules (D009). With overlap off, a piece keeps at least `margin` from every other placed piece:
 * dragged against one it stops at contact and, with auto-rotate on, swings about the contact point toward the pointer;
 * once the spot under the pointer is free again it jumps there. A drop that lands in a conflict moves to the nearest
 * free spot.
 */

/** Extra reach of the edge index beyond the margin, so a piece stopped just short of contact still finds it. */
const CONTACT_SLACK = 0.5;
/** Largest distance any point of the piece moves between two collision samples along a path, mm. */
const SWEEP_STEP = 0.75;
const MAX_SWEEP_SAMPLES = 400;
/** Bisection rounds once a sample hits: the stop lies within SWEEP_STEP / 2^12 of true contact. */
const BISECT_ROUNDS = 12;

export interface Obstacles {
  margin: number;
  items: EdgeIndex[];
}

const indexCache = new WeakMap<object, EdgeIndex>();

/** Every placed piece but `excludeId`, prepared for clearance tests. Null when the board allows overlap. */
export function obstaclesFor(doc: MosaicDocument, excludeId?: string): Obstacles | null {
  if (doc.board.allowOverlap) return null;
  const margin = doc.board.margin;
  const reach = margin + CONTACT_SLACK;
  const items: EdgeIndex[] = [];
  for (const pl of doc.placements) {
    if (pl.id === excludeId) continue;
    const s = placedShape(doc, pl);
    // Indexed per placed outline (cached with it) and rebuilt only if the margin changed.
    let ix = indexCache.get(s);
    if (!ix || ix.reach !== reach) indexCache.set(s, (ix = edgeIndex(s.outline, reach)));
    items.push(ix);
  }
  return { margin, items };
}

interface Posed {
  outline: Polygon;
  bounds: Bounds;
}

function posed(local: Polygon, pose: Pose): Posed {
  const outline = transformPolygon(local, pose);
  return { outline, bounds: polygonBounds(outline) };
}

function firstClash(obs: Obstacles, p: Posed): EdgeIndex | null {
  for (const ix of obs.items) if (clashes(p.outline, p.bounds, ix, obs.margin)) return ix;
  return null;
}

/** True when the outline at `pose` keeps the margin from every obstacle. */
export function isFree(obs: Obstacles | null, local: Polygon, pose: Pose): boolean {
  return !obs || !firstClash(obs, posed(local, pose));
}

/** The largest distance from the outline's origin to any of its points: how far a turn can swing it. */
function radius(local: Polygon): number {
  let r = 0;
  for (const p of local) r = Math.max(r, length(p));
  return r;
}

const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  rotation: a.rotation + (b.rotation - a.rotation) * t,
});

/**
 * Moves from the free pose `from` toward `to` along `path` (t from 0 to 1), stopping just short of the first contact.
 * Returns the last free pose and the obstacle that stopped it, if any.
 */
function sweep(
  obs: Obstacles,
  local: Polygon,
  from: Pose,
  to: Pose,
  path: (t: number) => Pose = (t) => lerpPose(from, to, t)
): { pose: Pose; blocker: EdgeIndex | null } {
  const travel = distance(from, to) + Math.abs(to.rotation - from.rotation) * radius(local);
  const samples = Math.min(MAX_SWEEP_SAMPLES, Math.max(1, Math.ceil(travel / SWEEP_STEP)));
  let free = 0;
  for (let k = 1; k <= samples; k++) {
    const t = k / samples;
    const blocker = firstClash(obs, posed(local, path(t)));
    if (!blocker) {
      free = t;
      continue;
    }
    let hit = t;
    let stopper = blocker;
    for (let r = 0; r < BISECT_ROUNDS; r++) {
      const mid = (free + hit) / 2;
      const b = firstClash(obs, posed(local, path(mid)));
      if (b) {
        hit = mid;
        stopper = b;
      } else free = mid;
    }
    return { pose: path(free), blocker: stopper };
  }
  return { pose: path(1), blocker: null };
}

export interface DragRules {
  obstacles: Obstacles | null;
  autoRotate: boolean;
}

/**
 * The pose a dragged piece takes when the pointer asks for `target`, given where it is now (`current`) and the point
 * it is held by (`grabLocal`). Without obstacles, or while the piece already sits in a conflict (overlap was switched
 * off with pieces overlapping, or it is coming in from the tray), it simply follows.
 */
export function constrainMove(rules: DragRules, local: Polygon, current: Pose, target: Pose, grabLocal: Vec, pointer: Vec): Pose {
  const obs = rules.obstacles;
  if (!obs || isFree(obs, local, target) || !isFree(obs, local, current)) return target;
  const { pose: stopped, blocker } = sweep(obs, local, current, target);
  if (!blocker || !rules.autoRotate) return stopped;
  // Swing about the contact point so the grab point turns toward the pointer, as a card pushed past a corner does.
  const contact = nearestApproach(posed(local, stopped).outline, blocker);
  if (!contact) return stopped;
  const pivot = contact.at;
  const grab = localToWorld(grabLocal, stopped);
  if (distance(pivot, grab) < 1e-6) return stopped;
  const turn = angleDelta(angleBetween(pivot, grab), angleBetween(pivot, pointer));
  if (Math.abs(turn) < 1e-6) return stopped;
  const swung = (t: number) => rotatePoseAbout(stopped, pivot, turn * t);
  return sweep(obs, local, stopped, swung(1), swung).pose;
}

/** A turn of a held or selected piece by `delta` about `pivot`, stopped at the first contact. */
export function constrainTurn(obstacles: Obstacles | null, local: Polygon, current: Pose, pivot: Vec, delta: number): Pose {
  const target = rotatePoseAbout(current, pivot, delta);
  if (!obstacles || !isFree(obstacles, local, current)) return target;
  const turned = (t: number) => rotatePoseAbout(current, pivot, delta * t);
  return sweep(obstacles, local, current, target, turned).pose;
}

/**
 * The free pose nearest `pose` with the same rotation: `pose` itself if it is free, else the first free spot on
 * widening rings around it, else just right of everything on the board.
 */
export function nearestFree(obs: Obstacles | null, local: Polygon, pose: Pose): Pose {
  if (!obs || isFree(obs, local, pose)) return pose;
  const here = posed(local, pose);
  const size = Math.max(here.bounds.maxX - here.bounds.minX, here.bounds.maxY - here.bounds.minY);
  const step = Math.min(Math.max(size / 8, 1, obs.margin / 2), 10);
  const rings = 48;
  for (let r = 1; r <= rings; r++) {
    const dist = r * step;
    const count = Math.max(8, Math.ceil((2 * Math.PI * dist) / step));
    for (let k = 0; k < count; k++) {
      // Start each ring at a different angle so the search has no favoured direction.
      const a = (k / count) * 2 * Math.PI + r;
      const candidate = { ...pose, x: pose.x + Math.cos(a) * dist, y: pose.y + Math.sin(a) * dist };
      if (isFree(obs, local, candidate)) return candidate;
    }
  }
  let maxX = -Infinity;
  for (const ix of obs.items) maxX = Math.max(maxX, ix.bounds.maxX);
  return { ...pose, x: pose.x + (maxX - here.bounds.minX) + obs.margin + 1 };
}
