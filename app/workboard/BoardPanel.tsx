"use client";

import { useTranslations } from "next-intl";
import { setBoard } from "@/lib/document/ops";
import type { BoardSettings } from "@/lib/document/types";
import { NumberField, Section, Toggle } from "../components/controls";
import { store, useAppState, useDoc } from "../state/store";
import { selectionActions } from "./actions";

/** Board rules (overlap, margin, auto-rotate, shadow) and actions on the selected placed pieces. */
export function BoardPanel() {
  const t = useTranslations("workboard");
  const tAll = useTranslations();
  const doc = useDoc();
  const selected = useAppState((s) => s.selectedPlacementIds);
  const board = doc.board;
  const act = selectionActions(tAll);
  const change = (patch: Partial<BoardSettings>, key: string) => store.applyCoalesced(`board:${key}`, (d) => setBoard(d, patch));
  const chosen = doc.placements.filter((p) => selected.includes(p.id));
  const allLocked = chosen.length > 0 && chosen.every((p) => p.locked);
  const none = chosen.length === 0;

  return (
    <aside className="panel flex w-64 shrink-0 flex-col gap-3 overflow-y-auto p-3" aria-label={t("settings")}>
      <Section title={t("settings")} testId="board-settings">
        <Toggle
          label={t("allowOverlap")}
          checked={board.allowOverlap}
          onChange={(v) => change({ allowOverlap: v }, "overlap")}
          testId="allow-overlap"
        />
        <NumberField
          label={t("margin")}
          value={board.margin}
          min={0}
          max={20}
          step={0.5}
          unit={tAll("units.mm")}
          disabled={board.allowOverlap}
          onChange={(v) => change({ margin: v }, "margin")}
          testId="margin"
        />
        <Toggle
          label={t("autoRotate")}
          checked={board.autoRotate}
          disabled={board.allowOverlap}
          onChange={(v) => change({ autoRotate: v }, "autoRotate")}
          testId="auto-rotate"
        />
        <NumberField
          label={t("shadow")}
          value={board.shadow}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => change({ shadow: v }, "shadow")}
          testId="shadow"
        />
      </Section>
      <Section title={t("selection", { count: chosen.length })} testId="selection-actions">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn" disabled={none} onClick={() => act.setLocked(!allLocked)} data-testid="toggle-lock">
            {allLocked ? t("unlock") : t("lock")}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={none || chosen.some((p) => p.locked)}
            onClick={act.remove}
            data-testid="remove-placement"
          >
            {t("remove")}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(["front", "back", "forward", "backward"] as const).map((m) => (
            <button key={m} type="button" className="btn" disabled={none} onClick={() => act.reorder(m)} data-testid={`z-${m}`}>
              {t(m)}
            </button>
          ))}
        </div>
      </Section>
      <Section title={t("view")}>
        <button
          type="button"
          className="btn"
          onClick={() => store.set({ fitRequest: store.getState().fitRequest + 1 })}
          data-testid="fit-view"
        >
          {t("fit")}
        </button>
        <p className="text-xs text-ink-soft">{t("help")}</p>
        <p className="text-xs text-ink-soft">{t("keys")}</p>
      </Section>
    </aside>
  );
}
