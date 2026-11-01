"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { EXPORT_DPI, type ExportFormat, MAX_EXPORT_PIXELS, exportPlan } from "@/lib/export/plan";
import { Section, SelectField, Toggle } from "../components/controls";
import { runExport } from "../export/run-export";
import { store, useDoc } from "../state/store";
import { downloadBytes, safeFileName } from "../studio/file-io";

/** Exports the artwork as a PNG (with or without its background) or a JPG, at a chosen resolution (D015). */
export function ExportSection() {
  const t = useTranslations("export");
  const doc = useDoc();
  const [format, setFormat] = useState<ExportFormat>("png");
  const [dpi, setDpi] = useState<number>(300);
  const [withBackground, setWithBackground] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const plan = exportPlan(doc, dpi);
  const busy = progress !== null;

  const start = async () => {
    if (!plan || plan.tooBig) return;
    setProgress(0);
    try {
      const blob = await runExport(doc, plan, { format, dpi, background: withBackground }, setProgress);
      const name = safeFileName(doc.name, format === "jpeg" ? ".jpg" : ".png");
      downloadBytes(blob, name, blob.type);
      store.notify("info", t("done", { name }));
    } catch (e) {
      console.error(e);
      store.notify("error", t("failed", { reason: e instanceof Error ? e.message : String(e) }));
    } finally {
      setProgress(null);
    }
  };

  return (
    <Section title={t("title")} testId="export-settings">
      <SelectField<ExportFormat>
        label={t("format")}
        value={format}
        options={[
          { value: "png", label: "PNG" },
          { value: "jpeg", label: "JPG" },
        ]}
        disabled={busy}
        onChange={setFormat}
        testId="export-format"
      />
      <Toggle
        label={t("background")}
        checked={format === "jpeg" || withBackground}
        disabled={busy || format === "jpeg"}
        onChange={setWithBackground}
        testId="export-background"
      />
      <SelectField<string>
        label={t("resolution")}
        value={String(dpi)}
        options={EXPORT_DPI.map((d) => ({ value: String(d), label: t("dpi", { dpi: d }) }))}
        disabled={busy}
        onChange={(v) => setDpi(Number(v))}
        testId="export-dpi"
      />
      <p className="text-xs text-ink-soft" data-testid="export-size">
        {!plan
          ? t("empty")
          : plan.tooBig
            ? t("tooBig", { max: MAX_EXPORT_PIXELS / 1e6 })
            : t("size", { width: plan.width, height: plan.height })}
      </p>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy || !plan || plan.tooBig}
        onClick={() => void start()}
        data-testid="export-start"
      >
        {busy ? t("working", { percent: Math.round(progress * 100) }) : t("start")}
      </button>
    </Section>
  );
}
