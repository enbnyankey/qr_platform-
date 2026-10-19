import { z } from "zod";

/**
 * Shapes of an event page. The web app owns the templates (colours, fonts, ornaments);
 * the API checks sizes and formats so a page can't grow without bound or point at
 * files that belong to another business.
 */
export const EVENT_KINDS = ["wedding", "funeral", "birthday", "church", "corporate", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #a8834a.");
const upload = z.string().regex(/^\/uploads\/[0-9a-f-]{36}\/[\w.-]+\.(png|jpe?g|webp)$/i, "Upload the photo as PNG, JPG or WebP.");
const text = (max: number) => z.string().trim().max(max).default("");
const id = z.string().regex(/^[\w-]{1,40}$/);
const fontName = z.string().regex(/^[A-Za-z0-9 ]{2,40}$/);

export const ORNAMENTS = ["frame", "kente", "botanical", "line", "adinkra", "confetti", "orbit", "ankara", "none"] as const;

export const themeSchema = z.object({
  template: z.string().regex(/^[a-z0-9-]{1,40}$/),
  bg: hex,
  surface: hex,
  ink: hex,
  muted: hex,
  accent: hex,
  headingFont: fontName,
  bodyFont: fontName,
  ornament: z.enum(ORNAMENTS).default("line"),
  coverImage: upload.nullable().default(null),
  portraitImage: upload.nullable().default(null),
  // "Make it your own" choices
  backgroundImage: upload.nullable().default(null),
  backgroundDim: z.number().int().min(0).max(85).default(55),
  portraitShape: z.enum(["arch", "circle", "square"]).default("arch"),
  nameScale: z.number().min(0.7).max(1.5).default(1),
  panelStyle: z.enum(["filled", "outline", "plain"]).default("filled"),
  layout: z.enum(["classic", "arch", "editorial", "poster"]).default("classic"),
});

const programmeItem = z.object({ id, time: text(20), title: text(160), detail: text(300) });
const hymnItem = z.object({ id, title: text(160), body: text(4000) });
const personItem = z.object({ id, name: text(120), role: text(120) });

const sectionSchema = z.discriminatedUnion("kind", [
  z.object({ id, kind: z.literal("programme"), title: text(80), items: z.array(programmeItem).max(80).default([]) }),
  z.object({ id, kind: z.literal("text"), title: text(80), body: text(6000) }),
  z.object({ id, kind: z.literal("hymns"), title: text(80), items: z.array(hymnItem).max(40).default([]) }),
  z.object({ id, kind: z.literal("people"), title: text(80), items: z.array(personItem).max(80).default([]) }),
  z.object({ id, kind: z.literal("photos"), title: text(80), images: z.array(upload).max(12).default([]) }),
]);

export const contentSchema = z.object({
  eyebrow: text(80), // "The wedding of", "Celebration of Life"
  title: text(140), // "Ama & Kofi"
  subtitle: text(140), // "1948 – 2026", a hashtag, a theme verse
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
  time: z.string().regex(/^\d{2}:\d{2}$/).or(z.literal("")).default(""),
  venue: text(160),
  address: text(240),
  message: text(2000),
  sections: z.array(sectionSchema).max(20).default([]),
});

export const cardSchema = z.object({
  size: z.enum(["poster", "table", "square"]).default("poster"),
  headline: text(140),
  subline: text(160),
  footer: text(160),
  showPhoto: z.boolean().default(true),
  // The host's own artwork (e.g. made in Canva) behind the card
  backgroundImage: upload.nullable().default(null),
  backgroundDim: z.number().int().min(0).max(85).default(0),
  showText: z.boolean().default(true),
  qrPlacement: z.enum(["top", "center", "bottom"]).default("center"),
  qrSize: z.number().int().min(25).max(70).default(44),
});

export type EventTheme = z.infer<typeof themeSchema>;
export type EventContent = z.infer<typeof contentSchema>;
export type EventCard = z.infer<typeof cardSchema>;

/** Every /uploads/... path used anywhere in the page. */
export function uploadPaths(theme: EventTheme, content: EventContent, card?: EventCard): string[] {
  const paths = [theme.coverImage, theme.portraitImage, theme.backgroundImage, card?.backgroundImage].filter(Boolean) as string[];
  for (const s of content.sections) if (s.kind === "photos") paths.push(...s.images);
  return paths;
}
