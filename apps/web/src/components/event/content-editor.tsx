"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, BookOpenText, ImagePlus, ListOrdered, Music, Plus, Trash2, Users, X, Images } from "lucide-react";
import { Button, Card, CardHeader, cx, Field, Input, Spinner, Textarea } from "@/components/ui";
import { assetUrl, uploadFile } from "@/lib/api";
import { EventContent, EventKind, EventSection, EventTheme, uid } from "@/lib/events";
import { defaultTitle } from "./event-view";

type Patch<T> = (next: T) => void;

const SECTION_KINDS: { kind: EventSection["kind"]; label: string; icon: typeof ListOrdered }[] = [
  { kind: "programme", label: "Programme", icon: ListOrdered },
  { kind: "text", label: "Text", icon: BookOpenText },
  { kind: "hymns", label: "Hymns or songs", icon: Music },
  { kind: "people", label: "People", icon: Users },
  { kind: "photos", label: "Photos", icon: Images },
];

function newSection(kind: EventSection["kind"]): EventSection {
  switch (kind) {
    case "programme":
      return { id: uid(), kind, title: "Programme", items: [{ id: uid(), time: "", title: "", detail: "" }] };
    case "text":
      return { id: uid(), kind, title: "", body: "" };
    case "hymns":
      return { id: uid(), kind, title: "Hymns", items: [{ id: uid(), title: "", body: "" }] };
    case "people":
      return { id: uid(), kind, title: "", items: [{ id: uid(), name: "", role: "" }] };
    case "photos":
      return { id: uid(), kind, title: "Photos", images: [] };
  }
}

