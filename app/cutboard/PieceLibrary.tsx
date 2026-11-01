"use client";

import { useTranslations } from "next-intl";
import { defaultPiece } from "@/lib/document/defaults";
import { addPiece, deletePiece, duplicatePiece, placementCount } from "@/lib/document/ops";
import { PieceThumb } from "../components/PieceThumb";
import { store, useAppState, useDoc } from "../state/store";

export function PieceLibrary() {
  const t = useTranslations("library");
  const doc = useDoc();
  const selected = useAppState((s) => s.selectedPieceId);

  const create = () => {
    const piece = defaultPiece(doc.pieces.length);
    store.apply((d) => addPiece(d, piece));
    store.set({ selectedPieceId: piece.id });
  };

  const duplicate = () => {
    if (!selected) return;
    const src = doc.pieces.find((p) => p.id === selected);
    if (!src) return;
    let newId = "";
    store.apply((d) => {
      const r = duplicatePiece(d, selected, t("copyName", { name: src.name }));
      newId = r.id;
      return r.doc;
    });
    store.set({ selectedPieceId: newId });
  };

  const remove = () => {
    if (!selected) return;
    const src = doc.pieces.find((p) => p.id === selected);
    if (!src) return;
    const count = placementCount(doc, selected);
    if (count > 0 && !window.confirm(t("confirmDelete", { name: src.name, count }))) return;
    const i = doc.pieces.indexOf(src);
    store.apply((d) => deletePiece(d, selected));
    const rest = store.doc.pieces;
    store.set({ selectedPieceId: rest[Math.min(i, rest.length - 1)]?.id ?? null, selectedPlacementIds: [] });
  };

  return (
    <aside className="panel flex w-full shrink-0 md:w-56 flex-col gap-2 p-3" aria-label={t("title")}>
      <h2 className="text-sm font-semibold">{t("title")}</h2>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className="btn btn-primary" onClick={create} data-testid="new-piece">
          {t("newPiece")}
        </button>
        <button type="button" className="btn" onClick={duplicate} disabled={!selected} data-testid="duplicate-piece">
          {t("duplicate")}
        </button>
        <button type="button" className="btn btn-danger" onClick={remove} disabled={!selected} data-testid="delete-piece">
          {t("delete")}
        </button>
      </div>
      <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1" data-testid="piece-list">
        {doc.pieces.length === 0 ? <li className="text-sm text-ink-soft">{t("empty")}</li> : null}
        {doc.pieces.map((p) => {
          const count = placementCount(doc, p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => store.set({ selectedPieceId: p.id })}
                className={`flex w-full items-center gap-2 rounded-md border p-1 text-left ${p.id === selected ? "border-accent bg-accent-soft" : "border-transparent hover:border-paper-edge"}`}
                aria-pressed={p.id === selected}
                data-testid="piece-item"
                data-piece-id={p.id}
              >
                <PieceThumb piece={p} size={44} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{p.name}</span>
                  <span className="text-xs text-ink-soft">{t("placedCount", { count })}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
