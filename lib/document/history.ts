/**
 * Undo/redo over immutable snapshots. Documents share unchanged pieces structurally, so a snapshot costs only what
 * changed. Asset bytes are not in the document and so are never duplicated here.
 */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const HISTORY_LIMIT = 200;

export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });

export function commit<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h;
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, present: next, future: [] };
}

/** Replaces the present without an undo step: used while a drag is in progress, then `commit` once at the end. */
export const replacePresent = <T>(h: History<T>, next: T): History<T> => ({ ...h, present: next });

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