function move<T>(list: T[], i: number, by: number) {
  const j = i + by;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

const PHOTO_COPY: Record<EventKind, string> = {
  wedding: "A photo of the couple",
  funeral: "A portrait of the deceased",
  birthday: "A photo of the celebrant",
  church: "A photo, e.g. of the minister or church",
  corporate: "A logo or photo",
  other: "A photo",
};

export function ContentEditor({
  kind, name, onName, content, onContent, theme, onTheme, orgId,
}: {
  kind: EventKind; name: string; onName: Patch<string>; content: EventContent; onContent: Patch<EventContent>;
  theme: EventTheme; onTheme: Patch<EventTheme>; orgId: string;
}) {
  const set = (patch: Partial<EventContent>) => onContent({ ...content, ...patch });
  const setSection = (i: number, s: EventSection) => set({ sections: content.sections.map((x, n) => (n === i ? s : x)) });

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader title="Top of the page" description="What guests see first." />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Line above the names" htmlFor="c-eyebrow" hint="e.g. The wedding of, Celebration of life">
            <Input id="c-eyebrow" value={content.eyebrow} maxLength={80} onChange={(e) => set({ eyebrow: e.target.value })} />
          </Field>
          <Field label="Names or title" htmlFor="c-title">
            <Input id="c-title" value={content.title} maxLength={140} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Line under the names" htmlFor="c-sub" hint="Optional: years, a hashtag or a verse" className="sm:col-span-2">
            <Input id="c-sub" value={content.subtitle} maxLength={140} onChange={(e) => set({ subtitle: e.target.value })} />
          </Field>
          <Field label="Date" htmlFor="c-date">
            <Input id="c-date" type="date" value={content.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Start time" htmlFor="c-time">
            <Input id="c-time" type="time" value={content.time} onChange={(e) => set({ time: e.target.value })} />
          </Field>
          <Field label="Venue" htmlFor="c-venue">
            <Input id="c-venue" value={content.venue} maxLength={160} placeholder="e.g. Holy Spirit Cathedral" onChange={(e) => set({ venue: e.target.value })} />
          </Field>
          <Field label="Address or area" htmlFor="c-addr" hint="Used for the Directions button">
            <Input id="c-addr" value={content.address} maxLength={240} placeholder="e.g. Adabraka, Accra" onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <Field label="Welcome note" htmlFor="c-msg" className="sm:col-span-2">
            <Textarea id="c-msg" rows={3} value={content.message} maxLength={2000} onChange={(e) => set({ message: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Photos" />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <ImageField label="Portrait" hint={PHOTO_COPY[kind]} value={theme.portraitImage} orgId={orgId} onChange={(v) => onTheme({ ...theme, portraitImage: v })} shape="arch" />
          <ImageField label="Cover photo" hint="A wide photo across the top" value={theme.coverImage} orgId={orgId} onChange={(v) => onTheme({ ...theme, coverImage: v })} shape="wide" />
        </div>
      </Card>

      {content.sections.map((s, i) => (
        <SectionEditor
          key={s.id}
          section={s}
          orgId={orgId}
          onChange={(next) => setSection(i, next)}
          onMove={(by) => set({ sections: move(content.sections, i, by) })}
          onRemove={() => set({ sections: content.sections.filter((x) => x.id !== s.id) })}
          first={i === 0}
          last={i === content.sections.length - 1}
        />
      ))}

      <Card className="p-5">
        <p className="mb-3 text-sm font-medium">Add a section</p>
        <div className="flex flex-wrap gap-2">
          {SECTION_KINDS.map(({ kind: k, label, icon: Icon }) => (
            <Button key={k} type="button" variant="secondary" size="sm" disabled={content.sections.length >= 20} onClick={() => set({ sections: [...content.sections, newSection(k)] })}>
              <Icon className="size-4" /> {label}
            </Button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Event name" description="Only you see this, in your list of events." />
        <div className="p-5">
          <Input aria-label="Event name" value={name} maxLength={120} onChange={(e) => onName(e.target.value)} />
        </div>
      </Card>
    </div>
  );
}

function SectionEditor({
  section: s, onChange, onMove, onRemove, first, last, orgId,
}: {
  section: EventSection; onChange: Patch<EventSection>; onMove: (by: number) => void; onRemove: () => void; first: boolean; last: boolean; orgId: string;
}) {
  const meta = SECTION_KINDS.find((k) => k.kind === s.kind)!;
  const Icon = meta.icon;
  const iconBtn = "rounded-md p-1.5 text-muted hover:bg-sunk hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-line px-5 py-3">
        <Icon className="size-4 shrink-0 text-muted" aria-hidden />
        <Input
          aria-label={`${meta.label} section title`}
          value={s.title}
          placeholder={defaultTitle(s)}
          maxLength={80}
          onChange={(e) => onChange({ ...s, title: e.target.value })}
          className="h-9 border-transparent bg-transparent px-1.5 text-[15px] font-semibold hover:border-line"
        />
        <button type="button" className={iconBtn} disabled={first} onClick={() => onMove(-1)} aria-label="Move section up"><ArrowUp className="size-4" /></button>
        <button type="button" className={iconBtn} disabled={last} onClick={() => onMove(1)} aria-label="Move section down"><ArrowDown className="size-4" /></button>
        <button type="button" className={cx(iconBtn, "hover:text-bad")} onClick={() => confirm("Remove this section?") && onRemove()} aria-label="Remove section"><Trash2 className="size-4" /></button>
      </div>
      <div className="p-5">
        {s.kind === "programme" && (
          <Rows
            items={s.items}
            onChange={(items) => onChange({ ...s, items })}
            make={() => ({ id: uid(), time: "", title: "", detail: "" })}
            addLabel="Add item"
            max={80}
            render={(it, set) => (
              <div className="grid flex-1 gap-2 sm:grid-cols-[140px_minmax(0,1fr)]">
                <Input type="time" aria-label="Time" value={it.time} onChange={(e) => set({ ...it, time: e.target.value })} />
                <Input aria-label="Item" placeholder="e.g. Exchange of vows" value={it.title} maxLength={160} onChange={(e) => set({ ...it, title: e.target.value })} />
                <Input aria-label="Details" placeholder="Details or who leads it (optional)" value={it.detail} maxLength={300} onChange={(e) => set({ ...it, detail: e.target.value })} className="sm:col-start-2" />
              </div>
            )}
          />
        )}
        {s.kind === "text" && <Textarea aria-label="Text" rows={6} value={s.body} maxLength={6000} onChange={(e) => onChange({ ...s, body: e.target.value })} />}
        {s.kind === "hymns" && (
          <Rows
            items={s.items}
            onChange={(items) => onChange({ ...s, items })}
            make={() => ({ id: uid(), title: "", body: "" })}
            addLabel="Add hymn or song"
            max={40}
            render={(it, set) => (
              <div className="grid flex-1 gap-2">
                <Input aria-label="Title" placeholder="Title" value={it.title} maxLength={160} onChange={(e) => set({ ...it, title: e.target.value })} />
                <Textarea aria-label="Words" placeholder="Words, one line per line" rows={4} value={it.body} maxLength={4000} onChange={(e) => set({ ...it, body: e.target.value })} />
              </div>
            )}
          />
        )}
        {s.kind === "people" && (
          <Rows
            items={s.items}
            onChange={(items) => onChange({ ...s, items })}
            make={() => ({ id: uid(), name: "", role: "" })}
            addLabel="Add person"
            max={80}
            render={(it, set) => (
              <div className="grid flex-1 gap-2 sm:grid-cols-2">
                <Input aria-label="Name" placeholder="Name" value={it.name} maxLength={120} onChange={(e) => set({ ...it, name: e.target.value })} />
                <Input aria-label="Role" placeholder="Role, e.g. Best man" value={it.role} maxLength={120} onChange={(e) => set({ ...it, role: e.target.value })} />
              </div>
            )}
          />
        )}
        {s.kind === "photos" && <PhotoGrid images={s.images} orgId={orgId} onChange={(images) => onChange({ ...s, images })} />}
      </div>
    </Card>
  );
}

function Rows<T extends { id: string }>({
  items, onChange, render, make, addLabel, max,
}: {
  items: T[]; onChange: Patch<T[]>; render: (item: T, set: Patch<T>) => React.ReactNode; make: () => T; addLabel: string; max: number;
}) {
  const btn = "rounded p-1 text-muted hover:bg-sunk hover:text-ink disabled:opacity-30";
  return (
    <div className="grid gap-3">
      {items.map((it, i) => (
        <div key={it.id} className="flex items-start gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
          {render(it, (next) => onChange(items.map((x) => (x.id === it.id ? next : x))))}
          <div className="flex shrink-0 flex-col">
            <button type="button" className={btn} disabled={i === 0} onClick={() => onChange(move(items, i, -1))} aria-label="Move up"><ArrowUp className="size-3.5" /></button>
            <button type="button" className={btn} disabled={i === items.length - 1} onClick={() => onChange(move(items, i, 1))} aria-label="Move down"><ArrowDown className="size-3.5" /></button>
            <button type="button" className={cx(btn, "hover:text-bad")} onClick={() => onChange(items.filter((x) => x.id !== it.id))} aria-label="Remove"><X className="size-3.5" /></button>
          </div>
        </div>
      ))}
      <div>
        <Button type="button" variant="ghost" size="sm" disabled={items.length >= max} onClick={() => onChange([...items, make()])}>
          <Plus className="size-4" /> {addLabel}
        </Button>
      </div>
    </div>
  );
}

function useUpload(orgId: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(files: FileList | null): Promise<string[]> {
    if (!files?.length) return [];
    setBusy(true);
    setError(null);
    try {
      const out: string[] = [];
      for (const f of Array.from(files)) {
        if (!/^image\/(png|jpeg|webp)$/.test(f.type)) throw new Error("Use a PNG, JPG or WebP photo.");
        out.push((await uploadFile(orgId, f)).path);
      }
      return out;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
      return [];
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, upload };
}

export function ImageField({ label, hint, value, onChange, orgId, shape }: { label: string; hint: string; value: string | null; onChange: (v: string | null) => void; orgId: string; shape: "arch" | "wide" | "tall" }) {
  const input = useRef<HTMLInputElement>(null);
  const { busy, error, upload } = useUpload(orgId);
  return (
    <div className="grid gap-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[13px] text-muted">{hint}</p>
      </div>
      <div className="flex items-end gap-3">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={cx(
            "relative grid shrink-0 place-items-center overflow-hidden border border-dashed border-line bg-sunk text-muted hover:border-accent hover:text-accent",
            shape === "arch" ? "h-28 w-22 rounded-t-full rounded-b-md" : shape === "tall" ? "h-32 w-24 rounded-md" : "h-24 w-40 rounded-md",
          )}
          aria-label={value ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {value ? <img src={assetUrl(value)} alt="" className="absolute inset-0 size-full object-cover" /> : busy ? <Spinner /> : <ImagePlus className="size-5" />}
        </button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            Remove
          </Button>
        )}
      </div>
      {error && <p className="text-[13px] text-bad">{error}</p>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (e) => { const [p] = await upload(e.target.files); if (p) onChange(p); e.target.value = ""; }} />
    </div>
  );
}

function PhotoGrid({ images, onChange, orgId }: { images: string[]; onChange: Patch<string[]>; orgId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const { busy, error, upload } = useUpload(orgId);
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((src) => (
          <div key={src} className="relative aspect-square overflow-hidden rounded-md border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assetUrl(src)} alt="" className="size-full object-cover" />
            <button type="button" onClick={() => onChange(images.filter((x) => x !== src))} aria-label="Remove photo" className="absolute right-1 top-1 rounded-full bg-ink/70 p-1 text-white hover:bg-ink">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {images.length < 12 && (
          <button type="button" onClick={() => input.current?.click()} className="grid aspect-square place-items-center rounded-md border border-dashed border-line bg-sunk text-muted hover:border-accent hover:text-accent" aria-label="Add photos">
            {busy ? <Spinner /> : <ImagePlus className="size-5" />}
          </button>
        )}
      </div>
      <p className="text-[13px] text-muted">Up to 12 photos.</p>
      {error && <p className="text-[13px] text-bad">{error}</p>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={async (e) => { const added = await upload(e.target.files); onChange([...images, ...added].slice(0, 12)); e.target.value = ""; }} />
    </div>
  );
}
