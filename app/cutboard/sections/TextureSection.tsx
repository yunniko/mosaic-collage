"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DEFAULT_TEXTURE_TRANSFORM, newId } from "@/lib/document/defaults";
import { addAsset, getPiece, updatePiece } from "@/lib/document/ops";
import type { AssetMeta, TextureSource, TextureTransform } from "@/lib/document/types";
import { randomSeed } from "@/lib/random";
import { defaultParams, sanitizeParams } from "@/lib/shapes/params";
import { TEXTURE_GENERATORS, findTextureGenerator } from "@/lib/textures/generators";
import type { TextureGenerator } from "@/lib/textures/generators/registry";
import { ColorField, NumberField, ParamField, Section, SelectField } from "../../components/controls";
import { pdfPageCount } from "../../render/texture-images";
import { errorText } from "../../state/errors";
import { store, useAppState, useDoc } from "../../state/store";
import type { SectionProps } from "../PieceEditor";

/** The largest file taken as a texture. Bigger files are refused: they are kept whole in memory and in saved files. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Image files the browser decodes into pixels, by extension, for systems that report no MIME type. SVG is not one. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
};

/** The kind and MIME type a chosen file is stored as, or null when it is not a usable texture. */
function textureFileType(file: File): { kind: "image" | "pdf"; mime: string } | null {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (file.type === "application/pdf" || ext === "pdf") return { kind: "pdf", mime: "application/pdf" };
  if (file.type === "image/svg+xml" || ext === "svg") return null;
  if (file.type.startsWith("image/")) return { kind: "image", mime: file.type };
  return IMAGE_EXTENSIONS[ext] ? { kind: "image", mime: IMAGE_EXTENSIONS[ext] } : null;
}

/** In the picker an image and a PDF page are one choice, "a file": the file chosen decides which. */
type Choice = "plain" | "generated" | "file";

const RAD = Math.PI / 180;

/** A generator's own parameters and the colours it was designed in. */
const generatedDefaults = (gen: TextureGenerator) => ({ generatorId: gen.id, params: defaultParams(gen.params), colors: [...gen.colors] });

export function TextureSection({ piece, disabled, onChange }: SectionProps) {
  const t = useTranslations();
  const tex = piece.texture;
  const fileRef = useRef<HTMLInputElement>(null);
  const setTexture = (texture: TextureSource, key: string | null) => onChange({ ...piece, texture }, key && `texture:${key}`);

  const choose = (c: Choice) => {
    if (c === "file") return fileRef.current?.click();
    if (c === "plain") return setTexture({ kind: "plain", color: tex.kind === "generated" ? tex.colors[0] : "#c8553d" }, null);
    setTexture({ kind: "generated", ...generatedDefaults(TEXTURE_GENERATORS[0]), seed: randomSeed() }, null);
  };

  const upload = async (file: File) => {
    const type = textureFileType(file);
    if (!type) return store.notify("error", t("errors.texture-type"));
    if (file.size > MAX_UPLOAD_BYTES) return store.notify("error", t("errors.texture-too-big", { mb: MAX_UPLOAD_BYTES / 1048576 }));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const meta: AssetMeta = { id: newId(), name: file.name, mime: type.mime, kind: type.kind };
    const texture: TextureSource = type.kind === "pdf" ? { kind: "pdf", assetId: meta.id, page: 1 } : { kind: "image", assetId: meta.id };
    store.addAssetBytes(meta.id, bytes);
    const ok = store.apply(
      (d) => {
        // The piece as it is now, not as it was when the file was chosen: it may have been edited while it was read.
        const current = getPiece(d, piece.id);
        // A new picture starts unshifted and unscaled: the old transform was set for a different texture.
        return updatePiece(addAsset(d, meta), { ...current, texture, textureTransform: { ...DEFAULT_TEXTURE_TRANSFORM } });
      },
      (e) => store.notify("error", errorText(t, e))
    );
    if (!ok) store.removeAssetBytes(meta.id);
  };

  const choice: Choice = tex.kind === "image" || tex.kind === "pdf" ? "file" : tex.kind;
  return (
    <Section title={t("editor.texture")} testId="section-texture">
      <SelectField<Choice>
        label={t("editor.textureKind")}
        value={choice}
        options={[
          { value: "plain", label: t("editor.texturePlain") },
          { value: "generated", label: t("editor.textureGenerated") },
          { value: "file", label: t("editor.textureFile") },
        ]}
        disabled={disabled}
        onChange={choose}
        testId="texture-kind"
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
        data-testid="texture-file"
      />
      {tex.kind === "plain" ? (
        <ColorField
          label={t("editor.color")}
          value={tex.color}
          disabled={disabled}
          onChange={(color) => setTexture({ kind: "plain", color }, "color")}
          testId="texture-color"
        />
      ) : null}
      {tex.kind === "generated" ? <GeneratedFields texture={tex} disabled={disabled} onChange={setTexture} /> : null}
      {tex.kind === "image" || tex.kind === "pdf" ? (
        <FileFields texture={tex} disabled={disabled} onChange={setTexture} onReplace={() => fileRef.current?.click()} />
      ) : null}
      {tex.kind !== "plain" ? (
        <TransformFields
          transform={piece.textureTransform}
          disabled={disabled}
          onChange={(textureTransform, key) => onChange({ ...piece, textureTransform }, `transform:${key}`)}
        />
      ) : null}
    </Section>
  );
}

