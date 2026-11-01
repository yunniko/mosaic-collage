"use client";

import { CutboardCanvas } from "./CutboardCanvas";
import { PieceEditor } from "./PieceEditor";
import { PieceLibrary } from "./PieceLibrary";

/** Where pieces are made: the library, the piece on a cutting mat, and its settings. */
export function Cutboard() {
  return (
    <>
      <PieceLibrary />
      <div
        className="board-frame relative order-first min-h-[60dvh] min-w-0 shrink-0 md:order-none md:min-h-0 md:shrink md:flex-1"
        data-testid="cutboard"
      >
        <CutboardCanvas />
      </div>
      <PieceEditor />
    </>
  );
}
