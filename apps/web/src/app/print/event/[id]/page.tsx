"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EventCardView } from "@/components/event/event-card";
import { EventFonts } from "@/components/event/fonts";
import { api } from "@/lib/api";
import type { EventRecord } from "@/lib/events";

/** Print view of an event's QR card: one card per page, at the card's physical size. */
const PAGE: Record<EventRecord["card"]["size"], string> = { poster: "A4 portrait", table: "4in 6in", square: "6in 6in" };

function PrintInner({ id }: { id: string }) {
  const orgId = useSearchParams().get("org") ?? "";
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ event: EventRecord }>(`/orgs/${encodeURIComponent(orgId)}/events/${encodeURIComponent(id)}`)
      .then((r) => setEvent(r.event))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the card."));
  }, [id, orgId]);

  useEffect(() => {
    if (!event) return;
    let cancelled = false;
    // Wait for the fonts and the QR drawing before opening the print dialog.
    document.fonts.ready.then(() => setTimeout(() => !cancelled && window.print(), 600));
    return () => {
      cancelled = true;
    };
  }, [event]);

  if (error) return <p className="p-8 text-sm text-bad">{error}</p>;
  if (!event) return <p className="p-8 text-sm text-muted">Preparing your card…</p>;
  const qr = event.qrCodes[0];
  return (
    <>
      <EventFonts names={[event.theme.headingFont, event.theme.bodyFont]} />
      <style>{`@page { size: ${PAGE[event.card.size]}; margin: 0 } html, body { background: #fff !important; margin: 0 } * { -webkit-print-color-adjust: exact; print-color-adjust: exact }
        @media screen { .sheet { max-width: 520px; margin: 24px auto; box-shadow: 0 10px 30px rgba(0,0,0,.15) } }`}</style>
      <div className="sheet">
        <EventCardView theme={event.theme} content={event.content} card={event.card} qrUrl={qr?.shortUrl ?? null} />
      </div>
    </>
  );
}

export default function PrintEventCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <PrintInner id={id} />
    </Suspense>
  );
}
