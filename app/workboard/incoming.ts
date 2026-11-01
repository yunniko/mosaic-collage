"use client";

/**
 * A piece being dragged from the tray to the board. The tray owns the pointer (it was pressed there), so it reports
 * the pointer's position here and the board turns it into a drag once the pointer is over it.
 */
export interface IncomingPiece {
  pieceId: string;
  clientX: number;
  clientY: number;
  /** Wheel delta, for the "wheel" phase. */
  wheel: number;
}

export type IncomingPhase = "move" | "wheel" | "drop" | "click";
type Listener = (inc: IncomingPiece | null, phase: IncomingPhase) => void;

const listeners = new Set<Listener>();

export const incoming = {
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  emit(inc: IncomingPiece, phase: IncomingPhase) {
    for (const l of listeners) l(inc, phase);
  },
};
