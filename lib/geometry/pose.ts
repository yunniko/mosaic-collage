import type { Polygon } from "./polygon";
import { rotateAbout, type Vec } from "./vec";

/**
 * Where a placed piece sits: its local origin (the outline's centroid) at (x, y), turned by `rotation` radians.
 * On screen y points down, so a positive rotation turns clockwise.
 */
export interface Pose {
  x: number;
  y: number;
  rotation: number;
}

export function localToWorld(p: Vec, pose: Pose): Vec {
  const c = Math.cos(pose.rotation);
  const s = Math.sin(pose.rotation);
  return { x: pose.x + p.x * c - p.y * s, y: pose.y + p.x * s + p.y * c };
}

export function worldToLocal(p: Vec, pose: Pose): Vec {
  const c = Math.cos(pose.rotation);
  const s = Math.sin(pose.rotation);
  const dx = p.x - pose.x;
  const dy = p.y - pose.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}

export function transformPolygon(poly: readonly Vec[], pose: Pose): Polygon {
  return poly.map((p) => localToWorld(p, pose));
}

/**
 * The pose reached by turning `pose` by `delta` about the world point `pivot`. The pivot stays where it is:
 * this is how a piece turns about its grab point or about a contact point.
 */
export function rotatePoseAbout(pose: Pose, pivot: Vec, delta: number): Pose {
  return { ...rotateAbout(pose, pivot, delta), rotation: pose.rotation + delta };
}

/** The pose that puts the local point `local` at the world point `target`, keeping `rotation`. */
export function poseWithLocalAt(local: Vec, target: Vec, rotation: number): Pose {
  const at = localToWorld(local, { x: 0, y: 0, rotation });
  return { x: target.x - at.x, y: target.y - at.y, rotation };
}
