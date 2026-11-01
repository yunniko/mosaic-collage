import { getPiece, getPlacement, movePlacement, placePiece } from "../document/ops";
import type { MosaicDocument } from "../document/types";
import { pieceOutline } from "../shapes/outline";
import { type EdgeIndex, clashes, edgeIndex, nearestApproach } from "../geometry/collision";
import { type Bounds, boundsOverlap, expandBounds, polygonBounds, type Polygon } from "../geometry/polygon";
import { type Pose, localToWorld, rotatePoseAbout, transformPolygon } from "../geometry/pose";
import { angleBetween, angleDelta, distance, length, lerp, type Vec } from "../geometry/vec";
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
/** How close to true contact a sweep stops, mm. */
const CONTACT_PRECISION = 0.005;
/** Rings searched around a crowded drop before giving up and placing it beside everything. */
const FREE_SEARCH_RINGS = 48;

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

const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({ ...lerp(a, b, t), rotation: a.rotation + (b.rotation - a.rotation) * t });

interface Swept {
  pose: Pose;
  blocker: EdgeIndex | null;
}

/** A straight move from the free pose `from` to `to`, stopped just short of the first contact. */
function sweepMove(obs: Obstacles, local: Polygon, from: Pose, to: Pose): Swept {
  // No outline point moves further than the origin does plus the turn times its distance from the origin.
  const travel = distance(from, to) + Math.abs(to.rotation - from.rotation) * radius(local);
  return sweepPath(obs, local, (t) => lerpPose(from, to, t), travel);
}

/** A turn of the free pose `from` by `delta` about `pivot`, stopped just short of the first contact. */
function sweepTurn(obs: Obstacles, local: Polygon, from: Pose, pivot: Vec, delta: number): Swept {
  // Each point moves along an arc about the pivot: the furthest point's arc bounds them all.
  let reach = 0;
  for (const p of posed(local, from).outline) reach = Math.max(reach, distance(p, pivot));
  return sweepPath(obs, local, (t) => rotatePoseAbout(from, pivot, delta * t), Math.abs(delta) * reach);
}

/**
 * Follows `path` (t from 0 to 1, free at 0), stopping just short of the first contact. `travel` bounds how far any
 * outline point moves over the whole path, so samples SWEEP_STEP apart can't step over a margin.
 */
