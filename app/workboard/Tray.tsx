"use client";

import { useTranslations } from "next-intl";
import { placementCount } from "@/lib/document/ops";
import { CLICK_SLOP } from "../components/canvas-hooks";
import { PieceThumb } from "../components/PieceThumb";
import { useDoc } from "../state/store";
import { incoming } from "./incoming";

/** The pieces made on the cutboard. Drag one onto the board, or click it to place it in the middle of the view. */
export function Tray() {
  const t = useTranslations("workboard");
  const tl = useTranslations("library");
  const doc = useDoc();

  const press = (pieceId: string, e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    let dragging = false;
    const report = (ev: PointerEvent, phase: "move" | "drop") =>
      incoming.emit({ phase, pieceId, clientX: ev.clientX, clientY: ev.clientY });
    const move = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > CLICK_SLOP) dragging = true;
      if (dragging) report(ev, "move");
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (ev.type === "pointercancel") incoming.emit({ phase: "cancel", pieceId });
      else if (dragging) report(ev, "drop");
      else incoming.emit({ phase: "click", pieceId });
    };
    // A touch press on the tray would otherwise stay captured by the tray item; release it so moves reach the window.
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  return (
    <aside className="panel flex w-44 shrink-0 flex-col gap-2 p-3" aria-label={t("tray")}>
      <h2 className="text-sm font-semibold">{t("tray")}</h2>
      <p className="text-xs text-ink-soft">{doc.pieces.length ? t("trayHint") : t("trayEmpty")}</p>
      <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1" data-testid="tray">
        {doc.pieces.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="flex w-full touch-none items-center gap-2 rounded-md border border-transparent p-1 text-left select-none hover:border-paper-edge"
              onPointerDown={(e) => press(p.id, e)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  incoming.emit({ phase: "click", pieceId: p.id });
                }
              }}
              data-testid="tray-item"
              data-piece-id={p.id}
            >
              <PieceThumb piece={p} size={40} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm">{p.name}</span>
                <span className="text-xs text-ink-soft">{tl("placedCount", { count: placementCount(doc, p.id) })}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
