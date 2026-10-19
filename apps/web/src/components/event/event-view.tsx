import type { CSSProperties, ReactNode } from "react";
import { CalendarPlus, MapPin } from "lucide-react";
import { assetUrl } from "@/lib/api";
import {
  calendarFile, EventContent, EventSection, EventTheme, fontStack, formatEventDate, formatTime, isDark, isScript, Layout, mapsLink, monogram,
} from "@/lib/events";
import { Band, Divider, Surround } from "./ornaments";

/**
 * The guest-facing programme page. Used as-is on /e/[id], inside the editor's phone
 * preview and (hero only, shrunk) as template thumbnails, so it never uses viewport
 * breakpoints: it's a single column sized in em from `baseSize`.
 *
 * Four layouts share the same content:
 *   classic   – centred, framed, portrait above the names
 *   arch      – left-aligned, tall arched photo, modern brochure feel
 *   editorial – full-bleed photo with the names on a sheet overlapping it
 *   poster    – a bold colour block with a big date tile
 */
export function EventView({
  theme, content, orgName, showBranding = true, pageUrl = "", preview = false, baseSize = 16, heroOnly = false,
}: {
  theme: EventTheme; content: EventContent; orgName?: string; showBranding?: boolean; pageUrl?: string; preview?: boolean; baseSize?: number; heroOnly?: boolean;
}) {
  const layout: Layout = theme.layout ?? "classic";
  const centred = layout === "classic";
  const body = fontStack(theme.bodyFont);
  const dark = isDark(theme.bg);
  const hairline = `color-mix(in srgb, ${theme.ink} 16%, transparent)`;
  const sections = content.sections.filter(hasContent);
  const bgImage = theme.backgroundImage;
  const dim = (theme.backgroundDim ?? 55) / 100;
  const ctx: Ctx = { theme, content, layout, hairline, preview, pageUrl };

  return (
    <div style={{ position: "relative", background: theme.bg, color: theme.ink, fontFamily: body, fontSize: baseSize, lineHeight: 1.6, minHeight: "100%", colorScheme: dark ? "dark" : "light" }}>
      {bgImage && !heroOnly && (
        // A screen-high photo layer that stays put while the programme scrolls over it.
        <div aria-hidden style={{ position: "sticky", top: 0, height: preview ? "min(720px, calc(100vh - 11rem))" : "100lvh", marginBottom: preview ? "calc(-1 * min(720px, calc(100vh - 11rem)))" : "-100lvh", zIndex: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl(bgImage)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <div style={{ position: "absolute", inset: 0, background: theme.bg, opacity: dim }} />
        </div>
      )}
      <div style={{ position: "relative", zIndex: 1 }}>
        {layout !== "poster" && <Band theme={theme} height="0.85em" />}

        {layout === "arch" ? <ArchHero {...ctx} /> : layout === "editorial" ? <EditorialHero {...ctx} /> : layout === "poster" ? <PosterHero {...ctx} /> : <ClassicHero {...ctx} />}

        {!heroOnly && (
          <>
            {content.message && <Message {...ctx} />}

            {/* ---------- jump links for long programmes ---------- */}
            {sections.length > 2 && (
              <nav aria-label="Sections" style={{ position: preview ? "relative" : "sticky", top: 0, zIndex: 5, background: `color-mix(in srgb, ${theme.bg} 92%, transparent)`, backdropFilter: "blur(6px)", borderTop: `1px solid ${hairline}`, borderBottom: `1px solid ${hairline}` }}>
                <ul style={{ display: "flex", gap: "0.4em", overflowX: "auto", maxWidth: 560, margin: "0 auto", padding: "0.6em 1.25em", listStyle: "none", scrollbarWidth: "none" }}>
                  {sections.map((s) => (
                    <li key={s.id} style={{ flexShrink: 0 }}>
                      {preview ? (
                        <span style={{ display: "block", padding: "0.3em 0.85em", borderRadius: 999, border: `1px solid ${hairline}`, color: theme.ink, fontSize: "0.88em" }}>{s.title || defaultTitle(s)}</span>
                      ) : (
                        <a href={`#s-${s.id}`} style={{ display: "block", padding: "0.3em 0.85em", borderRadius: 999, border: `1px solid ${hairline}`, color: theme.ink, textDecoration: "none", fontSize: "0.88em" }}>
                          {s.title || defaultTitle(s)}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            {/* ---------- sections ---------- */}
            <main style={{ maxWidth: 560, margin: "0 auto", padding: layout === "editorial" ? "0.5em 1.5em 3em" : "1em 1.25em 3em", display: "grid", gap: layout === "editorial" ? 0 : "1.25em" }}>
              {sections.map((s) => (
                <section key={s.id} id={`s-${s.id}`} style={{ scrollMarginTop: "4em", ...panelFor(theme, layout, hairline) }}>
                  <h2 style={{ margin: "0 0 0.8em", textAlign: centred ? "center" : "left", color: theme.ink, lineHeight: 1.2, ...sectionFont(theme, layout) }}>{s.title || defaultTitle(s)}</h2>
                  <SectionBody section={s} theme={theme} hairline={hairline} centred={centred} />
                </section>
              ))}
              {sections.length === 0 && <p style={{ textAlign: "center", color: theme.muted }}>The programme will appear here.</p>}
            </main>

            <footer style={{ textAlign: centred ? "center" : "left", maxWidth: 560, margin: "0 auto", padding: "0 1.5em 2.5em", color: theme.muted, fontSize: "0.85em" }}>
              <Divider theme={theme} width="5em" align={centred ? "center" : "left"} />
              {orgName && <p style={{ margin: "1em 0 0" }}>Shared by {orgName}</p>}
              {showBranding && <p style={{ margin: "0.3em 0 0", opacity: 0.8 }}>Made with QR Platform</p>}
            </footer>
            {layout !== "poster" && <Band theme={theme} height="0.85em" />}
          </>
        )}
      </div>
    </div>
  );
}

interface Ctx { theme: EventTheme; content: EventContent; layout: Layout; hairline: string; preview: boolean; pageUrl: string }

/* ------------------------------------------------------------------ shared bits */

function nameStyle(theme: EventTheme, title: string, factor = 1): CSSProperties {
  const scale = (theme.nameScale ?? 1) * factor;
  const size = (title.length > 26 ? 2.5 : title.length > 16 ? 3 : 3.5) * scale;
  const script = isScript(theme.headingFont);
  const sans = ["Outfit", "Syne", "DM Sans", "Manrope", "Montserrat", "Jost"].includes(theme.headingFont);
  return {
    margin: 0, position: "relative", fontFamily: fontStack(theme.headingFont), fontSize: `${size}em`, lineHeight: script ? 1.15 : 1.02,
    fontWeight: script || theme.headingFont === "Italiana" ? 400 : sans ? 700 : 500, color: "inherit", textWrap: "balance",
    letterSpacing: theme.headingFont === "Cinzel" ? "0.04em" : sans ? "-0.025em" : "-0.01em",
  };
}

function sectionFont(theme: EventTheme, layout: Layout): CSSProperties {
  if (isScript(theme.headingFont)) return { fontFamily: fontStack(theme.bodyFont), fontStyle: "italic", fontWeight: 500, fontSize: "1.45em" };
  const sans = ["Outfit", "Syne", "DM Sans", "Manrope"].includes(theme.headingFont);
  return { fontFamily: fontStack(theme.headingFont), fontWeight: sans ? 700 : 500, fontSize: layout === "editorial" ? "1.9em" : "1.6em", letterSpacing: sans ? "-0.02em" : "0.01em" };
}

function panelFor(theme: EventTheme, layout: Layout, hairline: string): CSSProperties {
  const style = theme.panelStyle ?? "filled";
  if (style === "outline") return { borderRadius: "0.9em", border: `1px solid color-mix(in srgb, ${theme.accent} 60%, transparent)`, padding: "1.6em 1.4em" };
  if (style === "plain") return { padding: "1em 0.4em" };
  if (layout === "editorial") return { borderTop: `1px solid ${hairline}`, padding: "1.8em 0 1.4em" };
  if (layout === "poster") return { background: theme.surface, borderTop: `0.3em solid ${theme.accent}`, borderRadius: "0.4em", padding: "1.4em 1.3em", boxShadow: `0 1px 0 ${hairline}` };
  if (layout === "arch") return { background: theme.surface, borderRadius: "1.4em", padding: "1.6em 1.4em" };
  return { background: theme.surface, border: `1px solid ${hairline}`, borderRadius: "0.9em", padding: "1.6em 1.4em" };
}

function Photo({ src, theme, title, style, radius }: { src: string | null | undefined; theme: EventTheme; title: string; style: CSSProperties; radius: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={assetUrl(src)} alt="" style={{ display: "block", objectFit: "cover", borderRadius: radius, ...style }} />;
  }
  // No photo yet: the couple's or person's initials in a tinted panel.
  return (
    <div aria-hidden style={{ display: "grid", placeItems: "center", borderRadius: radius, background: `color-mix(in srgb, ${theme.accent} 28%, ${theme.surface})`, color: theme.ink, fontFamily: fontStack(theme.headingFont), fontSize: "2.4em", ...style }}>
      {monogram(title)}
    </div>
  );
}

function Details({ theme, content, preview, pageUrl, align, labelled }: Ctx & { align: "center" | "left"; labelled: boolean }) {
  const dateText = formatEventDate(content.date);
  const timeText = formatTime(content.time);
  const ics = calendarFile(content, pageUrl);
  const maps = mapsLink(content);
  if (!dateText && !content.venue) return null;
  const label = (t: string) => labelled && <p style={{ margin: "0 0 0.15em", fontSize: "0.78em", letterSpacing: "0.06em", color: theme.accent, fontWeight: 600 }}>{t}</p>;
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "grid", gridTemplateColumns: labelled && dateText && content.venue ? "1fr 1fr" : "1fr", gap: labelled ? "1em" : "0.15em", textAlign: align }}>
        {dateText && (
          <div>
            {label("When")}
            <p style={{ margin: 0, fontWeight: 500 }}>{dateText}</p>
            {timeText && <p style={{ margin: 0, color: theme.muted }}>{timeText}</p>}
          </div>
        )}
        {content.venue && (
          <div style={{ marginTop: labelled ? 0 : "0.6em" }}>
            {label("Where")}
            <p style={{ margin: 0, fontWeight: 500 }}>{content.venue}</p>
            {content.address && <p style={{ margin: 0, color: theme.muted, fontSize: "0.92em" }}>{content.address}</p>}
          </div>
        )}
      </div>
      {(maps || ics) && (
        <div style={{ display: "flex", gap: "0.6em", justifyContent: align === "center" ? "center" : "flex-start", flexWrap: "wrap", marginTop: "1.2em" }}>
          {maps && <PillLink href={maps} theme={theme} preview={preview} icon={<MapPin size="1em" />} label="Directions" />}
          {ics && <PillLink href={ics} download="event.ics" theme={theme} preview={preview} icon={<CalendarPlus size="1em" />} label="Add to calendar" />}
        </div>
      )}
    </div>
  );
}

function Message({ theme, content, layout }: Ctx) {
  if (layout === "classic") {
    return (
      <p style={{ maxWidth: 440, margin: "0 auto", padding: "0 2em 2.5em", textAlign: "center", fontStyle: "italic", color: theme.muted, fontSize: "1.05em", whiteSpace: "pre-line" }}>
        {content.message}
      </p>
    );
  }
  // Brochure-style pull quote.
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "0.5em 1.6em 2.2em", position: "relative" }}>
      <span aria-hidden style={{ display: "block", fontFamily: "Georgia, serif", fontSize: "3.2em", lineHeight: 0.6, color: theme.accent, height: "0.45em" }}>&ldquo;</span>
      <p style={{ margin: 0, fontStyle: "italic", fontSize: "1.1em", color: theme.ink, opacity: 0.9, whiteSpace: "pre-line", maxWidth: "34em" }}>{content.message}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ heroes */

function ClassicHero(ctx: Ctx) {
  const { theme, content } = ctx;
  const bgImage = theme.backgroundImage;
  const shape = theme.portraitShape ?? "arch";
  const box: CSSProperties =
    shape === "circle" ? { width: "10em", height: "10em" } : shape === "square" ? { width: "10em", height: "11.5em" } : { width: "9.5em", height: "12em" };
  const outer = shape === "circle" ? "50%" : shape === "square" ? "0.6em" : "999px 999px 0.6em 0.6em";
  const inner = shape === "circle" ? "50%" : shape === "square" ? "0.4em" : "999px 999px 0.4em 0.4em";
  return (
    <header style={{ position: "relative", maxWidth: 560, margin: "0 auto", textAlign: "center", overflow: "hidden" }}>
      {theme.coverImage && (
        <div style={{ position: "relative", height: "16em" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl(theme.coverImage)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, transparent 45%, ${theme.bg})` }} />
        </div>
      )}
      <div style={{ position: "relative", padding: theme.coverImage ? "0 2em 2.75em" : "3.5em 2em 2.75em", marginTop: theme.coverImage && theme.portraitImage ? "-5.5em" : 0 }}>
        <Surround theme={theme} inset="1em" />
        {theme.portraitImage && (
          <div style={{ ...box, margin: "0 auto 1.6em", padding: "0.3em", border: `1px solid ${theme.accent}`, borderRadius: outer, background: bgImage ? "transparent" : theme.bg, position: "relative" }}>
            <Photo src={theme.portraitImage} theme={theme} title={content.title} radius={inner} style={{ width: "100%", height: "100%" }} />
          </div>
        )}
        {content.eyebrow && <p style={{ position: "relative", margin: 0, fontStyle: "italic", color: theme.muted, fontSize: "1.05em" }}>{content.eyebrow}</p>}
        <h1 style={{ ...nameStyle(theme, content.title), margin: "0.15em 0 0", color: theme.ink }}>{content.title || "Your names here"}</h1>
        {content.subtitle && <p style={{ position: "relative", margin: "0.6em 0 0", color: theme.accent, fontSize: "1.1em", letterSpacing: "0.04em" }}>{content.subtitle}</p>}
        {(content.date || content.venue) && (
          <div style={{ position: "relative", marginTop: "1.6em" }}>
            <Divider theme={theme} />
            <div style={{ marginTop: "1.2em" }}>
              <Details {...ctx} align="center" labelled={false} />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function ArchHero(ctx: Ctx) {
  const { theme, content } = ctx;
  const photo = theme.portraitImage ?? theme.coverImage;
  return (
    <header style={{ position: "relative", maxWidth: 560, margin: "0 auto", overflow: "hidden", padding: "2em 1.6em 2.4em" }}>
      <Surround theme={theme} inset="1em" />
      {content.eyebrow && <p style={{ position: "relative", margin: 0, fontSize: "0.95em", color: theme.muted, maxWidth: "60%" }}>{content.eyebrow}</p>}
      <div style={{ position: "relative", display: "flex", justifyContent: "flex-end", marginTop: "1em" }}>
        <Photo src={photo} theme={theme} title={content.title} radius="999px 999px 1.4em 1.4em" style={{ width: "74%", aspectRatio: "3 / 4" }} />
      </div>
      <h1 style={{ ...nameStyle(theme, content.title, 0.92), marginTop: "0.5em", color: theme.ink }}>{content.title || "Your names here"}</h1>
      {content.subtitle && (
        <p style={{ position: "relative", margin: "0.5em 0 0", display: "flex", alignItems: "center", gap: "0.7em", color: theme.muted }}>
          {content.subtitle}
          <span aria-hidden style={{ flex: "0 0 3.5em", height: 1, background: theme.ink, opacity: 0.6, position: "relative" }}>
            <span style={{ position: "absolute", right: -1, top: -3, width: 7, height: 7, borderTop: `1px solid ${theme.ink}`, borderRight: `1px solid ${theme.ink}`, transform: "rotate(45deg)" }} />
          </span>
        </p>
      )}
      <div style={{ position: "relative", marginTop: "1.6em" }}>
        <Details {...ctx} align="left" labelled />
      </div>
    </header>
  );
}

function EditorialHero(ctx: Ctx) {
  const { theme, content } = ctx;
  const photo = theme.coverImage ?? theme.portraitImage;
  return (
    <header style={{ position: "relative", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ position: "relative", height: "24em", overflow: "hidden" }}>
        <Photo src={photo} theme={theme} title={content.title} radius="0" style={{ width: "100%", height: "100%", fontSize: "4.5em" }} />
        <div aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, color-mix(in srgb, ${theme.bg} 0%, transparent) 55%, color-mix(in srgb, ${theme.bg} 35%, transparent))` }} />
      </div>
      <div style={{ position: "relative", margin: "-5em 1em 0", background: theme.bg, padding: "1.5em 1.3em 2.2em", borderRadius: "0.15em" }}>
        {content.eyebrow && <p style={{ margin: 0, fontStyle: "italic", color: theme.accent, fontSize: "1.05em" }}>{content.eyebrow}</p>}
        <h1 style={{ ...nameStyle(theme, content.title, 1.08), margin: "0.1em 0 0", color: theme.ink, lineHeight: 0.98 }}>{content.title || "Your names here"}</h1>
        {content.subtitle && <p style={{ margin: "0.6em 0 0", color: theme.muted, fontSize: "1.05em", letterSpacing: "0.03em" }}>{content.subtitle}</p>}
        <div aria-hidden style={{ height: 1, background: ctx.hairline, margin: "1.4em 0 1.2em" }} />
        <Details {...ctx} align="left" labelled />
      </div>
    </header>
  );
}

function PosterHero(ctx: Ctx) {
  const { theme, content } = ctx;
  const on = theme.surface; // text colour on the accent block
  const d = content.date ? new Date(`${content.date}T12:00:00`) : null;
  const photo = theme.portraitImage ?? theme.coverImage;
  return (
    <header style={{ position: "relative", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ position: "relative", background: theme.accent, color: on, padding: "0 1.6em 3.4em", overflow: "hidden" }}>
        <Band theme={theme} height="0.85em" style={{ margin: "0 -1.6em" }} />
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1em", paddingTop: "1.8em" }}>
          {content.eyebrow ? <p style={{ margin: 0, fontSize: "1em", opacity: 0.9, maxWidth: "60%" }}>{content.eyebrow}</p> : <span />}
          {d && (
            <div style={{ border: `2px solid ${on}`, borderRadius: "0.7em", padding: "0.4em 0.9em 0.5em", textAlign: "center", lineHeight: 1.05, flexShrink: 0 }}>
              <p style={{ margin: 0, fontSize: "0.75em", letterSpacing: "0.08em" }}>{d.toLocaleDateString("en-GB", { month: "short" })}</p>
              <p style={{ margin: 0, fontFamily: fontStack(theme.headingFont), fontWeight: 700, fontSize: "2.4em", lineHeight: 1 }}>{d.getDate()}</p>
              <p style={{ margin: 0, fontSize: "0.75em" }}>{d.toLocaleDateString("en-GB", { weekday: "short" })}</p>
            </div>
          )}
        </div>
        <h1 style={{ ...nameStyle(theme, content.title, 1.12), margin: "0.7em 0 0", color: on, lineHeight: 0.95, maxWidth: "92%" }}>{content.title || "Your names here"}</h1>
        {content.subtitle && <p style={{ margin: "0.7em 0 0", opacity: 0.9, fontSize: "1.05em" }}>{content.subtitle}</p>}
      </div>
      {photo && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 1.6em", marginTop: "-3.2em", position: "relative" }}>
          <Photo src={photo} theme={theme} title={content.title} radius="50%" style={{ width: "7.5em", height: "7.5em", border: `0.3em solid ${theme.bg}` }} />
        </div>
      )}
      <div style={{ padding: photo ? "0.4em 1.6em 2.2em" : "1.8em 1.6em 2.2em" }}>
        <Details {...ctx} align="left" labelled />
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ sections */

function PillLink({ href, label, icon, theme, preview, download }: { href: string; label: string; icon: ReactNode; theme: EventTheme; preview: boolean; download?: string }) {
  const style: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "0.4em", padding: "0.45em 1em", borderRadius: 999, border: `1px solid ${theme.accent}`, color: theme.ink, textDecoration: "none", fontSize: "0.88em", cursor: "pointer" };
  const inner = (
    <>
      <span style={{ color: theme.accent, display: "inline-flex" }}>{icon}</span>
      {label}
    </>
  );
  // Previews can sit inside other links (e.g. the events list), so they render no <a>.
  if (preview) return <span style={style}>{inner}</span>;
  return (
    <a href={href} download={download} target={download ? undefined : "_blank"} rel="noreferrer" style={style}>
      {inner}
    </a>
  );
}

export function defaultTitle(s: EventSection) {
  return { programme: "Programme", text: "About", hymns: "Hymns", people: "People", photos: "Photos" }[s.kind];
}

function hasContent(s: EventSection) {
  switch (s.kind) {
    case "programme":
      return s.items.some((i) => i.title.trim());
    case "text":
      return !!s.body.trim();
    case "hymns":
      return s.items.some((i) => i.title.trim() || i.body.trim());
    case "people":
      return s.items.some((i) => i.name.trim());
    case "photos":
      return s.images.length > 0;
  }
}

function SectionBody({ section: s, theme, hairline, centred }: { section: EventSection; theme: EventTheme; hairline: string; centred: boolean }) {
  if (s.kind === "programme") {
    const items = s.items.filter((i) => i.title.trim());
    const hasTimes = items.some((i) => i.time);
    return (
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>
        {items.map((i, n) => (
          <li key={i.id} style={{ display: "grid", gridTemplateColumns: hasTimes ? "4.6em 1em 1fr" : "1em 1fr", columnGap: "0.6em" }}>
            {hasTimes && (
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: theme.accent, fontSize: "0.88em", paddingTop: "0.2em", whiteSpace: "nowrap" }}>{formatTime(i.time)}</span>
            )}
            <span aria-hidden style={{ position: "relative", display: "flex", justifyContent: "center" }}>
              <span style={{ position: "absolute", top: n === 0 ? "0.7em" : 0, bottom: n === items.length - 1 ? "calc(100% - 0.7em)" : 0, width: 1, background: hairline }} />
              <span style={{ position: "relative", marginTop: "0.5em", width: "0.45em", height: "0.45em", borderRadius: "50%", background: i.time ? theme.accent : theme.surface, border: `1px solid ${theme.accent}` }} />
            </span>
            <div style={{ paddingBottom: n === items.length - 1 ? 0 : "0.9em" }}>
              <p style={{ margin: 0, fontWeight: 500 }}>{i.title}</p>
              {i.detail && <p style={{ margin: "0.1em 0 0", color: theme.muted, fontSize: "0.92em" }}>{i.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    );
  }
  if (s.kind === "text") return <p style={{ margin: 0, whiteSpace: "pre-line" }}>{s.body}</p>;
  if (s.kind === "hymns") {
    const items = s.items.filter((i) => i.title.trim() || i.body.trim());
    return (
      <div style={{ display: "grid" }}>
        {items.map((h, n) => (
          <details key={h.id} open={items.length === 1} style={{ borderTop: n ? `1px solid ${hairline}` : "none", padding: "0.7em 0" }}>
            <summary style={{ cursor: "pointer", fontWeight: 500, listStylePosition: "outside" }}>{h.title || `Hymn ${n + 1}`}</summary>
            {h.body && <p style={{ margin: "0.7em 0 0", whiteSpace: "pre-line", color: theme.ink, opacity: 0.88, textAlign: centred ? "center" : "left", lineHeight: 1.75 }}>{h.body}</p>}
          </details>
        ))}
      </div>
    );
  }
  if (s.kind === "people") {
    return (
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(9em, 1fr))", gap: "1em 1.2em", textAlign: centred ? "center" : "left" }}>
        {s.items.filter((i) => i.name.trim()).map((i) => (
          <li key={i.id}>
            <p style={{ margin: 0, fontWeight: 500 }}>{i.name}</p>
            {i.role && <p style={{ margin: 0, color: theme.muted, fontSize: "0.88em" }}>{i.role}</p>}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5em" }}>
      {s.images.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={assetUrl(src)} alt="" style={{ width: "100%", aspectRatio: i === 0 && s.images.length % 2 ? "16/10" : "1", gridColumn: i === 0 && s.images.length % 2 ? "span 2" : undefined, objectFit: "cover", borderRadius: "0.5em", display: "block" }} />
      ))}
    </div>
  );
}
