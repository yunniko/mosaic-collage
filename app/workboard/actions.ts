"use client";

import { getPlacement, movePlacement, removePlacements, reorderPlacements, setLocked, type ZMove } from "@/lib/document/ops";
import { errorText } from "../state/errors";
import { store } from "../state/store";

type T = Parameters<typeof errorText>[0];

/** Selection actions shared by the board panel's buttons and the workboard's keys, so both behave the same. */
export function selectionActions(t: T) {
  const onError = (e: unknown) => store.notify("error", errorText(t, e));
  const ids = () => store.getState().selectedPlacementIds;
  return {
    setLocked(locked: boolean) {
      if (ids().length) store.apply((d) => setLocked(d, ids(), locked), onError);
    },
    toggleLock() {
      const sel = ids();
      if (!sel.length) return;
      const allLocked = sel.every((id) => store.doc.placements.find((p) => p.id === id)?.locked);
      store.apply((d) => setLocked(d, sel, !allLocked), onError);
    },
    remove() {
      if (!ids().length) return;
      if (store.apply((d) => removePlacements(d, ids()), onError)) store.set({ selectedPlacementIds: [] });
    },
    reorder(move: ZMove) {
      if (ids().length) store.apply((d) => reorderPlacements(d, ids(), move), onError);
    },
    /** Turns each selected piece about its own centre. */
    rotate(delta: number) {
      const sel = ids();
      if (!sel.length) return;
      store.apply(
        (d) =>
          sel.reduce((acc, id) => {
            const pose = getPlacement(acc, id).pose;
            return movePlacement(acc, id, { ...pose, rotation: pose.rotation + delta });
          }, d),
        onError
      );
    },
  };
}