function sweepPath(obs: Obstacles, local: Polygon, path: (t: number) => Pose, travel: number): Swept {
  const samples = Math.min(MAX_SWEEP_SAMPLES, Math.max(1, Math.ceil(travel / SWEEP_STEP)));
  // Halve the hit interval until it spans under CONTACT_PRECISION of travel.
  const rounds = Math.max(1, Math.ceil(Math.log2(travel / samples / CONTACT_PRECISION)));
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
    for (let r = 0; r < rounds; r++) {
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

/** A constrained pose, and whether it keeps the margin (false only while a piece is still in a conflict). */
export interface Moved {
  pose: Pose;
  clear: boolean;
}

/**
 * The pose a dragged piece takes when the pointer asks for `target`, given where it is now (`current`, `clear` if it
 * keeps the margin) and the point it is held by (`grabLocal`). Without obstacles, or while the piece is still in a
 * conflict (overlap was switched off with pieces overlapping, or it is coming in from the tray), it simply follows.
 */
export function constrainMove(rules: DragRules, local: Polygon, current: Moved, target: Pose, grabLocal: Vec, pointer: Vec): Moved {
  const obs = rules.obstacles;
  if (!obs || isFree(obs, local, target)) return { pose: target, clear: true };
  if (!current.clear) return { pose: target, clear: false };
  const { pose: stopped, blocker } = sweepMove(obs, local, current.pose, target);
  if (!blocker || !rules.autoRotate) return { pose: stopped, clear: true };
  // Swing about the contact point so the grab point turns toward the pointer, as a card pushed past a corner does.
  const contact = nearestApproach(posed(local, stopped).outline, blocker);
  const grab = localToWorld(grabLocal, stopped);
  if (!contact || distance(contact.at, grab) < 1e-6) return { pose: stopped, clear: true };
  const pivot = contact.at;
  const turn = angleDelta(angleBetween(pivot, grab), angleBetween(pivot, pointer));
  if (Math.abs(turn) < 1e-6) return { pose: stopped, clear: true };
  return { pose: sweepTurn(obs, local, stopped, pivot, turn).pose, clear: true };
}

/** A turn by `delta` about `pivot`, stopped at the first contact unless the piece is still in a conflict. */
export function constrainTurn(obs: Obstacles | null, local: Polygon, current: Moved, pivot: Vec, delta: number): Moved {
  const target = rotatePoseAbout(current.pose, pivot, delta);
  if (!obs) return { pose: target, clear: true };
  if (!current.clear) return { pose: target, clear: isFree(obs, local, target) };
  return { pose: sweepTurn(obs, local, current.pose, pivot, delta).pose, clear: true };
}

/** Whether `here` shifted by (dx, dy) keeps the margin: obstacle bounds first, the outline only if one is near. */
function freeShifted(obs: Obstacles, here: Posed, dx: number, dy: number): boolean {
  const b = here.bounds;
  const bounds = { minX: b.minX + dx, minY: b.minY + dy, maxX: b.maxX + dx, maxY: b.maxY + dy };
  let outline: Polygon | null = null;
  for (const ix of obs.items) {
    if (!boundsOverlap(expandBounds(bounds, obs.margin), ix.bounds)) continue;
    outline ??= here.outline.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    if (clashes(outline, bounds, ix, obs.margin)) return false;
  }
  return true;
}

/** Bisection rounds pulling a found free spot back toward the drop: within step / 2^8 of the nearest along its ray. */
const PULL_BACK_ROUNDS = 8;

/**
 * The free pose nearest `pose` with the same rotation: `pose` itself if it is free, else the first free spot on
 * widening rings around it, pulled back along its ray toward the drop; else just right of everything on the board.
 */
export function nearestFree(obs: Obstacles | null, local: Polygon, pose: Pose): Pose {
  if (!obs) return pose;
  const here = posed(local, pose);
  if (freeShifted(obs, here, 0, 0)) return pose;
  const size = Math.max(here.bounds.maxX - here.bounds.minX, here.bounds.maxY - here.bounds.minY);
  const step = Math.min(Math.max(size / 8, 1, obs.margin / 2), 10);
  for (let r = 1; r <= FREE_SEARCH_RINGS; r++) {
    const dist = r * step;
    const count = Math.max(8, Math.ceil((2 * Math.PI * dist) / step));
    for (let k = 0; k < count; k++) {
      // Start each ring at a different angle so the search has no favoured direction.
      const a = (k / count) * 2 * Math.PI + r;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      if (!freeShifted(obs, here, ux * dist, uy * dist)) continue;
      let free = dist;
      let blocked = dist - step;
      for (let i = 0; i < PULL_BACK_ROUNDS; i++) {
        const mid = (free + blocked) / 2;
        if (freeShifted(obs, here, ux * mid, uy * mid)) free = mid;
        else blocked = mid;
      }
      return { ...pose, x: pose.x + ux * free, y: pose.y + uy * free };
    }
  }
  let maxX = -Infinity;
  for (const ix of obs.items) maxX = Math.max(maxX, ix.bounds.maxX);
  return { ...pose, x: pose.x + (maxX - here.bounds.minX) + obs.margin + 1 };
}

/*
 * Document operations under the board's rules: every committed move of a placement goes through these, so the
 * no-overlap rule holds whichever control asked for the move. Live drag previews use `constrainMove` directly.
 */

/** Moves a placement to `pose`, or to the nearest free spot when that one would crowd another piece. */
export function moveFree(doc: MosaicDocument, id: string, pose: Pose): MosaicDocument {
  const local = pieceOutline(getPiece(doc, getPlacement(doc, id).pieceId));
  return movePlacement(doc, id, nearestFree(obstaclesFor(doc, id), local, pose));
}

/** Places a piece at `pose`, or at the nearest free spot. */
export function placeFree(doc: MosaicDocument, pieceId: string, pose: Pose, id?: string): { doc: MosaicDocument; id: string } {
  return placePiece(doc, pieceId, nearestFree(obstaclesFor(doc), pieceOutline(getPiece(doc, pieceId)), pose), id);
}

/** Turns a placement by `delta` about its centre, stopping where it meets a neighbour. */
export function turnFree(doc: MosaicDocument, id: string, delta: number): MosaicDocument {
  const pl = getPlacement(doc, id);
  const local = pieceOutline(getPiece(doc, pl.pieceId));
  const obs = obstaclesFor(doc, id);
  const current = { pose: pl.pose, clear: isFree(obs, local, pl.pose) };
  return movePlacement(doc, id, constrainTurn(obs, local, current, pl.pose, delta).pose);
}
