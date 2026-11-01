"use client";

import { useTranslations } from "next-intl";
import { createDocument } from "@/lib/document/defaults";
import { FILE_EXTENSION, FILE_MIME, loadMosaicFile, saveMosaicFile } from "@/lib/document/file";
import { errorText } from "../state/errors";
import { type View, store, useAppState } from "../state/store";
import { downloadBytes, pickFile, safeFileName } from "./file-io";

export function TopBar() {
  const t = useTranslations();
  const view = useAppState((s) => s.view);
  const name = useAppState((s) => s.history.present.name);
  const canUndo = useAppState((s) => s.history.past.length > 0);
  const canRedo = useAppState((s) => s.history.future.length > 0);

  const save = async () => {
    const s = store.getState();
    const bytes = await saveMosaicFile(s.history.present, s.assets);
    const fileName = safeFileName(s.history.present.name, FILE_EXTENSION);
    downloadBytes(bytes, fileName, FILE_MIME);
    store.notify("info", t("file.saved", { name: fileName }));
  };

  const open = async () => {
    const file = await pickFile(`${FILE_EXTENSION},application/zip`);
    if (!file) return;
    try {
      const { doc, store: assets, warnings } = await loadMosaicFile(new Uint8Array(await file.arrayBuffer()));
      store.replaceDocument(doc, assets);
      store.notify("info", t("file.opened", { name: file.name }));
      for (const w of warnings) store.notify("error", w);
    } catch (e) {
      store.notify("error", t("file.openFailed", { reason: errorText(t, e) }));
    }
  };

  const fresh = () => {
    if (store.doc.pieces.length && !window.confirm(t("file.confirmNew"))) return;
    store.replaceDocument(createDocument(), new Map());
    store.set({ view: "cutboard" });
  };

  const tab = (v: View) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === v}
      className={`rounded-md px-4 py-1.5 text-sm font-medium ${view === v ? "bg-accent text-white" : "text-ink hover:bg-accent-soft"}`}
      onClick={() => store.set({ view: v })}
      data-testid={`tab-${v}`}
    >
      {t(`nav.${v}`)}
    </button>
  );

  return (
    <header className="panel mx-3 mt-3 flex flex-wrap items-center gap-3 px-3 py-2">
      <span className="font-semibold tracking-tight">{t("app.title")}</span>
      <input
        aria-label={t("file.documentName")}
        className="w-48 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm hover:border-paper-edge focus:border-accent"
        value={name}
        onChange={(e) => store.apply((d) => ({ ...d, name: e.target.value.slice(0, 200) }))}
        data-testid="doc-name"
      />
      <nav role="tablist" className="flex gap-1 rounded-lg bg-white/60 p-0.5">
        {tab("cutboard")}
        {tab("workboard")}
      </nav>
      <div className="ml-auto flex flex-wrap gap-1.5">
        <button type="button" className="btn" onClick={() => store.undo()} disabled={!canUndo} title="Ctrl+Z" data-testid="undo">
          {t("file.undo")}
        </button>
        <button type="button" className="btn" onClick={() => store.redo()} disabled={!canRedo} title="Ctrl+Shift+Z" data-testid="redo">
          {t("file.redo")}
        </button>
        <button type="button" className="btn" onClick={fresh} data-testid="file-new">
          {t("file.new")}
        </button>
        <button type="button" className="btn" onClick={open} data-testid="file-open">
          {t("file.open")}
        </button>
        <button type="button" className="btn btn-primary" onClick={save} title="Ctrl+S" data-testid="file-save">
          {t("file.save")}
        </button>
      </div>
    </header>
  );
}