type Fields<K extends TextureSource["kind"]> = {
  texture: Extract<TextureSource, { kind: K }>;
  disabled: boolean;
  onChange: (t: TextureSource, key: string | null) => void;
};

function GeneratedFields({ texture, disabled, onChange }: Fields<"generated">) {
  const t = useTranslations();
  const gen = findTextureGenerator(texture.generatorId) ?? TEXTURE_GENERATORS[0];
  const params = sanitizeParams(gen.params, texture.params);
  return (
    <>
      <SelectField
        label={t("editor.generator")}
        value={gen.id}
        options={TEXTURE_GENERATORS.map((g) => ({ value: g.id, label: t(`textures.${g.label}`) }))}
        disabled={disabled}
        onChange={(id) => {
          // The seed is kept, so only the kind changes.
          onChange({ ...texture, ...generatedDefaults(findTextureGenerator(id)!) }, null);
        }}
        testId="texture-generator"
      />
      {gen.params.map((spec) => (
        <ParamField
          key={spec.key}
          spec={spec}
          value={params[spec.key]}
          disabled={disabled}
          onChange={(v) => onChange({ ...texture, params: { ...params, [spec.key]: v } }, spec.key)}
        />
      ))}
      {texture.colors.map((c, i) => (
        <ColorField
          key={i}
          label={t("editor.colorStop", { n: i + 1 })}
          value={c}
          disabled={disabled}
          onChange={(v) => onChange({ ...texture, colors: texture.colors.map((x, j) => (j === i ? v : x)) }, `stop${i}`)}
          testId={`texture-stop-${i}`}
        />
      ))}
      <button
        type="button"
        className="btn self-start"
        disabled={disabled}
        onClick={() => onChange({ ...texture, seed: randomSeed() }, null)}
        data-testid="texture-reroll"
      >
        {t("editor.reroll")}
      </button>
    </>
  );
}

function FileFields({ texture, disabled, onChange, onReplace }: Fields<"image" | "pdf"> & { onReplace: () => void }) {
  const t = useTranslations();
  const doc = useDoc();
  const name = doc.assets.find((a) => a.id === texture.assetId)?.name ?? "";
  const pages = usePdfPages(texture.kind === "pdf" ? texture.assetId : null);
  return (
    <>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate" title={name} data-testid="texture-file-name">
          {name}
        </span>
        <button type="button" className="btn shrink-0" disabled={disabled} onClick={onReplace}>
          {t("editor.replaceFile")}
        </button>
      </div>
      {texture.kind === "pdf" ? (
        <NumberField
          label={pages ? t("editor.pdfPageOf", { count: pages }) : t("editor.pdfPage")}
          value={texture.page}
          min={1}
          max={pages ?? Math.max(texture.page, 1)}
          step={1}
          disabled={disabled || !pages || pages < 2}
          onChange={(page) => onChange({ ...texture, page }, "page")}
          testId="texture-pdf-page"
        />
      ) : null}
    </>
  );
}

/** The page count of a PDF asset, once read. */
function usePdfPages(assetId: string | null): number | null {
  const bytes = useAppState((s) => (assetId ? s.assets.get(assetId) : undefined));
  const [count, setCount] = useState<{ bytes: Uint8Array; pages: number } | null>(null);
  useEffect(() => {
    if (!bytes || !assetId) return;
    let live = true;
    pdfPageCount(assetId)
      .then((pages) => live && setCount({ bytes, pages }))
      .catch(() => live && setCount({ bytes, pages: 1 }));
    return () => {
      live = false;
    };
  }, [assetId, bytes]);
  return count && count.bytes === bytes ? count.pages : null;
}

function TransformFields(props: { transform: TextureTransform; disabled: boolean; onChange: (t: TextureTransform, key: string) => void }) {
  const t = useTranslations();
  const tf = props.transform;
  const field = (key: keyof TextureTransform, label: string, min: number, max: number, step: number, unit: string, k = 1) => (
    <NumberField
      label={t(label)}
      value={tf[key] / k}
      min={min}
      max={max}
      step={step}
      unit={t(`units.${unit}`)}
      disabled={props.disabled}
      onChange={(v) => props.onChange({ ...tf, [key]: v * k }, key)}
      testId={`texture-${key}`}
    />
  );
  return (
    <>
      {field("offsetX", "editor.offsetX", -200, 200, 0.5, "mm")}
      {field("offsetY", "editor.offsetY", -200, 200, 0.5, "mm")}
      {field("scale", "editor.textureScale", 0.1, 10, 0.05, "times")}
      {field("rotation", "editor.textureRotation", -180, 180, 1, "deg", RAD)}
    </>
  );
}
