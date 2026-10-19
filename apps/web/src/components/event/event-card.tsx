"use client";

import { forwardRef, useEffect, useState } from "react";
import QRCode from "qrcode";
import { assetUrl } from "@/lib/api";
import { EventCard as CardData, EventContent, EventTheme, fontStack, formatEventDate, isScript, qrColours } from "@/lib/events";
import { Band, Divider, Surround } from "./ornaments";

export const CARD_SIZES: Record<CardData["size"], { label: string; hint: string; ratio: number }> = {
  poster: { label: "Poster", hint: "A4 or A5, for the entrance", ratio: 1.414 },
  table: { label: "Table card", hint: "4 × 6 in, for each table", ratio: 1.5 },
  square: { label: "Square", hint: "For WhatsApp and Instagram", ratio: 1 },
};

/** Automatic footer: the date and venue, unless the card has its own. */
export function cardFooter(card: CardData, content: EventContent) {
  if (card.footer.trim()) return card.footer.trim();
  return [formatEventDate(content.date), content.venue].filter(Boolean).join("\n");
}

/**
 * Printable QR sign. Everything is sized in container units (cqw), so it renders
 * identically in the small preview, the PNG export and a full printed page.
 */
export const EventCardView = forwardRef<HTMLDivElement, { theme: EventTheme; content: EventContent; card: CardData; qrUrl: string | null }>(
  function EventCardView({ theme, content, card, qrUrl }, ref) {
    const [svg, setSvg] = useState<string | null>(null);
    const { light, dark } = qrColours(theme);
    useEffect(() => {
      let live = true;
      QRCode.toString(qrUrl ?? "https://example.com/preview", { type: "svg", margin: 1, errorCorrectionLevel: "Q", color: { dark, light } }).then(
        (s) => live && setSvg(s.replace("<svg", '<svg width="100%" style="display:block"')),
      );
      return () => {
        live = false;
      };
    }, [qrUrl, dark, light]);

    const { ratio } = CARD_SIZES[card.size];
    const square = card.size === "square";
    const layout = theme.layout ?? "classic";
    const poster = layout === "poster";
    const anyPhoto = theme.portraitImage ?? (layout === "classic" ? null : theme.coverImage);
    const photo = card.showPhoto && !square && layout !== "poster" && layout !== "editorial" ? anyPhoto : null;
    const strip = card.showPhoto && layout === "editorial" ? (theme.coverImage ?? theme.portraitImage) : null;
    const fg = poster ? theme.surface : theme.ink;
    const soft = poster ? `color-mix(in srgb, ${theme.surface} 82%, transparent)` : theme.muted;
    const sans = ["Outfit", "Syne", "DM Sans", "Manrope"].includes(theme.headingFont);
    const d = content.date ? new Date(`${content.date}T12:00:00`) : null;
    const title = content.title || "Your names here";
    const titleSize = (square ? 0.8 : 1) * (title.length > 28 ? 1.9 : title.length > 16 ? 2.4 : 2.9);
    const footer = cardFooter(card, content);
    const art = card.backgroundImage ?? null;
    const showText = card.showText ?? true;
    const qrWidth = `${card.qrSize ?? (square ? 38 : 44)}%`;
    const place = showText ? "center" : { top: "flex-start", center: "center", bottom: "flex-end" }[card.qrPlacement ?? "center"];

    return (
      <div ref={ref} style={{ containerType: "inline-size", width: "100%" }}>
        <div
          style={{
            position: "relative", aspectRatio: `1 / ${ratio}`, background: poster && !art ? theme.accent : theme.bg, color: fg, overflow: "hidden",
            fontFamily: fontStack(theme.bodyFont), fontSize: square ? "3.6cqw" : "4cqw", lineHeight: 1.35,
            display: "flex", flexDirection: "column",
          }}
        >
          {art && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assetUrl(art)} alt="" crossOrigin="anonymous" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: theme.bg, opacity: (card.backgroundDim ?? 0) / 100 }} />
            </>
          )}
          {!art && <Band theme={theme} height="0.75em" />}
          {!art && showText && strip && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assetUrl(strip)} alt="" crossOrigin="anonymous" style={{ display: "block", width: "100%", height: square ? "26%" : "30%", objectFit: "cover", flexShrink: 0 }} />
          )}
          <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: place, textAlign: "center", padding: strip && showText && !art ? "1.1em 2em 1.3em" : square ? "1.6em 2em" : "2em 2.2em", gap: strip && showText && !art ? "0.55em" : square ? "0.7em" : "0.9em" }}>
            {!art && <Surround theme={theme} inset="0.9em" />}
            {showText && photo && (
              <div style={{ width: layout === "arch" ? "6.4em" : "4.6em", height: layout === "arch" ? "8.2em" : "5.8em", padding: "0.18em", border: `1px solid ${theme.accent}`, borderRadius: "999px 999px 0.4em 0.4em", position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(photo)} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "999px 999px 0.3em 0.3em", display: "block" }} />
              </div>
            )}
            {showText && (<>
            {poster && d && (
              <div style={{ position: "relative", border: `2px solid ${fg}`, borderRadius: "0.6em", padding: "0.3em 0.8em 0.4em", lineHeight: 1.05 }}>
                <p style={{ margin: 0, fontSize: "0.7em", letterSpacing: "0.08em" }}>{d.toLocaleDateString("en-GB", { month: "short" })}</p>
                <p style={{ margin: 0, fontFamily: fontStack(theme.headingFont), fontWeight: 700, fontSize: "2.1em", lineHeight: 1 }}>{d.getDate()}</p>
                <p style={{ margin: 0, fontSize: "0.7em" }}>{d.toLocaleDateString("en-GB", { weekday: "short" })}</p>
              </div>
            )}
            <div style={{ position: "relative" }}>
              {card.headline && <p style={{ margin: 0, fontStyle: "italic", color: soft, fontSize: "1em" }}>{card.headline}</p>}
              <p style={{ margin: "0.1em 0 0", fontFamily: fontStack(theme.headingFont), fontWeight: isScript(theme.headingFont) || theme.headingFont === "Italiana" ? 400 : sans || poster ? 700 : 500, fontSize: `${titleSize}em`, lineHeight: 1.08, letterSpacing: theme.headingFont === "Cinzel" ? "0.03em" : "-0.01em", textWrap: "balance" }}>
                {title}
              </p>
              {content.subtitle && <p style={{ margin: "0.35em 0 0", color: poster ? soft : theme.accent, fontSize: "0.9em", letterSpacing: "0.04em" }}>{content.subtitle}</p>}
            </div>
            <div style={{ position: "relative", width: "100%" }}>
              {!poster && <Divider theme={theme} width="6em" />}
            </div>
            </>)}
            <div style={{ position: "relative", width: qrWidth, background: light, padding: "0.45em", borderRadius: "0.45em", boxShadow: `0 0 0 1px color-mix(in srgb, ${theme.accent} 55%, transparent)` }}>
              {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : <div style={{ aspectRatio: "1" }} />}
            </div>
            {showText && card.subline && <p style={{ position: "relative", margin: 0, fontWeight: 500, fontSize: "1em" }}>{card.subline}</p>}
            {showText && footer && <p style={{ position: "relative", margin: 0, color: soft, fontSize: "0.72em", whiteSpace: "pre-line" }}>{footer}</p>}
          </div>
          {!art && <Band theme={theme} height="0.75em" />}
        </div>
      </div>
    );
  },
);
