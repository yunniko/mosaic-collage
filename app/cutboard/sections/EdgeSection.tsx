"use client";

import { useTranslations } from "next-intl";
import { MAX_ROUGHNESS, PAPER_KINDS, type PaperKind, type TornEdge } from "@/lib/document/types";
import { randomSeed } from "@/lib/random";
import { ColorField, NumberField, Section, SelectField, Toggle } from "../../components/controls";
import type { SectionProps } from "../PieceEditor";

type NumericKey = "roughness" | "scale" | "grain" | "rimWidth" | "fibres" | "coverage";

/** The tear's sliders: shown value = stored value × `factor`. */
const FIELDS: { key: NumericKey; label: string; min: number; max: number; step: number; factor: number; unit: string }[] = [
  { key: "roughness", label: "editor.roughness", min: 0, max: MAX_ROUGHNESS, step: 0.1, factor: 1, unit: "units.mm" },
  { key: "scale", label: "editor.tearScale", min: 1, max: 40, step: 0.5, factor: 1, unit: "units.mm" },
  { key: "grain", label: "editor.grain", min: 0, max: 180, step: 1, factor: 1, unit: "units.deg" },
  { key: "rimWidth", label: "editor.rimWidth", min: 0, max: 3, step: 0.1, factor: 1, unit: "units.mm" },
  { key: "fibres", label: "editor.fibres", min: 0, max: 40, step: 1, factor: 1, unit: "units.perCm" },
  { key: "coverage", label: "editor.coverage", min: 5, max: 100, step: 1, factor: 100, unit: "units.percent" },
];

/** A core colour to start from when the user turns off "from the paper". */
const DEFAULT_CORE = "#f7f3ea";

/** Torn edge: paper kind, how rough and along which grain, the light core band and loose fibres (D011). */
export function EdgeSection({ piece, disabled, onChange }: SectionProps) {
  const t = useTranslations();
  const edge = piece.edge;
  const set = (patch: Partial<TornEdge>, key: string | null) => onChange({ ...piece, edge: { ...edge, ...patch } }, key && `edge:${key}`);

  return (
    <Section title={t("editor.edge")} testId="section-edge">
      <Toggle
        label={t("editor.tornEdge")}
        checked={edge.enabled}
        disabled={disabled}
        onChange={(enabled) => set({ enabled }, null)}
        testId="edge-enabled"
      />
      {edge.enabled ? (
        <>
          <SelectField<PaperKind>
            label={t("editor.paper")}
            value={edge.paper}
            options={PAPER_KINDS.map((p) => ({ value: p, label: t(`papers.${p}`) }))}
            disabled={disabled}
            onChange={(paper) => set({ paper }, null)}
            testId="edge-paper"
          />
          {FIELDS.map((f) => (
            <NumberField
              key={f.key}
              label={t(f.label)}
              value={Math.round(edge[f.key] * f.factor * 10) / 10}
              min={f.min}
              max={f.max}
              step={f.step}
              unit={t(f.unit)}
              disabled={disabled}
              onChange={(v) => set({ [f.key]: v / f.factor }, f.key)}
              testId={`edge-${f.key}`}
            />
          ))}
          <Toggle
            label={t("editor.coreFromPaper")}
            checked={edge.rimColor === null}
            disabled={disabled}
            onChange={(fromPaper) => set({ rimColor: fromPaper ? null : DEFAULT_CORE }, null)}
            testId="edge-core-from-paper"
          />
          {edge.rimColor !== null ? (
            <ColorField
              label={t("editor.coreColor")}
              value={edge.rimColor}
              disabled={disabled}
              onChange={(rimColor) => set({ rimColor }, "rimColor")}
              testId="edge-core-color"
            />
          ) : null}
          <button
            type="button"
            className="btn self-start"
            disabled={disabled}
            onClick={() => set({ seed: randomSeed() }, null)}
            data-testid="edge-reroll"
          >
            {t("editor.reroll")}
          </button>
        </>
      ) : null}
    </Section>
  );
}
