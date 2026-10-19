import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { EventView } from "@/components/event/event-view";
import { EventFonts } from "@/components/event/fonts";
import type { EventContent, EventTheme } from "@/lib/events";

/**
 * Guest-facing event page (wedding programme, order of service, ...), opened by scanning
 * the event's QR code. Server-rendered so it paints fast on slow mobile connections.
 */
const API = process.env.API_INTERNAL_URL ?? "http://localhost:6061";
const WEB = process.env.WEB_BASE_URL ?? "http://localhost:6060";

interface PublicEvent {
  showPlatformBranding: boolean;
  event: { id: string; kind: string; title: string; theme: EventTheme; content: EventContent };
  organization: { name: string };
}

async function load(eventId: string): Promise<PublicEvent | "draft" | null> {
  const res = await fetch(`${API}/public/events/${encodeURIComponent(eventId)}`, { cache: "no-store" });
  if (res.status === 404) {
    const body = await res.json().catch(() => null);
    return body?.error?.code === "not_published" ? "draft" : null;
  }
  if (!res.ok) throw new Error(`Event API returned ${res.status}`);
  return res.json();
}

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const data = await load((await params).eventId).catch(() => null);
  if (!data || data === "draft") return { title: { absolute: "Programme" } };
  const c = data.event.content;
  return { title: { absolute: [c.eyebrow, c.title].filter(Boolean).join(" ") || data.event.title }, description: c.message || undefined };
}

export async function generateViewport({ params }: { params: Promise<{ eventId: string }> }): Promise<Viewport> {
  const data = await load((await params).eventId).catch(() => null);
  return { width: "device-width", initialScale: 1, themeColor: data && data !== "draft" ? data.event.theme.bg : "#ffffff" };
}

export default async function PublicEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const data = await load(eventId);
  if (!data) notFound();
  if (data === "draft") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f6f4f0] px-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-2xl font-semibold">The programme isn&apos;t ready yet</h1>
          <p className="mt-2 text-muted">The hosts are still putting it together. Scan again a little later.</p>
        </div>
      </div>
    );
  }
  const { event, organization, showPlatformBranding } = data;
  return (
    <div style={{ background: event.theme.bg, minHeight: "100vh" }}>
      <EventFonts names={[event.theme.headingFont, event.theme.bodyFont]} />
      <EventView theme={event.theme} content={event.content} orgName={organization.name} showBranding={showPlatformBranding} pageUrl={`${WEB}/e/${event.id}`} />
    </div>
  );
}
