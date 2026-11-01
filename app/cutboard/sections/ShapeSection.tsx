"use client";

import { useTranslations } from "next-intl";
import type { ShapeSource } from "@/lib/document/types";
import { defaultParams, sanitizeParams } from "@/lib/shapes/params";
import { PREDEFINED_SHAPES, findPredefinedShape } from "@/lib/shapes/predefined";
import { ParamField, Section, SelectField } from "../../components/controls";
import type { SectionProps } from "../PieceEditor";

export function ShapeSection({ piece, disabled, onChange }: SectionProps) {
  const t = useTranslations();
  const shape = piece.shape;
  const setShape = (next: ShapeSource, key: string) => onChange({ ...piece, shape: next }, `shape:${key}`);

  return (
    <Section title={t("editor.shape")} testId="section-shape">
      {shape.kind === "predefined" ? <PredefinedFields shape={shape} disabled={disabled} onChange={setShape} /> : null}
    </Section>
  );
}

function PredefinedFields(props: {
  shape: Extract<ShapeSource, { kind: "predefined" }>;
  disabled: boolean;
  onChange: (s: ShapeSource, key: string) => void;
}) {
  const t = useTranslations();
  const def = findPredefinedShape(props.shape.shapeId) ?? PREDEFINED_SHAPES[0];
  const params = sanitizeParams(def.params, props.shape.params);
  return (
    <>
      <SelectField
        label={t("editor.shapeKind")}
        value={def.id}
        options={PREDEFINED_SHAPES.map((s) => ({ value: s.id, label: t(`shapes.${s.label}`) }))}
        disabled={props.disabled}
        onChange={(id) => {
          const next = findPredefinedShape(id)!;
          props.onChange({ kind: "predefined", shapeId: id, params: defaultParams(next.params) }, "kind");
        }}
        testId="shape-kind"
      />
      {def.params.map((spec) => (
        <ParamField
          key={spec.key}
          spec={spec}
          value={params[spec.key]}
          disabled={props.disabled}
          onChange={(v) => props.onChange({ ...props.shape, params: { ...params, [spec.key]: v } }, spec.key)}
        />
      ))}
    </>
  );
}
