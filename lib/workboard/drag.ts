import type { Polygon } from "../geometry/polygon";
import { type Pose, localToWorld, poseWithLocalAt } from "../geometry/pose";
import type { Vec } from "../geometry/vec";
import { type DragRules, constrainMove, constrainTurn } from "./placement";

/** A piece being dragged: its outline, the local point the pointer holds it by, where it is now, and the board's rules. */
export interface DragState {
  outline: Polygon;
  /** The grabbed point in the piece's local frame. Rotation while dragging turns about it. */
  grabLocal: Vec;
  pose: Pose;
  /** The no-overlap rules, fixed for the drag: the other pieces don't move meanwhile. */
  rules: DragRules;
}

const FREE: DragRules = { obstacles: null, autoRotate: false };

export function startDrag(outline: Polygon, pose: Pose, grabLocal: Vec, rules: DragRules = FREE): DragState {
  return { outline, grabLocal, pose: { ...pose }, rules };
}

/** The grab point in board coordinates. */
export const grabWorld = (s: DragState): Vec => localToWorld(s.grabLocal, s.pose);

/** The grab point follows the pointer, as far as the rules let it (see `constrainMove`). */
export function dragTo(s: DragState, pointer: Vec): DragState {
  const target = poseWithLocalAt(s.grabLocal, pointer, s.pose.rotation);
  return { ...s, pose: constrainMove(s.rules, s.outline, s.pose, target, s.grabLocal, pointer) };
}

/** Turns the piece by `delta` radians about the grab point, stopping at contact when overlap is off. */
export function rotateDrag(s: DragState, delta: number): DragState {
  return { ...s, pose: constrainTurn(s.rules.obstacles, s.outline, s.pose, grabWorld(s), delta) };
}
