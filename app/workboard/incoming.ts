"use client";

/**
 * A piece being dragged from the tray to the board. The tray owns the pointer (it was pressed there), so it reports
 * what the pointer does here and the board turns it into a drag once the pointer is over it. The wheel needs no relay:
 * it only matters over the board, whose own wheel handler turns any piece in hand.
 */
export type IncomingEvent =
  | { phase: "move" | "drop"; pieceId: string; clientX: number; clientY: number }
  /** The press ended without a drop (the browser took the pointer). */
  | { phase: "cancel"; pieceId: string }
  /** A click or Enter on the tray item: place the piece in the middle of the view. */
  | { phase: "click"; pieceId: string };

type Listener = (e: IncomingEvent) => void;

const listeners = new Set<Listener>();

export const incoming = {
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  emit(e: IncomingEvent) {
    for (const l of listeners) l(e);
  },
};
