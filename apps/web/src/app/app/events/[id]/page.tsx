"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import { toPng } from "html-to-image";
import { Download, ExternalLink, Eye, Printer, QrCode, Smartphone, Trash2 } from "lucide-react";
import { CARD_SIZES, EventCardView } from "@/components/event/event-card";
import { ContentEditor, ImageField } from "@/components/event/content-editor";
import { DesignEditor, Segmented, Slider } from "@/components/event/design-editor";
import { EventView } from "@/components/event/event-view";
import { EventFonts } from "@/components/event/fonts";
import { Button, Card, CardHeader, cx, Field, FormError, Input, LoadingBlock, PageHeader, StatusPill, Textarea, Toggle } from "@/components/ui";
import { api, ApiError, fetcher } from "@/lib/api";
import { EventCard, EventContent, EventRecord, EventTheme, embeddedFontCss, FONTS, formatEventDate, KIND_META } from "@/lib/events";
import { canEdit, useSession } from "@/lib/session";

type Tab = "content" | "design" | "card";
interface Draft { title: string; theme: EventTheme; content: EventContent; card: EventCard }
const pick = (e: EventRecord): Draft => ({ title: e.title, theme: e.theme, content: e.content, card: e.card });

export default function EventEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { org } = useSession();
  const key = `/orgs/${org.id}/events/${id}`;
  const { data, error, mutate } = useSWR<{ event: EventRecord; showPlatformBranding: boolean }>(key, fetcher, { revalidateOnFocus: false });

  if (error) return <p className="text-sm text-bad">{error.status === 404 ? "This event doesn't exist." : "Couldn't load the event."}</p>;
  if (!data) return <LoadingBlock />;
  return <Editor key={data.event.id} event={data.event} branding={data.showPlatformBranding} onSaved={(e) => mutate({ ...data, event: e }, { revalidate: false })} />;
}

