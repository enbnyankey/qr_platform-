"use client";

import { Check, RotateCcw } from "lucide-react";
import { Button, Card, CardHeader, cx, Field, Input, Select } from "@/components/ui";
import {
  BODY_FONTS, contrast, EventContent, EventKind, EventTheme, fontStack, HEADING_FONTS, Layout, LAYOUT_LABELS, Ornament, ORNAMENT_LABELS, SCRATCH, STYLE_DEFAULTS, templateById, TEMPLATES, themeFromTemplate, withSamplePhotos,
} from "@/lib/events";
import { ImageField } from "./content-editor";
import { TemplateSwatch } from "./template-swatch";

const COLOURS: { key: keyof Pick<EventTheme, "bg" | "surface" | "ink" | "muted" | "accent">; label: string }[] = [
  { key: "bg", label: "Background" },
  { key: "surface", label: "Panels" },
  { key: "ink", label: "Text" },
  { key: "muted", label: "Soft text" },
  { key: "accent", label: "Accent" },
];

export function DesignEditor({ theme, onTheme, content, orgId, kind }: { theme: EventTheme; onTheme: (t: EventTheme) => void; content: EventContent; orgId: string; kind: EventKind }) {
  const base = templateById(theme.template);
  const customised = JSON.stringify(themeFromTemplate(base, theme)) !== JSON.stringify(theme);
  const set = (patch: Partial<EventTheme>) => onTheme({ ...theme, ...patch });
  const lowContrast = contrast(theme.ink, theme.bg) < 4.5 || contrast(theme.ink, theme.surface) < 4.5;

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title="Template" description="Switching keeps your words and photos." />
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 xl:grid-cols-5">
          {[SCRATCH, ...TEMPLATES].map((t) => {
            const on = theme.template === t.id;
            return (
              <button key={t.id} type="button" aria-pressed={on} onClick={() => onTheme(themeFromTemplate(t, theme))} className="group grid gap-1.5 text-left">
                <span className={cx("relative block h-48 overflow-hidden rounded-md border", on ? "border-accent ring-2 ring-accent" : "border-line group-hover:border-ink/30")}>
                  <TemplateSwatch theme={withSamplePhotos(themeFromTemplate(t, theme), kind)} content={content} size={6} />
                  {on && (
                    <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-accent text-white">
                      <Check className="size-3" />
                    </span>
                  )}
                </span>
                <span className="text-[13px] font-medium">{t.name}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Make it your own" description="Layout choices that work with any template, or with Blank to design from scratch." />
        <div className="grid gap-6 p-5">
          <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end sm:gap-6">
            <ImageField label="Background photo" hint="Shown behind the whole page" value={theme.backgroundImage ?? null} orgId={orgId} shape="wide" onChange={(v) => set({ backgroundImage: v })} />
            {theme.backgroundImage && (
              <Slider label="Soften the photo" hint="More softening keeps the text easy to read" min={0} max={85} step={5} value={theme.backgroundDim ?? STYLE_DEFAULTS.backgroundDim} format={(v) => `${v}%`} onChange={(v) => set({ backgroundDim: v })} />
            )}
          </div>
          <Segmented
            label="Layout"
            value={theme.layout ?? "classic"}
            options={(Object.keys(LAYOUT_LABELS) as Layout[]).map((l) => [l, LAYOUT_LABELS[l]] as [Layout, string])}
            onChange={(v) => set({ layout: v })}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Segmented label="Photo shape (Classic layout)" value={theme.portraitShape ?? "arch"} options={[["arch", "Arch"], ["circle", "Circle"], ["square", "Square"]]} onChange={(v) => set({ portraitShape: v })} />
            <Segmented label="Sections" value={theme.panelStyle ?? "filled"} options={[["filled", "Filled"], ["outline", "Outlined"], ["plain", "Plain"]]} onChange={(v) => set({ panelStyle: v })} />
          </div>
          <Slider label="Size of the names" min={0.7} max={1.5} step={0.05} value={theme.nameScale ?? 1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ nameScale: v })} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Colours"
          action={
            customised ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onTheme(themeFromTemplate(base, theme))}>
                <RotateCcw className="size-3.5" /> Reset to {base.name}
              </Button>
            ) : undefined
          }
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {COLOURS.map(({ key, label }) => (
            <div key={key} className="grid gap-1.5">
              <label htmlFor={`col-${key}`} className="text-sm font-medium">{label}</label>
              <div className="flex items-center gap-2">
                <input
                  id={`col-${key}`}
                  type="color"
                  value={theme[key]}
                  onChange={(e) => set({ [key]: e.target.value })}
                  className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-line bg-surface p-1"
                />
                <Input
                  key={theme[key]}
                  aria-label={`${label} hex`}
                  defaultValue={theme[key]}
                  maxLength={7}
                  className="font-mono uppercase"
                  onChange={(e) => {
                    const v = (e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`).toLowerCase();
                    if (/^#[0-9a-f]{6}$/.test(v)) set({ [key]: v } as Partial<EventTheme>);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        {lowContrast && <p className="mx-5 mb-5 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">The text colour is hard to read on this background. Guests reading outdoors may struggle; try a darker or lighter text colour.</p>}
      </Card>

      <Card>
        <CardHeader title="Fonts" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Names and headings" htmlFor="f-head">
            <Select id="f-head" value={theme.headingFont} onChange={(e) => set({ headingFont: e.target.value })} style={{ fontFamily: fontStack(theme.headingFont), fontSize: 17 }}>
              {HEADING_FONTS.map((f) => (
                <option key={f} value={f} style={{ fontFamily: fontStack(f) }}>{f}</option>
              ))}
            </Select>
          </Field>
          <Field label="Body text" htmlFor="f-body">
            <Select id="f-body" value={theme.bodyFont} onChange={(e) => set({ bodyFont: e.target.value })} style={{ fontFamily: fontStack(theme.bodyFont) }}>
              {BODY_FONTS.map((f) => (
                <option key={f} value={f} style={{ fontFamily: fontStack(f) }}>{f}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Decoration" />
        <div className="flex flex-wrap gap-2 p-5">
          {(Object.keys(ORNAMENT_LABELS) as Ornament[]).map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={theme.ornament === o}
              onClick={() => set({ ornament: o })}
              className={cx("rounded-full border px-3.5 py-1.5 text-sm", theme.ornament === o ? "border-accent bg-accent-soft font-medium text-accent" : "border-line hover:border-ink/30")}
            >
              {ORNAMENT_LABELS[o]}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex w-fit rounded-md border border-line bg-sunk p-0.5">
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={cx("rounded px-3 py-1.5 text-sm", value === v ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink")}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Slider({ label, hint, min, max, step, value, onChange, format }: { label: string; hint?: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; format: (v: number) => string }) {
  const id = `sl-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        <span className="tabular text-sm text-muted">{format(value)}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--color-accent)]" />
      {hint && <p className="text-[13px] text-muted">{hint}</p>}
    </div>
  );
}
