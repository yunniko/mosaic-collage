"use client";

import { CutboardCanvas } from "./CutboardCanvas";
import { PieceEditor } from "./PieceEditor";
import { PieceLibrary } from "./PieceLibrary";

/** Where pieces are made: the library, the piece on a cutting mat, and its settings. */
export function Cutboard() {
  return (
    <>
      <PieceLibrary />
      <div className="board-frame relative min-w-0 flex-1" data-testid="cutboard">
        <CutboardCanvas />
      </div>
      <PieceEditor />
    </>
  );
}
