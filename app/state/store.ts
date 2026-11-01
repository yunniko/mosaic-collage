"use client";

import { useSyncExternalStore } from "react";
import { createDocument } from "@/lib/document/defaults";
import { type History, commit, createHistory, redo, replacePresent, undo } from "@/lib/document/history";
import type { AssetStore, MosaicDocument } from "@/lib/document/types";

export type View = "cutboard" | "workboard";

export interface Notice {
  id: number;
  kind: "info" | "error";
  text: string;
}

export interface AppState {
  history: History<MosaicDocument>;
  /** Uploaded asset bytes. Replaced (never mutated) when assets are added, so subscribers see the change. */
  assets: AssetStore;
  view: View;
  selectedPieceId: string | null;
  selectedPlacementIds: string[];
  /** The piece being hand-cut on the cutboard; cut mode is on only while that piece is still the selected one. */
  cuttingPieceId: string | null;
  notices: Notice[];
  /** Bumped by "fit to view" so the boards re-frame their content. */
  fitRequest: number;
}

type Listener = () => void;

/** The app's single store: the document's undo history plus the view state around it. */
class Store {
  private state: AppState = {
    history: createHistory(createDocument()),
    assets: new Map(),
    view: "cutboard",
    selectedPieceId: null,
    selectedPlacementIds: [],
    cuttingPieceId: null,
    notices: [],
    fitRequest: 0,
  };
  private listeners = new Set<Listener>();
  private noticeId = 0;

  getState = () => this.state;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  set(patch: Partial<AppState>) {
    if ((Object.keys(patch) as (keyof AppState)[]).every((k) => this.state[k] === patch[k])) return;
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  get doc() {
    return this.state.history.present;
  }

  /** Applies a document change as one undo step. A refused change (it throws) is reported and leaves the document alone. */
  apply(change: (doc: MosaicDocument) => MosaicDocument, onError?: (e: unknown) => void): boolean {
    this.lastKey = "";
    return this.run(change, commit, onError);
  }

  private lastKey = "";
  private lastTime = 0;

  /**
   * Like `apply`, but consecutive changes with the same `key` within a moment fold into one undo step, so dragging a
   * slider is one step rather than hundreds. Any other history change in between starts a new step.
   */
  applyCoalesced(key: string, change: (doc: MosaicDocument) => MosaicDocument, onError?: (e: unknown) => void): boolean {
    const now = performance.now();
    const fold = key === this.lastKey && now - this.lastTime < 1000 && this.state.history.past.length > 0;
    const ok = this.run(change, fold ? replacePresent : commit, onError);
    this.lastKey = ok ? key : "";
    this.lastTime = now;
    return ok;
  }

  private run(
    change: (doc: MosaicDocument) => MosaicDocument,
    record: (h: History<MosaicDocument>, doc: MosaicDocument) => History<MosaicDocument>,
    onError?: (e: unknown) => void
  ): boolean {
    try {
      this.set({ history: record(this.state.history, change(this.doc)) });
      return true;
    } catch (e) {
      if (onError) onError(e);
      else throw e;
      return false;
    }
  }

  undo() {
    this.lastKey = "";
    this.set({ history: undo(this.state.history), selectedPlacementIds: [] });
  }

  redo() {
    this.lastKey = "";
    this.set({ history: redo(this.state.history), selectedPlacementIds: [] });
  }

  /** Starts over with a new document (a loaded file or "New"): history and selection are cleared. */
  replaceDocument(doc: MosaicDocument, assets: AssetStore) {
    this.lastKey = "";
    this.set({
      history: createHistory(doc),
      assets,
      selectedPieceId: doc.pieces[0]?.id ?? null,
      selectedPlacementIds: [],
      cuttingPieceId: null,
      fitRequest: this.state.fitRequest + 1,
    });
  }

  addAssetBytes(id: string, bytes: Uint8Array) {
    const assets = new Map(this.state.assets);
    assets.set(id, bytes);
    this.set({ assets });
  }

  notify(kind: Notice["kind"], text: string) {
    const notice = { id: ++this.noticeId, kind, text };
    this.set({ notices: [...this.state.notices, notice].slice(-4) });
    setTimeout(() => this.dismiss(notice.id), kind === "error" ? 7000 : 4000);
  }

  dismiss(id: number) {
    this.set({ notices: this.state.notices.filter((n) => n.id !== id) });
  }
}

export const store = new Store();

export function useAppState<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.getState()),
    () => select(store.getState())
  );
}

export const useDoc = () => useAppState((s) => s.history.present);
