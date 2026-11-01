"use client";

import { useTranslations } from "next-intl";
import { DEFAULT_TEXTURE_TRANSFORM } from "@/lib/document/defaults";
import { getPiece, updatePiece } from "@/lib/document/ops";
import { Section } from "../../components/controls";
import { TextureEditor } from "../../components/TextureEditor";
import type { SectionProps } from "../PieceEditor";

export function TextureSection({ piece, disabled, onChange }: SectionProps) {
  const t = useTranslations();
  return (
    <Section title={t("editor.texture")} testId="section-texture">
      <TextureEditor
        texture={piece.texture}
        transform={piece.textureTransform}
        disabled={disabled}
        onTexture={(texture, key) => onChange({ ...piece, texture }, key && `texture:${key}`)}
        onTransform={(textureTransform, key) => onChange({ ...piece, textureTransform }, `transform:${key}`)}
        applyFile={(d, texture) =>
          // The piece as it is now, not as it was when the file was chosen.
          updatePiece(d, { ...getPiece(d, piece.id), texture, textureTransform: { ...DEFAULT_TEXTURE_TRANSFORM } })
        }
        testIdPrefix="texture"
      />
    </Section>
  );
}
