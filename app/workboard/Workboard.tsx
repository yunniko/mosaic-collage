"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { store, useAppState } from "../state/store";
import { selectionActions } from "./actions";
import { BoardPanel } from "./BoardPanel";
import { Tray } from "./Tray";
import { WorkboardCanvas } from "./WorkboardCanvas";

/** Rotation step for the R key: 15°, or 1° with Shift. */
const KEY_ROTATE = (15 * Math.PI) / 180;

/** Where pieces are laid: the tray of pieces, the table with the artwork, and the board rules. */
export function Workboard() {
  const t = useTranslations();
  const empty = useAppState((s) => s.history.present.placements.length === 0);

  useEffect(() => {
    const act = selectionActions(t);
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === "Delete" || k === "Backspace") act.remove();
      else if (k === "l" || k === "L") act.toggleLock();
      else if (k === "Escape") store.set({ selectedPlacementIds: [] });
      else if (k === "]") act.reorder(e.shiftKey ? "front" : "forward");
      else if (k === "[") act.reorder(e.shiftKey ? "back" : "backward");
      else if (k === "r" || k === "R") act.rotate(e.shiftKey ? -KEY_ROTATE : KEY_ROTATE);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [t]);

  return (
    <>
      <Tray />
      <div
        className="board-frame relative order-first min-h-[60dvh] min-w-0 shrink-0 md:order-none md:min-h-0 md:shrink md:flex-1"
        data-testid="workboard"
      >
        <WorkboardCanvas />
        {empty ? (
          <p className="pointer-events-none absolute inset-x-0 top-4 mx-auto w-fit max-w-md rounded-md bg-paper/90 px-3 py-1.5 text-center text-sm text-ink-soft shadow">
            {t("workboard.emptyBoard")}
          </p>
        ) : null}
      </div>
      <BoardPanel />
    </>
  );
}
