"use client";

import { useTranslations } from "next-intl";
import { DEFAULT_TEXTURE_TRANSFORM } from "@/lib/document/defaults";
import { setBackground } from "@/lib/document/ops";
import type { Background, MosaicDocument } from "@/lib/document/types";
import { NumberField, Section } from "../components/controls";
import { TextureEditor } from "../components/TextureEditor";
import { store, useDoc } from "../state/store";

/** What the artwork is laid on: any texture a piece can have (D014), and how far it reaches past the pieces. */
export function BackgroundSection() {
  const t = useTranslations();
  const bg = useDoc().background;
  const change = (patch: Partial<Background>, key: string | null) => {
    const apply = (d: MosaicDocument) => setBackground(d, { ...d.background, ...patch });
    if (key) store.applyCoalesced(`background:${key}`, apply);
    else store.apply(apply);
  };
  return (
    <Section title={t("workboard.background")} testId="background-settings">
      <TextureEditor
        texture={bg.texture}
        transform={bg.transform}
        onTexture={(texture, key) => change({ texture }, key && `texture:${key}`)}
        onTransform={(transform, key) => change({ transform }, `transform:${key}`)}
        applyFile={(d, texture) => setBackground(d, { ...d.background, texture, transform: { ...DEFAULT_TEXTURE_TRANSFORM } })}
        testIdPrefix="background"
      />
      <NumberField
        label={t("workboard.padding")}
        value={bg.padding}
        min={0}
        max={200}
        step={1}
        unit={t("units.mm")}
        onChange={(padding) => change({ padding }, "padding")}
        testId="background-padding"
      />
    </Section>
  );
}
