"use client";

import { store, useAppState } from "../state/store";

export function Notices() {
  const notices = useAppState((s) => s.notices);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex max-w-sm flex-col gap-2" role="status" aria-live="polite">
      {notices.map((n) => (
        <button
          type="button"
          key={n.id}
          onClick={() => store.dismiss(n.id)}
          className={`panel pointer-events-auto px-3 py-2 text-left text-sm ${n.kind === "error" ? "border-danger text-danger" : ""}`}
          data-testid={`notice-${n.kind}`}
        >
          {n.text}
        </button>
      ))}
    </div>
  );
}
