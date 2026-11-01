"use client";

import { useTranslations } from "next-intl";
import { ColorField, Section } from "../../components/controls";
import type { SectionProps } from "../PieceEditor";

export function TextureSection({ piece, disabled, onChange }: SectionProps) {
  const t = useTranslations("editor");
  const tex = piece.texture;
  return (
    <Section title={t("texture")} testId="section-texture">
      {tex.kind === "plain" ? (
        <ColorField
          label={t("color")}
          value={tex.color}
          disabled={disabled}
          onChange={(color) => onChange({ ...piece, texture: { kind: "plain", color } }, "texture:color")}
          testId="texture-color"
        />
      ) : null}
    </Section>
  );
}
