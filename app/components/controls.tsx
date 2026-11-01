"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { ParamSpec } from "@/lib/shapes/params";

/** A labelled slider with a number box beside it. */
export function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
  testId?: string;
}) {
  const id = useId();
  const clamp = (v: number) => Math.min(props.max, Math.max(props.min, v));
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="field-label">
        {props.label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="range"
          className="min-w-0 flex-1"
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          disabled={props.disabled}
          onChange={(e) => props.onChange(clamp(Number(e.target.value)))}
          data-testid={props.testId}
        />
        <input
          type="number"
          aria-label={props.label}
          className="w-16 rounded border border-paper-edge bg-white px-1 py-0.5 text-right text-sm"
          min={props.min}
          max={props.max}
          step={props.step}
          value={Number(props.value.toFixed(3))}
          disabled={props.disabled}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && e.target.value !== "") props.onChange(clamp(v));
          }}
        />
        {props.unit ? <span className="w-5 text-xs text-ink-soft">{props.unit}</span> : null}
      </div>
    </div>
  );
}

/** A parameter of a shape, generator or texture, labelled and ranged by its spec. */
export function ParamField(props: { spec: ParamSpec; value: number; disabled?: boolean; onChange: (v: number) => void }) {
  const t = useTranslations();
  const { spec } = props;
  return (
    <NumberField
      label={t(`params.${spec.label}`)}
      value={props.value}
      min={spec.min}
      max={spec.max}
      step={spec.step}
      unit={spec.unit ? t(`units.${spec.unit}`) : undefined}
      disabled={props.disabled}
      onChange={props.onChange}
      testId={`param-${spec.key}`}
    />
  );
}

export function ColorField(props: { label: string; value: string; disabled?: boolean; onChange: (v: string) => void; testId?: string }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="field-label">
        {props.label}
      </label>
      <input
        id={id}
        type="color"
        className="h-7 w-12 cursor-pointer rounded border border-paper-edge bg-white"
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
        data-testid={props.testId}
      />
    </div>
  );
}

export function SelectField<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (v: T) => void;
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="field-label">
        {props.label}
      </label>
      <select
        id={id}
        className="rounded border border-paper-edge bg-white px-1.5 py-1 text-sm"
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value as T)}
        data-testid={props.testId}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Toggle(props: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 accent-[var(--color-accent)]"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
        data-testid={props.testId}
      />
      {props.label}
    </label>
  );
}

export function Section(props: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-2 border-t border-paper-edge pt-3 first:border-t-0 first:pt-0" data-testid={props.testId}>
      <h3 className="text-xs font-semibold tracking-wide text-ink-soft uppercase">{props.title}</h3>
      {props.children}
    </section>
  );
}
