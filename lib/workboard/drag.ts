import type { Polygon } from "../geometry/polygon";
import { type Pose, localToWorld, poseWithLocalAt, rotatePoseAbout } from "../geometry/pose";
import type { Vec } from "../geometry/vec";

/** A piece being dragged: its outline, the local point the pointer holds it by, and where it is now. */
export interface DragState {
  outline: Polygon;
  /** The grabbed point in the piece's local frame. Rotation while dragging turns about it. */
  grabLocal: Vec;
  pose: Pose;
}

export function startDrag(outline: Polygon, pose: Pose, grabLocal: Vec): DragState {
  return { outline, grabLocal, pose: { ...pose } };
}

/** The grab point in board coordinates. */
export const grabWorld = (s: DragState): Vec => localToWorld(s.grabLocal, s.pose);

/** Free movement: the grab point follows the pointer. */
export function dragTo(s: DragState, pointer: Vec): DragState {
  return { ...s, pose: poseWithLocalAt(s.grabLocal, pointer, s.pose.rotation) };
}

/** Turns the piece by `delta` radians about the grab point. */
export function rotateDrag(s: DragState, delta: number): DragState {
  return { ...s, pose: rotatePoseAbout(s.pose, grabWorld(s), delta) };
}
