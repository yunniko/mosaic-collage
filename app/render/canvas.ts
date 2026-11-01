"use client";

/** A detached canvas of `width` x `height` pixels and its 2D context. */
export function createCanvas2d(width: number, height: number, options?: CanvasRenderingContext2DSettings) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext("2d", options)! };
}
