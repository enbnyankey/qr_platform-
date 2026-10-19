"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { Check, Paintbrush } from "lucide-react";
import { EventFonts } from "@/components/event/fonts";
import { TemplateSwatch } from "@/components/event/template-swatch";
import { Button, Card, cx, Field, FormError, Input, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import {
  defaultEventName, EventKind, FONTS, KIND_META, KIND_ORDER, SCRATCH, starterCard, starterContent, Template, templatesFor, themeFromTemplate, withSamplePhotos,
} from "@/lib/events";
import { useSession } from "@/lib/session";

const TITLE_LABEL: Record<EventKind, { label: string; hint: string }> = {
  wedding: { label: "Couple's names", hint: "As you want them on the page, e.g. Ama & Kofi" },
  funeral: { label: "Name of the deceased", hint: "e.g. Madam Akosua Mensah" },
  birthday: { label: "Headline", hint: "e.g. Esi turns 30" },
  church: { label: "Service name", hint: "e.g. Harvest Thanksgiving" },
  corporate: { label: "Event name", hint: "e.g. Annual General Meeting 2026" },
  other: { label: "Event name", hint: "Shown in large letters at the top of the page" },
};

export default function NewEventPage() {
  const router = useRouter();
  const { org } = useSession();
  const [kind, setKind] = useState<EventKind | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templates = useMemo(() => (kind ? templatesFor(kind) : []), [kind]);
  const sample = kind ? starterContent(kind, "") : null;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!kind || !template) return;
    setSaving(true);
    setError(null);
    try {
      const { event } = await api(`/orgs/${org.id}/events`, {
        method: "POST",
        json: {
          kind,
          title: defaultEventName(kind, title),
          theme: themeFromTemplate(template),
          content: starterContent(kind, title.trim(), date),
          card: starterCard(kind),
        },
      });
      await mutate(`/orgs/${org.id}/events`);
      await mutate(`/orgs/${org.id}/billing`);
      router.push(`/app/events/${event.id}${template.id === SCRATCH.id ? "?tab=design" : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the event.");
      setSaving(false);
    }
  }

  return (
    <>
      <EventFonts names={Object.keys(FONTS)} />
      <PageHeader title="New event" back={{ href: "/app/events", label: "Events" }} />

      <div className="grid gap-8">
        <Step n={1} title="What's the occasion?">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {KIND_ORDER.map((k) => {
              const { label, blurb, icon: Icon } = KIND_META[k];
              const on = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setKind(k);
                    setTemplate(templatesFor(k)[0]);
                  }}
                  className={cx("flex items-start gap-3 rounded-lg border bg-surface p-4 text-left transition-colors", on ? "border-accent ring-2 ring-accent/20" : "border-line hover:border-ink/30")}
                >
                  <span className={cx("grid size-10 shrink-0 place-items-center rounded-full", on ? "bg-accent text-white" : "bg-sunk text-ink")}>
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block font-medium">{label}</span>
                    <span className="block text-sm text-muted">{blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Step>

        {kind && sample && (
          <Step n={2} title="Choose a template" note="Pick a ready-made design or start from a blank page. You can change everything afterwards.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {[SCRATCH, ...templates].map((t) => {
                const on = template?.id === t.id;
                return (
                  <button key={t.id} type="button" aria-pressed={on} onClick={() => setTemplate(t)} className="group grid gap-2 text-left">
                    <span className={cx("relative block h-72 overflow-hidden rounded-lg border transition-shadow", on ? "border-accent ring-2 ring-accent" : "border-line group-hover:border-ink/30")}>
                      {t.id === SCRATCH.id ? (
                        <span className="grid h-full place-items-center border-2 border-dashed border-line bg-surface p-4 text-center">
                          <span>
                            <Paintbrush className="mx-auto size-6 text-accent" />
                            <span className="mt-2 block font-medium">Start from scratch</span>
                            <span className="mt-1 block text-[13px] text-muted">Blank page. Pick your own colours, fonts, background photo and layout.</span>
                          </span>
                        </span>
                      ) : (
                        <TemplateSwatch theme={withSamplePhotos(themeFromTemplate(t), kind)} content={{ ...sample, title: title.trim() || sample.title, date: date || "2026-12-12", venue: "Accra" }} size={8} />
                      )}
                      {on && (
                        <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-accent text-white shadow">
                          <Check className="size-3.5" />
                        </span>
                      )}
                    </span>
                    {t.id !== SCRATCH.id && (
                      <span>
                        <span className="block text-sm font-medium">{t.name}</span>
                        <span className="block text-[13px] text-muted">{t.note}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Step>
        )}

        {kind && template && (
          <Step n={3} title="The basics">
            <Card className="p-5">
              <form onSubmit={create} className="grid max-w-xl gap-4">
                <FormError message={error} />
                <Field label={TITLE_LABEL[kind].label} htmlFor="ev-title" hint={TITLE_LABEL[kind].hint}>
                  <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={sample?.title} maxLength={140} />
                </Field>
                <Field label="Date" htmlFor="ev-date" hint="Optional. You can add the time and venue next.">
                  <Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
                </Field>
                <p className="text-sm text-muted">We&apos;ll fill in a starter programme for a {KIND_META[kind].label.toLowerCase()} that you can edit, and create the event&apos;s QR code.</p>
                <div>
                  <Button type="submit" loading={saving} disabled={!title.trim()}>
                    Create event
                  </Button>
                </div>
              </form>
            </Card>
          </Step>
        )}
      </div>
    </>
  );
}

function Step({ n, title, note, children }: { n: number; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex items-baseline gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink font-display text-sm font-semibold text-white">{n}</span>
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          {note && <p className="text-sm text-muted">{note}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