function Editor({ event, branding, onSaved }: { event: EventRecord; branding: boolean; onSaved: (e: EventRecord) => void }) {
  const router = useRouter();
  const { org } = useSession();
  const editable = canEdit(org.role);
  const [saved, setSaved] = useState<Draft>(() => pick(event));
  const [draft, setDraft] = useState<Draft>(() => pick(event));
  const [published, setPublished] = useState(event.isPublished);
  const [tab, setTab] = useState<Tab>(() => {
    const t = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    return t === "design" || t === "card" ? t : "content";
  });
  const [busy, setBusy] = useState<null | "save" | "publish">(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false); // small screens
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const qr = event.qrCodes[0] ?? null;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Autosave: every change is written to the database a moment after you stop typing.
  const [autosave, setAutosave] = useState<"idle" | "saving" | "error">("idle");
  useEffect(() => {
    if (!dirty || !editable || busy) return;
    const t = setTimeout(async () => {
      setAutosave("saving");
      try {
        await save();
        setAutosave("idle");
      } catch (err) {
        setAutosave("error");
        setError(err instanceof ApiError ? err.message : "Couldn't save your changes. Check your connection, then choose Retry saving.");
      }
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty, editable, busy]);

  /** Saves the draft. Autosave passes no message (quiet); buttons pass the toast to show. */
  async function save(extra: { isPublished?: boolean } = {}, toastMessage: string | false = false) {
    setError(null);
    const sent = draft;
    const body = { ...(dirty ? { ...sent, title: sent.title.trim() || saved.title } : {}), ...extra };
    const { event: e } = await api<{ event: EventRecord }>(`/orgs/${org.id}/events/${event.id}`, { method: "PATCH", json: body, toast: toastMessage });
    setSaved(pick(e));
    // Keep anything typed while the save was on its way; otherwise take the server's tidy copy.
    setDraft((d) => (JSON.stringify(d) === JSON.stringify(sent) ? pick(e) : d));
    setPublished(e.isPublished);
    onSaved(e);
    globalMutate(`/orgs/${org.id}/events`);
    return e;
  }

  async function run(kind: "save" | "publish", fn: () => Promise<unknown>) {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("Delete this event and its QR code? This can't be undone.")) return;
    try {
      await api(`/orgs/${org.id}/events/${event.id}`, { method: "DELETE" });
      await globalMutate(`/orgs/${org.id}/events`);
      router.push("/app/events");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the event.");
    }
  }

  const pageUrl = typeof window !== "undefined" ? `${window.location.origin}/e/${event.id}` : `/e/${event.id}`;

  return (
    <>
      <EventFonts names={Object.keys(FONTS)} />
      <PageHeader
        back={{ href: "/app/events", label: "Events" }}
        title={draft.title || "Untitled event"}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={published ? "published" : "draft"} />
            <span>{KIND_META[event.kind].label}</span>
            {qr && <span className="tabular">{event.scansTotal.toLocaleString()} scan{event.scansTotal === 1 ? "" : "s"}</span>}
          </span>
        }
        action={
          editable ? (
            <>
              {published && (
                <a href={`/e/${event.id}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-3.5 text-sm font-medium hover:border-ink/30">
                  <ExternalLink className="size-4" /> View page
                </a>
              )}
              {published ? (
                <Button variant="secondary" loading={busy === "publish"} onClick={() => run("publish", () => save({ isPublished: false }, "Unpublished. Guests will see a “not ready yet” page."))}>
                  Unpublish
                </Button>
              ) : (
                <Button variant="secondary" loading={busy === "publish"} onClick={() => run("publish", () => save({ isPublished: true }, "Published. Guests can now open the page."))}>
                  Publish
                </Button>
              )}
              <Button variant={dirty && autosave === "error" ? "primary" : "ghost"} loading={busy === "save" || autosave === "saving"} disabled={!dirty} onClick={() => run("save", () => save({}, "Changes saved"))}>
                {autosave === "saving" ? "Saving…" : dirty ? (autosave === "error" ? "Retry saving" : "Unsaved changes") : "All changes saved"}
              </Button>
            </>
          ) : undefined
        }
      />

      {!published && (
        <p className="mb-5 rounded-md border border-warn/30 bg-warn-soft px-4 py-2.5 text-sm text-warn">
          This page is a draft. Guests who scan the code will see &ldquo;not ready yet&rdquo; until you publish it.
        </p>
      )}
      <FormError message={error} />

      <div className="mb-5 flex items-center gap-1 border-b border-line" role="tablist">
        {([
          ["content", "Content"],
          ["design", "Design"],
          ["card", "QR card"],
        ] as const).map(([t, label]) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx("-mb-px border-b-2 px-3.5 py-2.5 text-sm", tab === t ? "border-accent font-medium text-accent" : "border-transparent text-muted hover:text-ink")}
          >
            {label}
          </button>
        ))}
        {tab !== "card" && (
          <button type="button" onClick={() => setShowPreview((v) => !v)} className="ml-auto flex items-center gap-1.5 px-2 py-2 text-sm text-muted hover:text-ink lg:hidden">
            <Eye className="size-4" /> {showPreview ? "Hide preview" : "Preview"}
          </button>
        )}
      </div>

      {tab === "card" ? (
        <CardTab draft={draft} setDraft={setDraft} event={event} qr={qr} dirty={dirty} save={save} />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <fieldset disabled={!editable} className={cx("min-w-0", showPreview && "hidden lg:block")}>
            {tab === "content" ? (
              <ContentEditor
                kind={event.kind}
                name={draft.title}
                onName={(title) => setDraft({ ...draft, title })}
                content={draft.content}
                onContent={(content) => setDraft({ ...draft, content })}
                theme={draft.theme}
                onTheme={(theme) => setDraft({ ...draft, theme })}
                orgId={org.id}
              />
            ) : (
              <DesignEditor theme={draft.theme} onTheme={(theme) => setDraft({ ...draft, theme })} content={draft.content} orgId={org.id} kind={event.kind} />
            )}
            {editable && (
              <div className="mt-8 flex justify-end">
                <Button variant="danger" size="sm" onClick={remove}>
                  <Trash2 className="size-4" /> Delete event
                </Button>
              </div>
            )}
          </fieldset>
          <div className={cx("lg:sticky lg:top-24", !showPreview && "hidden lg:block")}>
            <PhonePreview>
              <EventView theme={draft.theme} content={draft.content} orgName={org.name} showBranding={branding} pageUrl={pageUrl} preview />
            </PhonePreview>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] text-muted">
              <Smartphone className="size-3.5" /> Live preview of what guests see
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function PhonePreview({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[380px] rounded-[2.2rem] border border-line bg-ink p-2.5 shadow-xl">
      <div className="h-[min(720px,calc(100vh-11rem))] overflow-y-auto overflow-x-hidden rounded-[1.7rem] [scrollbar-width:thin]">{children}</div>
    </div>
  );
}

function CardTab({
  draft, setDraft, event, qr, dirty, save,
}: {
  draft: Draft; setDraft: (d: Draft) => void; event: EventRecord; qr: EventRecord["qrCodes"][number] | null; dirty: boolean; save: () => Promise<EventRecord>;
}) {
  const { org } = useSession();
  const editable = canEdit(org.role);
  const exportRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<null | "png" | "print" | "qr">(null);
  const [error, setError] = useState<string | null>(null);
  const card = draft.card;
  const set = (patch: Partial<EventCard>) => setDraft({ ...draft, card: { ...card, ...patch } });
  const autoFooter = [formatEventDate(draft.content.date), draft.content.venue].filter(Boolean).join("\n");

  async function downloadPng() {
    if (!exportRef.current) return;
    setBusy("png");
    setError(null);
    try {
      await document.fonts.ready;
      const fontEmbedCSS = await embeddedFontCss([draft.theme.headingFont, draft.theme.bodyFont]).catch(() => "");
      const url = await toPng(exportRef.current, { pixelRatio: 4, cacheBust: true, fontEmbedCSS });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(draft.title || "event").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr-card.png`;
      a.click();
    } catch {
      setError("Couldn't create the image. Try Print instead and choose Save as PDF.");
    } finally {
      setBusy(null);
    }
  }

  async function print() {
    setBusy("print");
    setError(null);
    try {
      if (dirty) await save(); // the print page reads the saved version
      window.open(`/print/event/${event.id}?org=${org.id}`, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save before printing.");
    } finally {
      setBusy(null);
    }
  }

  async function addQr() {
    setBusy("qr");
    try {
      await api(`/orgs/${org.id}/events/${event.id}/qr`, { method: "POST" });
      await globalMutate(`/orgs/${org.id}/events/${event.id}`);
    } catch {
      /* the upgrade dialog explains plan limits */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <fieldset disabled={!editable} className="grid min-w-0 gap-5">
        <Card>
          <CardHeader title="Size" />
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            {(Object.keys(CARD_SIZES) as EventCard["size"][]).map((s) => {
              const on = card.size === s;
              return (
                <button key={s} type="button" aria-pressed={on} onClick={() => set({ size: s })} className={cx("flex items-center gap-3 rounded-lg border p-3 text-left", on ? "border-accent ring-2 ring-accent/20" : "border-line hover:border-ink/30")}>
                  <span aria-hidden className={cx("block shrink-0 rounded-[3px] border-2", on ? "border-accent" : "border-faint")} style={{ width: 22, height: 22 * CARD_SIZES[s].ratio * (s === "square" ? 1 : 0.85) }} />
                  <span>
                    <span className="block text-sm font-medium">{CARD_SIZES[s].label}</span>
                    <span className="block text-[13px] text-muted">{CARD_SIZES[s].hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader title="Your own artwork" description="Designed the card yourself (in Canva, Photoshop or by a designer)? Upload it and we'll put the QR code on top." />
          <div className="grid gap-5 p-5">
            <ImageField label="Card artwork" hint="PNG or JPG, same shape as the card size above" value={card.backgroundImage ?? null} orgId={org.id} shape="tall" onChange={(v) => set({ backgroundImage: v, ...(v ? {} : { showText: true }) })} />
            {card.backgroundImage && (
              <>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span className="block font-medium">Add our text on top</span>
                    <span className="block text-[13px] text-muted">Turn off if your artwork already has the wording</span>
                  </span>
                  <Toggle checked={card.showText ?? true} label="Add our text on top" onChange={(v) => set({ showText: v })} />
                </div>
                {!(card.showText ?? true) && (
                  <Segmented label="Where the QR code goes" value={card.qrPlacement ?? "center"} options={[["top", "Top"], ["center", "Middle"], ["bottom", "Bottom"]]} onChange={(v) => set({ qrPlacement: v })} />
                )}
                <Slider label="Soften the artwork" hint="Lays the background colour over it so text stays readable" min={0} max={85} step={5} value={card.backgroundDim ?? 0} format={(v) => `${v}%`} onChange={(v) => set({ backgroundDim: v })} />
              </>
            )}
            <Slider label="QR code size" min={25} max={70} step={1} value={card.qrSize ?? (card.size === "square" ? 38 : 44)} format={(v) => `${v}% of the width`} onChange={(v) => set({ qrSize: v })} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Wording" description="The names come from the Content tab." />
          <div className="grid gap-4 p-5">
            <Field label="Welcome line" htmlFor="k-head" hint="Shown above the names">
              <Input id="k-head" value={card.headline} maxLength={140} onChange={(e) => set({ headline: e.target.value })} />
            </Field>
            <Field label="Instruction" htmlFor="k-sub" hint="Shown under the code">
              <Input id="k-sub" value={card.subline} maxLength={160} onChange={(e) => set({ subline: e.target.value })} />
            </Field>
            <Field label="Small print" htmlFor="k-foot" hint="Leave empty to use the date and venue">
              <Textarea id="k-foot" rows={2} value={card.footer} maxLength={160} placeholder={autoFooter} onChange={(e) => set({ footer: e.target.value })} />
            </Field>
            {draft.theme.portraitImage && card.size !== "square" && (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>Show the portrait photo</span>
                <Toggle checked={card.showPhoto} label="Show the portrait photo" onChange={(v) => set({ showPhoto: v })} />
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="QR code" />
          <div className="grid gap-3 p-5 text-sm">
            {qr ? (
              <>
                <p className="text-muted">
                  The card links to <span className="font-mono text-ink">{qr.shortUrl}</span>. You can change the page at any time without reprinting the card.
                </p>
                <div>
                  <Link href={`/app/qr/${qr.id}`} className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline">
                    <QrCode className="size-4" /> Scan stats and plain QR downloads
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="text-muted">This event has no QR code yet.</p>
                <div>
                  <Button size="sm" loading={busy === "qr"} onClick={addQr}>Create QR code</Button>
                </div>
              </>
            )}
          </div>
        </Card>
      </fieldset>

      <div className="grid gap-3 lg:sticky lg:top-24">
        <div className="rounded-lg border border-line bg-sunk p-5">
          <div className="mx-auto shadow-lg" style={{ maxWidth: card.size === "poster" ? 300 : card.size === "table" ? 290 : 340 }}>
            <EventCardView theme={draft.theme} content={draft.content} card={card} qrUrl={qr?.shortUrl ?? null} />
          </div>
        </div>
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={downloadPng} loading={busy === "png"} disabled={!qr}>
            <Download className="size-4" /> Download PNG
          </Button>
          <Button variant="secondary" onClick={print} loading={busy === "print"} disabled={!qr}>
            <Printer className="size-4" /> Print or PDF
          </Button>
        </div>
        <p className="text-center text-[13px] text-muted">Scan the preview with your phone to test it before printing.</p>
      </div>

      {/* Full-size copy used for the PNG export (2480 px wide: A4 at 300 dpi). */}
      <div aria-hidden style={{ position: "fixed", left: -10000, top: 0, width: 620, pointerEvents: "none" }}>
        <EventCardView ref={exportRef} theme={draft.theme} content={draft.content} card={card} qrUrl={qr?.shortUrl ?? null} />
      </div>
    </div>
  );
}
