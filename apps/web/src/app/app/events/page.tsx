"use client";

import Link from "next/link";
import useSWR from "swr";
import { CalendarHeart, Plus } from "lucide-react";
import { EventFonts } from "@/components/event/fonts";
import { TemplateSwatch } from "@/components/event/template-swatch";
import { ButtonLink, Card, EmptyState, LoadingBlock, PageHeader, StatusPill } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { EventRecord, formatEventDate, KIND_META } from "@/lib/events";
import { canEdit, useSession } from "@/lib/session";

export default function EventsPage() {
  const { org } = useSession();
  const { data } = useSWR<{ events: EventRecord[] }>(`/orgs/${org.id}/events`, fetcher);
  const events = data?.events ?? [];
  const editable = canEdit(org.role);

  return (
    <>
      <EventFonts names={events.flatMap((e) => [e.theme.headingFont, e.theme.bodyFont])} />
      <PageHeader
        title="Events"
        description="Wedding programmes, funeral orders of service and more. Guests scan the QR card and get a designed page on their phone."
        action={editable && events.length > 0 ? <ButtonLink href="/app/events/new"><Plus className="size-4" /> New event</ButtonLink> : undefined}
      />
      {!data ? (
        <LoadingBlock />
      ) : events.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarHeart className="size-6" />}
            title="Create your first event page"
            body="Pick a template, add the programme line-up, then print the QR card for the entrance or the tables."
            action={editable ? <ButtonLink href="/app/events/new"><Plus className="size-4" /> New event</ButtonLink> : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {events.map((e) => (
            <Link key={e.id} href={`/app/events/${e.id}`} className="group overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-accent">
              <div className="h-44 border-b border-line">
                <TemplateSwatch theme={e.theme} content={{ ...e.content, title: e.content.title || e.title }} size={7} />
              </div>
              <div className="grid gap-1 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-medium group-hover:text-accent">{e.title}</p>
                  <span className="shrink-0"><StatusPill status={e.isPublished ? "published" : "draft"} /></span>
                </div>
                <p className="text-sm text-muted">{KIND_META[e.kind].label}{e.eventDate ? `, ${formatEventDate(e.eventDate)}` : ""}</p>
                <p className="tabular text-sm text-muted">{e.scansTotal.toLocaleString()} scan{e.scansTotal === 1 ? "" : "s"}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
