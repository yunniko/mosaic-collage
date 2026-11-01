"use client";

import { useEffect } from "react";
import { Cutboard } from "../cutboard/Cutboard";
import { Workboard } from "../workboard/Workboard";
import { store, useAppState } from "../state/store";
import { Notices } from "./Notices";
import { TopBar } from "./TopBar";

export default function Studio() {
  const view = useAppState((s) => s.view);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.redo();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        document.querySelector<HTMLButtonElement>('[data-testid="file-save"]')?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <TopBar />
      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 md:flex-row md:overflow-visible">
        {view === "cutboard" ? <Cutboard /> : <Workboard />}
      </main>
      <Notices />
    </div>
  );
}
