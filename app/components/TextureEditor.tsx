"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { newId } from "@/lib/document/defaults";
import { addAsset } from "@/lib/document/ops";
import type { AssetMeta, MosaicDocument, TextureSource, TextureTransform } from "@/lib/document/types";
import { randomSeed } from "@/lib/random";
import { defaultParams, sanitizeParams } from "@/lib/shapes/params";
import { TEXTURE_GENERATORS, findTextureGenerator } from "@/lib/textures/generators";
import { TEXTURE_LIBRARY, findLibraryTexture, libraryUrl } from "@/lib/textures/library";
import type { TextureGenerator } from "@/lib/textures/generators/registry";
import { pdfPageCount } from "../render/texture-images";
import { errorText } from "../state/errors";
import { store, useAppState, useDoc } from "../state/store";
import { ColorField, NumberField, ParamField, SelectField } from "./controls";

/** The largest file taken as a texture. Bigger files are refused: they are kept whole in memory and in saved files. */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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

/**
 * In the picker an image and a PDF page are one choice, "a file": the file chosen decides which. A bundled texture is
 * `library:<file>`; once chosen it is an image asset like an upload.
 */
type Choice = "plain" | "generated" | "file" | `library:${string}`;

const RAD = Math.PI / 180;

/** A generator's own parameters and the colours it was designed in. */
const generatedDefaults = (gen: TextureGenerator) => ({ generatorId: gen.id, params: defaultParams(gen.params), colors: [...gen.colors] });

export interface TextureEditorProps {
  texture: TextureSource;
  transform: TextureTransform;
  disabled?: boolean;
  onTexture: (t: TextureSource, key: string | null) => void;
  onTransform: (t: TextureTransform, key: string) => void;
  /**
   * The document with a chosen file's texture applied, read from the document as it is when the file has been read
   * (it may have changed meanwhile). The transform should start unshifted and unscaled: it was set for another texture.
   */
  applyFile: (doc: MosaicDocument, texture: TextureSource) => MosaicDocument;
  /** Test ids are `${testIdPrefix}-kind`, `${testIdPrefix}-color` and so on. */
  testIdPrefix: string;
}

/** The texture picker and its fields: plain colour, a generated texture, or an image or PDF page, and its transform. */
export function TextureEditor({
  texture: tex,
  transform,
  disabled = false,
  onTexture,
  onTransform,
  applyFile,
  testIdPrefix: id,
}: TextureEditorProps) {
  const t = useTranslations();
  const fileRef = useRef<HTMLInputElement>(null);

  const doc = useDoc();

  const choose = (c: Choice) => {
    if (c === "file") return fileRef.current?.click();
    if (c.startsWith("library:")) return void chooseLibrary(c.slice("library:".length));
    if (c === "plain") return onTexture({ kind: "plain", color: tex.kind === "generated" ? tex.colors[0] : "#c8553d" }, null);
    onTexture({ kind: "generated", ...generatedDefaults(TEXTURE_GENERATORS[0]), seed: randomSeed() }, null);
  };

  /** Adds the bytes as a document asset and puts its texture on, as one undo step. */
  const addTexture = (bytes: Uint8Array, name: string, type: { kind: "image" | "pdf"; mime: string }) => {
    const meta: AssetMeta = { id: newId(), name, mime: type.mime, kind: type.kind };
    const texture: TextureSource = type.kind === "pdf" ? { kind: "pdf", assetId: meta.id, page: 1 } : { kind: "image", assetId: meta.id };
    store.addAssetBytes(meta.id, bytes);
    const ok = store.apply(
      (d) => applyFile(addAsset(d, meta), texture),
      (e) => store.notify("error", errorText(t, e))
    );
    if (!ok) store.removeAssetBytes(meta.id);
  };

  const upload = async (file: File) => {
    const type = textureFileType(file);
    if (!type) return store.notify("error", t("errors.texture-type"));
    if (file.size > MAX_UPLOAD_BYTES) return store.notify("error", t("errors.texture-too-big", { mb: MAX_UPLOAD_BYTES / 1048576 }));
    addTexture(new Uint8Array(await file.arrayBuffer()), file.name, type);
  };

  const chooseLibrary = async (file: string) => {
    const entry = TEXTURE_LIBRARY.find((l) => l.file === file);
    if (!entry) return;
    try {
      const res = await fetch(libraryUrl(entry));
      if (!res.ok) throw new Error(String(res.status));
      addTexture(new Uint8Array(await res.arrayBuffer()), entry.file, { kind: "image", mime: "image/jpeg" });
    } catch {
      store.notify("error", t("errors.library-load"));
    }
  };

  const library = tex.kind === "image" ? findLibraryTexture(doc.assets.find((a) => a.id === tex.assetId)?.name) : undefined;
  const choice: Choice = library ? `library:${library.file}` : tex.kind === "image" || tex.kind === "pdf" ? "file" : tex.kind;
  return (
    <>
      <SelectField<Choice>
        label={t("editor.textureKind")}
        value={choice}
        options={[
          { value: "plain", label: t("editor.texturePlain") },
          { value: "generated", label: t("editor.textureGenerated") },
          ...TEXTURE_LIBRARY.map((l) => ({ value: `library:${l.file}` as Choice, label: t(`textureLibrary.${l.label}`) })),
          { value: "file", label: t("editor.textureFile") },
        ]}
        disabled={disabled}
        onChange={choose}
        testId={`${id}-kind`}
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
        data-testid={`${id}-file`}
      />
      {tex.kind === "plain" ? (
        <ColorField
          label={t("editor.color")}
          value={tex.color}
          disabled={disabled}
          onChange={(color) => onTexture({ kind: "plain", color }, "color")}
          testId={`${id}-color`}
        />
      ) : null}
      {tex.kind === "generated" ? <GeneratedFields texture={tex} disabled={disabled} onChange={onTexture} id={id} /> : null}
      {tex.kind === "image" || tex.kind === "pdf" ? (
        <FileFields texture={tex} disabled={disabled} onChange={onTexture} id={id} onReplace={() => fileRef.current?.click()} />
      ) : null}
      {tex.kind !== "plain" ? <TransformFields transform={transform} disabled={disabled} onChange={onTransform} id={id} /> : null}
    </>
  );
}

type Fields<K extends TextureSource["kind"]> = {
  texture: Extract<TextureSource, { kind: K }>;
  disabled: boolean;
  onChange: (t: TextureSource, key: string | null) => void;
  id: string;
};

function GeneratedFields({ texture, disabled, onChange, id }: Fields<"generated">) {
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
        testId={`${id}-generator`}
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
          testId={`${id}-stop-${i}`}
        />
      ))}
      <button
        type="button"
        className="btn self-start"
        disabled={disabled}
        onClick={() => onChange({ ...texture, seed: randomSeed() }, null)}
        data-testid={`${id}-reroll`}
      >
        {t("editor.reroll")}
      </button>
    </>
  );
}

function FileFields({ texture, disabled, onChange, onReplace, id }: Fields<"image" | "pdf"> & { onReplace: () => void }) {
  const t = useTranslations();
  const doc = useDoc();
  const name = doc.assets.find((a) => a.id === texture.assetId)?.name ?? "";
  const pages = usePdfPages(texture.kind === "pdf" ? texture.assetId : null);
  return (
    <>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate" title={name} data-testid={`${id}-file-name`}>
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
          testId={`${id}-pdf-page`}
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

function TransformFields(props: {
  transform: TextureTransform;
  disabled: boolean;
  onChange: (t: TextureTransform, key: string) => void;
  id: string;
}) {
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
      testId={`${props.id}-${key}`}
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
