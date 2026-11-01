"use client";

import { useTranslations } from "next-intl";
import { RELIEF_STYLES, type Relief, type ReliefStyle } from "@/lib/document/types";
import { NumberField, Section, SelectField } from "../../components/controls";
import type { SectionProps } from "../PieceEditor";

type NumericKey = Exclude<keyof Relief, "style">;

/** The relief's sliders: shown value = stored value × `factor`. */
const SHAPE_FIELDS: { key: NumericKey; label: string; min: number; max: number; step: number; factor: number; unit: string }[] = [
  { key: "size", label: "editor.reliefSize", min: 0.1, max: 10, step: 0.1, factor: 1, unit: "units.mm" },
  { key: "depth", label: "editor.reliefDepth", min: 0, max: 100, step: 1, factor: 100, unit: "units.percent" },
  { key: "softness", label: "editor.reliefSoftness", min: 0, max: 100, step: 1, factor: 100, unit: "units.percent" },
];
const LIGHT_FIELDS: typeof SHAPE_FIELDS = [
  { key: "lightAngle", label: "editor.lightAngle", min: 0, max: 360, step: 1, factor: 1, unit: "units.deg" },
  { key: "lightAltitude", label: "editor.lightAltitude", min: 5, max: 90, step: 1, factor: 1, unit: "units.deg" },
];
const BUMP_FIELD: (typeof SHAPE_FIELDS)[number] = {
  key: "textureBump",
  label: "editor.textureBump",
  min: 0,
  max: 100,
  step: 1,
  factor: 100,
  unit: "units.percent",
};

/** Bevel, emboss or pillow relief and the texture's own bump, lit from one direction (D011). */
export function ReliefSection({ piece, disabled, onChange }: SectionProps) {
  const t = useTranslations();
  const relief = piece.relief;
  const set = (patch: Partial<Relief>, key: string | null) =>
    onChange({ ...piece, relief: { ...relief, ...patch } }, key && `relief:${key}`);
  const shaped = relief.style !== "none";
  const fields = [...(shaped ? SHAPE_FIELDS : []), BUMP_FIELD, ...(shaped || relief.textureBump > 0 ? LIGHT_FIELDS : [])];

  return (
    <Section title={t("editor.relief")} testId="section-relief">
      <SelectField<ReliefStyle>
        label={t("editor.reliefStyle")}
        value={relief.style}
        options={RELIEF_STYLES.map((s) => ({ value: s, label: t(`relief.${s}`) }))}
        disabled={disabled}
        onChange={(style) => set({ style }, null)}
        testId="relief-style"
      />
      {fields.map((f) => (
        <NumberField
          key={f.key}
          label={t(f.label)}
          value={Math.round(relief[f.key] * f.factor * 10) / 10}
          min={f.min}
          max={f.max}
          step={f.step}
          unit={t(f.unit)}
          disabled={disabled}
          onChange={(v) => set({ [f.key]: v / f.factor }, f.key)}
          testId={`relief-${f.key}`}
        />
      ))}
    </Section>
  );
}
