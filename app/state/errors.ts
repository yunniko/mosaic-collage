"use client";

import { DocumentError } from "@/lib/document/ops";
import { InvalidDocumentError } from "@/lib/document/validate";
import { OutlineError } from "@/lib/shapes/repair";

type T = (key: string, values?: Record<string, string | number>) => string;

/** The sentence a user sees for a refused or failed action. */
export function errorText(t: T, e: unknown): string {
  if (e instanceof DocumentError) return t(`errors.${e.code}`);
  if (e instanceof OutlineError) return t(`errors.outline-${e.problem}`);
  if (e instanceof InvalidDocumentError) return e.message;
  return t("errors.unknown", { message: e instanceof Error ? e.message : String(e) });
}
