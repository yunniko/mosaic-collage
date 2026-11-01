"use client";

import { useTranslations } from "next-intl";
import type { ShapeSource } from "@/lib/document/types";
import { randomSeed } from "@/lib/random";
import { SHAPE_GENERATORS, findShapeGenerator } from "@/lib/shapes/generators";
import { STABILIZATION } from "@/lib/shapes/hand";
import { defaultParams, sanitizeParams } from "@/lib/shapes/params";
import { PREDEFINED_SHAPES, findPredefinedShape } from "@/lib/shapes/predefined";
import { ParamField, Section, SelectField } from "../../components/controls";
import { store, useCutting } from "../../state/store";
import type { SectionProps } from "../PieceEditor";

type Source = ShapeSource["kind"];
type Fields<K extends Source> = {
  shape: Extract<ShapeSource, { kind: K }>;
  disabled: boolean;
  onChange: (s: ShapeSource, key: string | null) => void;
};

export function ShapeSection({ piece, disabled, onChange }: SectionProps) {
  const t = useTranslations();
  const cutting = useCutting();
  const shape = piece.shape;
  const setShape = (next: ShapeSource, key: string | null) => onChange({ ...piece, shape: next }, key && `shape:${key}`);
  const startCut = () => store.set({ cuttingPieceId: piece.id });

  const switchTo = (kind: Source) => {
    if (kind === shape.kind) return;
    store.set({ cuttingPieceId: null });
    // A hand cut needs a stroke first: the shape changes when the cut is drawn, not when the source is picked.
    if (kind === "hand") return startCut();
    if (kind === "generated") {
      const gen = SHAPE_GENERATORS[0];
      setShape({ kind: "generated", generatorId: gen.id, params: defaultParams(gen.params), seed: randomSeed() }, "source");
    } else {
      const def = PREDEFINED_SHAPES[0];
      setShape({ kind: "predefined", shapeId: def.id, params: defaultParams(def.params) }, "source");
    }
  };

  return (
    <Section title={t("editor.shape")} testId="section-shape">
      <SelectField<Source>
        label={t("editor.shapeSource")}
        value={cutting ? "hand" : shape.kind}
        options={[
          { value: "predefined", label: t("editor.sourcePredefined") },
          { value: "generated", label: t("editor.sourceGenerated") },
          { value: "hand", label: t("editor.sourceHand") },
        ]}
        disabled={disabled}
        onChange={switchTo}
        testId="shape-source"
      />
      {shape.kind === "predefined" ? <PredefinedFields shape={shape} disabled={disabled} onChange={setShape} /> : null}
      {shape.kind === "generated" ? <GeneratedFields shape={shape} disabled={disabled} onChange={setShape} /> : null}
      {shape.kind === "hand" ? <HandFields shape={shape} disabled={disabled} onChange={setShape} /> : null}
      {shape.kind === "hand" && !cutting && !disabled ? (
        <button type="button" className="btn self-start" onClick={startCut} data-testid="cut-again">
          {t("cut.again")}
        </button>
      ) : null}
    </Section>
  );
}

function PredefinedFields(props: Fields<"predefined">) {
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

function GeneratedFields(props: Fields<"generated">) {
  const t = useTranslations();
  const gen = findShapeGenerator(props.shape.generatorId) ?? SHAPE_GENERATORS[0];
  const params = sanitizeParams(gen.params, props.shape.params);
  return (
    <>
      <SelectField
        label={t("editor.generator")}
        value={gen.id}
        options={SHAPE_GENERATORS.map((g) => ({ value: g.id, label: t(`generators.${g.label}`) }))}
        disabled={props.disabled}
        onChange={(id) => {
          const next = findShapeGenerator(id)!;
          props.onChange({ ...props.shape, generatorId: id, params: defaultParams(next.params) }, "generator");
        }}
        testId="generator-kind"
      />
      {gen.params.map((spec) => (
        <ParamField
          key={spec.key}
          spec={spec}
          value={params[spec.key]}
          disabled={props.disabled}
          onChange={(v) => props.onChange({ ...props.shape, params: { ...params, [spec.key]: v } }, spec.key)}
        />
      ))}
      <button
        type="button"
        className="btn self-start"
        disabled={props.disabled}
        onClick={() => props.onChange({ ...props.shape, seed: randomSeed() }, null)}
        data-testid="reroll-seed"
      >
        {t("editor.reroll")}
      </button>
    </>
  );
}

function HandFields(props: Fields<"hand">) {
  return (
    <ParamField
      spec={STABILIZATION}
      value={props.shape.stabilization}
      disabled={props.disabled}
      onChange={(v) => props.onChange({ ...props.shape, stabilization: v }, "stabilization")}
    />
  );
}
