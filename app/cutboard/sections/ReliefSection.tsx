"use client";

import { useTranslations } from "next-intl";
import { RELIEF_STYLES, type Relief, type ReliefStyle } from "@/lib/document/types";
import { type ScaledFieldSpec, ScaledFields, Section, SelectField } from "../../components/controls";
import type { SectionProps } from "../PieceEditor";

type NumericKey = Exclude<keyof Relief, "style">;

/** The relief's sliders, each shown when its `when` holds: the shape needs a style, the light something to light. */
const FIELDS: (ScaledFieldSpec<NumericKey> & { when: (r: Relief) => boolean })[] = [
  { key: "size", label: "editor.reliefSize", min: 0.1, max: 10, step: 0.1, unit: "units.mm", when: shaped },
  { key: "depth", label: "editor.reliefDepth", min: 0, max: 100, step: 1, factor: 100, unit: "units.percent", when: shaped },
  { key: "softness", label: "editor.reliefSoftness", min: 0, max: 100, step: 1, factor: 100, unit: "units.percent", when: shaped },
  { key: "textureBump", label: "editor.textureBump", min: 0, max: 100, step: 1, factor: 100, unit: "units.percent", when: () => true },
  { key: "lightAngle", label: "editor.lightAngle", min: 0, max: 360, step: 1, unit: "units.deg", when: lit },
  { key: "lightAltitude", label: "editor.lightAltitude", min: 5, max: 90, step: 1, unit: "units.deg", when: lit },
];

function shaped(r: Relief) {
  return r.style !== "none";
}
function lit(r: Relief) {
  return shaped(r) || r.textureBump > 0;
}

/** Bevel, emboss or pillow relief and the texture's own bump, lit from one direction (D011). */
export function ReliefSection({ piece, disabled, onChange }: SectionProps) {
  const t = useTranslations();
  const relief = piece.relief;
  const set = (patch: Partial<Relief>, key: string | null) =>
    onChange({ ...piece, relief: { ...relief, ...patch } }, key && `relief:${key}`);

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
      <ScaledFields
        fields={FIELDS.filter((f) => f.when(relief))}
        values={relief}
        disabled={disabled}
        onChange={(key, v) => set({ [key]: v }, key)}
        testIdPrefix="relief"
      />
    </Section>
  );
}
