"use client";

import { useTranslations } from "next-intl";
import { isPiecePlaced, placementCount, renamePiece, updatePiece } from "@/lib/document/ops";
import type { Piece } from "@/lib/document/types";
import { errorText } from "../state/errors";
import { store, useAppState, useDoc } from "../state/store";
import { ShapeSection } from "./sections/ShapeSection";
import { TextureSection } from "./sections/TextureSection";

/** One section of the piece editor. Every section receives the piece and an `onChange` taking the whole next piece. */
/** `coalesceKey` folds repeated edits of one control into one undo step; `null` makes the edit a step of its own. */
export type SectionProps = { piece: Piece; disabled: boolean; onChange: (next: Piece, coalesceKey: string | null) => void };

export function PieceEditor() {
  const t = useTranslations();
  const doc = useDoc();
  const selected = useAppState((s) => s.selectedPieceId);
  const piece = doc.pieces.find((p) => p.id === selected) ?? null;

  if (!piece) {
    return (
      <aside className="panel w-72 shrink-0 p-3 text-sm text-ink-soft" data-testid="piece-editor">
        {t("editor.noPiece")}
      </aside>
    );
  }

  const placed = isPiecePlaced(doc, piece.id);
  const onChange = (next: Piece, key: string | null) => {
    const change = (d: typeof doc) => updatePiece(d, next);
    const onError = (e: unknown) => store.notify("error", errorText(t, e));
    if (key === null) store.apply(change, onError);
    else store.applyCoalesced(`${piece.id}:${key}`, change, onError);
  };

  return (
    <aside
      className="panel flex w-72 shrink-0 flex-col gap-3 overflow-y-auto p-3"
      data-testid="piece-editor"
      aria-label={t("editor.title")}
    >
      <input
        aria-label={t("library.rename")}
        className="rounded border border-paper-edge bg-white px-2 py-1 text-sm font-medium"
        value={piece.name}
        onChange={(e) => store.applyCoalesced(`${piece.id}:name`, (d) => renamePiece(d, piece.id, e.target.value.slice(0, 120)))}
        data-testid="piece-name"
      />
      {placed ? (
        <div className="rounded-md border border-accent bg-accent-soft p-2 text-sm" role="note" data-testid="piece-locked-note">
          <p className="font-medium">{t("editor.lockedTitle")}</p>
          <p className="text-ink-soft">{t("editor.lockedBody")}</p>
          <p className="mt-1 text-xs text-ink-soft">{t("library.placedCount", { count: placementCount(doc, piece.id) })}</p>
        </div>
      ) : null}
      <ShapeSection piece={piece} disabled={placed} onChange={onChange} />
      <TextureSection piece={piece} disabled={placed} onChange={onChange} />
      <button type="button" className="btn mt-auto self-start" onClick={() => store.set({ view: "workboard" })}>
        {t("editor.toWorkboard")}
      </button>
    </aside>
  );
}
