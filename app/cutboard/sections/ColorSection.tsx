"use client";

import { useTranslations } from "next-intl";
import { BLEND_MODES, type BlendMode, type ColorLayer, MAX_COLOR_LAYERS } from "@/lib/document/types";
import { ColorField, NumberField, Section, SelectField } from "../../components/controls";
import type { SectionProps } from "../PieceEditor";

/** Colour layers over the texture, applied top to bottom: tints in a blend mode, and hue/saturation/lightness shifts. */
export function ColorSection({ piece, disabled, onChange }: SectionProps) {
  const t = useTranslations();
  const layers = piece.colors;
  const set = (colors: ColorLayer[], key: string | null) => onChange({ ...piece, colors }, key && `colors:${key}`);
  const update = (i: number, layer: ColorLayer, key: string) =>
    set(
      layers.map((l, j) => (j === i ? layer : l)),
      `${i}:${key}`
    );
  const full = layers.length >= MAX_COLOR_LAYERS;

  return (
    <Section title={t("editor.colorLayers")} testId="section-colors">
      {layers.length === 0 ? <p className="text-sm text-ink-soft">{t("editor.noColorLayers")}</p> : null}
      {layers.map((layer, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border border-paper-edge p-2" data-testid={`color-layer-${i}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t(layer.kind === "tint" ? "editor.layerTint" : "editor.layerHsl")}</span>
            <button
              type="button"
              className="btn text-xs"
              disabled={disabled}
              onClick={() =>
                set(
                  layers.filter((_, j) => j !== i),
                  null
                )
              }
              data-testid={`color-layer-remove-${i}`}
            >
              {t("editor.removeLayer")}
            </button>
          </div>
          {layer.kind === "tint" ? (
            <>
              <ColorField
                label={t("editor.color")}
                value={layer.color}
                disabled={disabled}
                onChange={(color) => update(i, { ...layer, color }, "color")}
                testId={`tint-color-${i}`}
              />
              <SelectField<BlendMode>
                label={t("editor.blendMode")}
                value={layer.mode}
                options={BLEND_MODES.map((m) => ({ value: m, label: t(`blend.${m}`) }))}
                disabled={disabled}
                onChange={(mode) => update(i, { ...layer, mode }, "mode")}
                testId={`tint-mode-${i}`}
              />
              <NumberField
                label={t("editor.opacity")}
                value={Math.round(layer.opacity * 100)}
                min={0}
                max={100}
                step={1}
                unit={t("units.percent")}
                disabled={disabled}
                onChange={(v) => update(i, { ...layer, opacity: v / 100 }, "opacity")}
                testId={`tint-opacity-${i}`}
              />
            </>
          ) : (
            <>
              <NumberField
                label={t("editor.hue")}
                value={layer.hue}
                min={-180}
                max={180}
                step={1}
                unit={t("units.deg")}
                disabled={disabled}
                onChange={(hue) => update(i, { ...layer, hue }, "hue")}
                testId={`hsl-hue-${i}`}
              />
              <NumberField
                label={t("editor.saturation")}
                value={Math.round(layer.saturation * 100)}
                min={-100}
                max={100}
                step={1}
                unit={t("units.percent")}
                disabled={disabled}
                onChange={(v) => update(i, { ...layer, saturation: v / 100 }, "saturation")}
                testId={`hsl-saturation-${i}`}
              />
              <NumberField
                label={t("editor.lightness")}
                value={Math.round(layer.lightness * 100)}
                min={-100}
                max={100}
                step={1}
                unit={t("units.percent")}
                disabled={disabled}
                onChange={(v) => update(i, { ...layer, lightness: v / 100 }, "lightness")}
                testId={`hsl-lightness-${i}`}
              />
            </>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn"
          disabled={disabled || full}
          onClick={() => set([...layers, { kind: "tint", color: "#3d6fc8", mode: "multiply", opacity: 1 }], null)}
          data-testid="add-tint"
        >
          {t("editor.addTint")}
        </button>
        <button
          type="button"
          className="btn"
          disabled={disabled || full}
          onClick={() => set([...layers, { kind: "hsl", hue: 0, saturation: 0, lightness: 0 }], null)}
          data-testid="add-hsl"
        >
          {t("editor.addHsl")}
        </button>
      </div>
    </Section>
  );
}
