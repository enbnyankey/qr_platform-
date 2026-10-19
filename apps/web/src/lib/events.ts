import { Cake, Church, Flower2, Heart, Presentation, Sparkles } from "lucide-react";

/* ------------------------------------------------------------------ types */

export type EventKind = "wedding" | "funeral" | "birthday" | "church" | "corporate" | "other";
export type Ornament = "frame" | "kente" | "botanical" | "line" | "adinkra" | "confetti" | "orbit" | "ankara" | "none";
/** How the top of the page is arranged. */
export type Layout = "classic" | "arch" | "editorial" | "poster";

export interface EventTheme {
  template: string;
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  headingFont: string;
  bodyFont: string;
  ornament: Ornament;
  coverImage: string | null;
  portraitImage: string | null;
  // "Make it your own" settings (optional so older saved pages still load)
  backgroundImage?: string | null; // photo behind the whole page
  backgroundDim?: number; // 0–85: how much the background colour covers the photo
  portraitShape?: "arch" | "circle" | "square";
  nameScale?: number; // 0.7–1.5
  panelStyle?: "filled" | "outline" | "plain";
  layout?: Layout;
}

export const STYLE_DEFAULTS = { backgroundImage: null, backgroundDim: 55, portraitShape: "arch", nameScale: 1, panelStyle: "filled" } as const;

/**
 * Stock photos (Unsplash licence, in /public/samples) shown only in template previews,
 * so people can judge a design with pictures in it. Never saved into an event.
 */
export function samplePhotos(kind: EventKind) {
  return { portraitImage: `/samples/${kind}-portrait.jpg`, coverImage: `/samples/${kind}-cover.jpg` };
}

/** A theme dressed with sample photos for previewing, using the photo each layout shows best. */
export function withSamplePhotos(theme: EventTheme, kind: EventKind): EventTheme {
  const s = samplePhotos(kind);
  const layout = theme.layout ?? "classic";
  return {
    ...theme,
    portraitImage: theme.portraitImage ?? (layout === "editorial" ? null : s.portraitImage),
    coverImage: theme.coverImage ?? (layout === "editorial" ? s.coverImage : null),
  };
}

/** "Ama & Kofi" → "A & K"; "Madam Akosua Mensah" → "AM". Used where there's no photo. */
export function monogram(title: string) {
  const t = title.trim();
  if (!t) return "";
  const pair = t.split(/\s*(?:&|and|\+)\s*/i).filter(Boolean);
  if (pair.length === 2) return `${pair[0][0]} & ${pair[1][0]}`.toUpperCase();
  const words = t.split(/\s+/).filter((w) => !/^(madam|mr|mrs|ms|dr|rev|nana|opanin|maame|the|of)\.?$/i.test(w));
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export interface ProgrammeItem { id: string; time: string; title: string; detail: string }
export interface HymnItem { id: string; title: string; body: string }
export interface PersonItem { id: string; name: string; role: string }

export type EventSection =
  | { id: string; kind: "programme"; title: string; items: ProgrammeItem[] }
  | { id: string; kind: "text"; title: string; body: string }
  | { id: string; kind: "hymns"; title: string; items: HymnItem[] }
  | { id: string; kind: "people"; title: string; items: PersonItem[] }
  | { id: string; kind: "photos"; title: string; images: string[] };

export interface EventContent {
  eyebrow: string;
  title: string;
  subtitle: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  venue: string;
  address: string;
  message: string;
  sections: EventSection[];
}

export interface EventCard {
  size: "poster" | "table" | "square";
  headline: string; // line above the names, e.g. "Welcome to the wedding of"
  subline: string; // "Scan for the programme line-up"
  footer: string; // blank = date and venue
  showPhoto: boolean;
  backgroundImage?: string | null; // the host's own artwork behind the card
  backgroundDim?: number; // 0–85
  showText?: boolean; // false = only the QR code on top of the artwork
  qrPlacement?: "top" | "center" | "bottom";
  qrSize?: number; // % of card width
}

export interface EventRecord {
  id: string;
  kind: EventKind;
  title: string;
  eventDate: string | null;
  theme: EventTheme;
  content: EventContent;
  card: EventCard;
  isPublished: boolean;
  updatedAt: string;
  qrCodes: { id: string; code: string; name: string; status: string; shortUrl: string; scansTotal: number }[];
  scansTotal: number;
}

/* ------------------------------------------------------------------ kinds */

export const KIND_META: Record<EventKind, { label: string; blurb: string; icon: typeof Heart }> = {
  wedding: { label: "Wedding", blurb: "Programme line-up, bridal party, hymns", icon: Heart },
  funeral: { label: "Funeral / Celebration of life", blurb: "Order of service, biography, tributes", icon: Flower2 },
  birthday: { label: "Birthday or party", blurb: "Schedule for the day and a welcome note", icon: Cake },
  church: { label: "Church service", blurb: "Order of service, hymns and readings", icon: Church },
  corporate: { label: "Conference or meeting", blurb: "Agenda and speakers", icon: Presentation },
  other: { label: "Something else", blurb: "Start with a simple programme", icon: Sparkles },
};
export const KIND_ORDER: EventKind[] = ["wedding", "funeral", "birthday", "church", "corporate", "other"];

/* ------------------------------------------------------------------ fonts */

/** Google Fonts specs. `script` faces are only used for big names, never small headings. */
export const FONTS: Record<string, { spec: string; role: "heading" | "body" | "both"; script?: boolean; fallback: string }> = {
  "Cormorant Garamond": { spec: "Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500", role: "both", fallback: "Georgia, serif" },
  "Playfair Display": { spec: "Playfair+Display:ital,wght@0,400;0,600;1,400", role: "heading", fallback: "Georgia, serif" },
  "Great Vibes": { spec: "Great+Vibes", role: "heading", script: true, fallback: "cursive" },
  "Pinyon Script": { spec: "Pinyon+Script", role: "heading", script: true, fallback: "cursive" },
  Cinzel: { spec: "Cinzel:wght@400;600", role: "heading", fallback: "Georgia, serif" },
  "Bodoni Moda": { spec: "Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,600;1,6..96,400", role: "heading", fallback: "Didot, Georgia, serif" },
  "DM Serif Display": { spec: "DM+Serif+Display:ital@0;1", role: "heading", fallback: "Georgia, serif" },
  Fraunces: { spec: "Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400", role: "heading", fallback: "Georgia, serif" },
  "EB Garamond": { spec: "EB+Garamond:ital,wght@0,400;0,500;1,400", role: "both", fallback: "Georgia, serif" },
  Lora: { spec: "Lora:ital,wght@0,400;0,500;1,400", role: "body", fallback: "Georgia, serif" },
  Jost: { spec: "Jost:ital,wght@0,400;0,500;1,400", role: "body", fallback: "system-ui, sans-serif" },
  "DM Sans": { spec: "DM+Sans:ital,wght@0,400;0,500;1,400", role: "body", fallback: "system-ui, sans-serif" },
  Manrope: { spec: "Manrope:wght@400;500;600", role: "body", fallback: "system-ui, sans-serif" },
  Outfit: { spec: "Outfit:wght@300;400;500;600;700", role: "both", fallback: "system-ui, sans-serif" },
  Syne: { spec: "Syne:wght@500;600;700;800", role: "heading", fallback: "system-ui, sans-serif" },
  Italiana: { spec: "Italiana", role: "heading", fallback: "Georgia, serif" },
  Montserrat: { spec: "Montserrat:ital,wght@0,400;0,500;1,400", role: "body", fallback: "system-ui, sans-serif" },
};
export const HEADING_FONTS = Object.keys(FONTS).filter((f) => FONTS[f].role !== "body");
export const BODY_FONTS = Object.keys(FONTS).filter((f) => FONTS[f].role !== "heading");

export const fontStack = (name: string) => `"${name}", ${FONTS[name]?.fallback ?? "serif"}`;
export const isScript = (name: string) => !!FONTS[name]?.script;

export function fontsHref(names: string[]) {
  const specs = [...new Set(names)].filter((n) => FONTS[n]).map((n) => `family=${FONTS[n].spec}`);
  return specs.length ? `https://fonts.googleapis.com/css2?${specs.join("&")}&display=swap` : null;
}

/* -------------------------------------------------------------- templates */

export interface Template {
  id: string;
  name: string;
  note: string;
  kinds: EventKind[]; // shown first for these kinds
  theme: Omit<EventTheme, "template" | "coverImage" | "portraitImage" | keyof typeof STYLE_DEFAULTS>;
}

/** Blank starting point for people who want to design everything themselves. */
export const SCRATCH: Template = {
  id: "scratch", name: "Blank", note: "Plain white page to design yourself", kinds: [],
  theme: { bg: "#ffffff", surface: "#f5f5f3", ink: "#1d1d1f", muted: "#6b6b70", accent: "#1d1d1f", headingFont: "Fraunces", bodyFont: "Manrope", ornament: "none" },
};

export const TEMPLATES: Template[] = [
  {
    id: "mocha-arch", name: "Mocha Arch", note: "Warm brown, arched photo, modern type", kinds: ["wedding", "birthday", "corporate", "other"],
    theme: { layout: "arch", bg: "#7b5a48", surface: "#86644f", ink: "#fbf1e7", muted: "#e6d2c2", accent: "#f2d9c2", headingFont: "Outfit", bodyFont: "Outfit", ornament: "orbit" },
  },
  {
    id: "sage-arch", name: "Sage Arch", note: "Soft green garden wedding", kinds: ["wedding", "church", "birthday"],
    theme: { layout: "arch", bg: "#e7ebe1", surface: "#f5f7f1", ink: "#2b3628", muted: "#687263", accent: "#6f8562", headingFont: "Italiana", bodyFont: "Outfit", ornament: "orbit" },
  },
  {
    id: "editorial-ivory", name: "Editorial", note: "Magazine cover with a full photo", kinds: ["wedding", "corporate", "birthday", "other"],
    theme: { layout: "editorial", bg: "#f4efe7", surface: "#fbf8f2", ink: "#1c1a17", muted: "#6e675d", accent: "#9a6a3b", headingFont: "Bodoni Moda", bodyFont: "Manrope", ornament: "none" },
  },
  {
    id: "midnight-memorial", name: "Midnight Memorial", note: "Navy and soft gold, full photo", kinds: ["funeral", "church"],
    theme: { layout: "editorial", bg: "#0f1724", surface: "#162133", ink: "#eef1f6", muted: "#9ba6b9", accent: "#cdb07a", headingFont: "Cormorant Garamond", bodyFont: "Manrope", ornament: "line" },
  },
  {
    id: "dove-arch", name: "Dove", note: "Gentle grey arch for a memorial", kinds: ["funeral"],
    theme: { layout: "arch", bg: "#eceff1", surface: "#f8f9fa", ink: "#22282d", muted: "#68717a", accent: "#7f909e", headingFont: "Italiana", bodyFont: "Lora", ornament: "orbit" },
  },
  {
    id: "coral-poster", name: "Coral Poster", note: "Bold date and big type", kinds: ["birthday", "corporate", "other"],
    theme: { layout: "poster", bg: "#fff4ec", surface: "#ffffff", ink: "#1e1916", muted: "#6d625b", accent: "#d9472f", headingFont: "Syne", bodyFont: "DM Sans", ornament: "none" },
  },
  {
    id: "ankara-poster", name: "Ankara Fiesta", note: "Bright print, made for a party", kinds: ["birthday", "wedding", "other"],
    theme: { layout: "poster", bg: "#fff8e6", surface: "#ffffff", ink: "#1b1919", muted: "#6a6158", accent: "#0e6b6b", headingFont: "Syne", bodyFont: "Outfit", ornament: "ankara" },
  },
  {
    id: "kente-poster", name: "Kente Royale", note: "Deep green poster with kente trim", kinds: ["wedding", "church", "corporate"],
    theme: { layout: "poster", bg: "#f6f0e2", surface: "#fffaf0", ink: "#1a1915", muted: "#6b6455", accent: "#1c5a39", headingFont: "Playfair Display", bodyFont: "DM Sans", ornament: "kente" },
  },
  {
    id: "ivory", name: "Ivory & Gold", note: "Classic church wedding", kinds: ["wedding", "church", "other"],
    theme: { bg: "#f8f3ea", surface: "#fffcf6", ink: "#2b2520", muted: "#7c6f61", accent: "#a5803f", headingFont: "Cormorant Garamond", bodyFont: "Jost", ornament: "frame" },
  },
  {
    id: "kente", name: "Kente", note: "Gold, green and red strip weave", kinds: ["wedding", "birthday", "other"],
    theme: { bg: "#17130e", surface: "#211b14", ink: "#f6eedd", muted: "#bcae92", accent: "#e0a526", headingFont: "Playfair Display", bodyFont: "DM Sans", ornament: "kente" },
  },
  {
    id: "garden", name: "Garden Blush", note: "Soft pink with leafy corners", kinds: ["wedding", "birthday"],
    theme: { bg: "#f5e9e4", surface: "#fffaf7", ink: "#3b2f2c", muted: "#8a7570", accent: "#62805d", headingFont: "Great Vibes", bodyFont: "Lora", ornament: "botanical" },
  },
  {
    id: "noir", name: "Modern Noir", note: "Black tie, minimal", kinds: ["wedding", "corporate", "other"],
    theme: { bg: "#101012", surface: "#1a1a1d", ink: "#f2efe9", muted: "#a29e97", accent: "#d8cfbf", headingFont: "Bodoni Moda", bodyFont: "Manrope", ornament: "line" },
  },
  {
    id: "serene", name: "Serene", note: "Quiet white and dove grey", kinds: ["funeral", "church"],
    theme: { bg: "#f2f3f1", surface: "#ffffff", ink: "#22292a", muted: "#677171", accent: "#6f817e", headingFont: "Cormorant Garamond", bodyFont: "Manrope", ornament: "line" },
  },
  {
    id: "black-gold", name: "Black & Gold", note: "Celebration of a life well lived", kinds: ["funeral", "church"],
    theme: { bg: "#0f0e0c", surface: "#1a1815", ink: "#f3ecdf", muted: "#b2a78f", accent: "#c9a45c", headingFont: "Cinzel", bodyFont: "EB Garamond", ornament: "frame" },
  },
  {
    id: "kobene", name: "Kobene Red", note: "Red and black mourning cloth", kinds: ["funeral"],
    theme: { bg: "#140d0c", surface: "#211614", ink: "#f7ece7", muted: "#c3a59d", accent: "#c8402f", headingFont: "Cinzel", bodyFont: "DM Sans", ornament: "adinkra" },
  },
  {
    id: "royal", name: "Royal Purple", note: "Homegoing service", kinds: ["funeral", "church"],
    theme: { bg: "#f4f0f7", surface: "#fffdff", ink: "#2a1f36", muted: "#776a86", accent: "#5c3b8a", headingFont: "Playfair Display", bodyFont: "Lora", ornament: "frame" },
  },
  {
    id: "confetti", name: "Confetti", note: "Bright and playful", kinds: ["birthday", "other"],
    theme: { bg: "#fff7ea", surface: "#ffffff", ink: "#24201c", muted: "#78706a", accent: "#d9483a", headingFont: "DM Serif Display", bodyFont: "DM Sans", ornament: "confetti" },
  },
  {
    id: "sanctuary", name: "Sanctuary", note: "Navy and parchment", kinds: ["church", "corporate", "funeral"],
    theme: { bg: "#f2ede3", surface: "#fffcf5", ink: "#1c2a3b", muted: "#5d6977", accent: "#24456f", headingFont: "Cinzel", bodyFont: "EB Garamond", ornament: "line" },
  },
];

export const templateById = (id: string) => (id === SCRATCH.id ? SCRATCH : TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]);

export function templatesFor(kind: EventKind) {
  return [...TEMPLATES.filter((t) => t.kinds.includes(kind)), ...TEMPLATES.filter((t) => !t.kinds.includes(kind))];
}

/** A template's colours, fonts and decoration; photos and layout choices are kept. */
export function themeFromTemplate(t: Template, keep?: Partial<EventTheme>): EventTheme {
  return {
    layout: "classic", ...t.theme, template: t.id, coverImage: keep?.coverImage ?? null, portraitImage: keep?.portraitImage ?? null,
    backgroundImage: keep?.backgroundImage ?? STYLE_DEFAULTS.backgroundImage,
    backgroundDim: keep?.backgroundDim ?? STYLE_DEFAULTS.backgroundDim,
    portraitShape: keep?.portraitShape ?? STYLE_DEFAULTS.portraitShape,
    nameScale: keep?.nameScale ?? STYLE_DEFAULTS.nameScale,
    panelStyle: keep?.panelStyle ?? STYLE_DEFAULTS.panelStyle,
  };
}

export const ORNAMENT_LABELS: Record<Ornament, string> = {
  frame: "Fine frame",
  kente: "Kente strip",
  botanical: "Leaves",
  line: "Simple line",
  adinkra: "Diamond band",
  confetti: "Confetti",
  orbit: "Circles and lines",
  ankara: "Ankara print",
  none: "None",
};

export const LAYOUT_LABELS: Record<Layout, string> = {
  classic: "Classic",
  arch: "Arch",
  editorial: "Editorial",
  poster: "Poster",
};

/* ---------------------------------------------------------- starter content */

export const uid = () => Math.random().toString(36).slice(2, 10);
const p = (time: string, title: string, detail = ""): ProgrammeItem => ({ id: uid(), time, title, detail });

const HYMN_LOVE_DIVINE = `Love divine, all loves excelling,
Joy of heaven, to earth come down;
Fix in us thy humble dwelling;
All thy faithful mercies crown!
Jesus, thou art all compassion,
Pure, unbounded love thou art;
Visit us with thy salvation;
Enter every trembling heart.`;

const HYMN_ABIDE = `Abide with me; fast falls the eventide;
The darkness deepens; Lord, with me abide.
When other helpers fail and comforts flee,
Help of the helpless, O abide with me.`;

export function starterContent(kind: EventKind, title: string, date = ""): EventContent {
  const base = { subtitle: "", date, time: "", venue: "", address: "" };
  switch (kind) {
    case "wedding":
      return {
        ...base, eyebrow: "The wedding of", title: title || "Ama & Kofi", time: "10:00",
        message: "Thank you for being here as we begin our journey together. Akwaaba!",
        sections: [
          { id: uid(), kind: "programme", title: "Programme line-up", items: [
            p("09:30", "Arrival and seating of guests"), p("10:00", "Entrance of the bridal party"), p("", "Opening prayer"),
            p("", "Hymn", "Love Divine, All Loves Excelling"), p("", "Exchange of vows and rings"), p("", "Signing of the register"),
            p("", "Sermon"), p("", "Thanksgiving and offertory"), p("", "Recessional and photographs"), p("13:00", "Reception", "Lunch, toasts and first dance"),
          ] },
          { id: uid(), kind: "people", title: "Bridal party", items: [
            { id: uid(), name: "", role: "Maid of honour" }, { id: uid(), name: "", role: "Best man" },
          ] },
          { id: uid(), kind: "hymns", title: "Hymns", items: [{ id: uid(), title: "Love Divine, All Loves Excelling", body: HYMN_LOVE_DIVINE }] },
        ],
      };
    case "funeral":
      return {
        ...base, eyebrow: "Celebration of life", title: title || "Madam Akosua Mensah", subtitle: "1948 – 2026", time: "08:30",
        message: "A life well lived. Thank you for standing with the family today.",
        sections: [
          { id: uid(), kind: "programme", title: "Order of service", items: [
            p("06:00", "Wake keeping"), p("07:00", "Filing past"), p("08:30", "Burial service"), p("", "Opening hymn", "Abide with Me"),
            p("", "Scripture reading"), p("", "Biography"), p("", "Tributes", "Husband, children, grandchildren, church"),
            p("", "Sermon"), p("", "Commendation and farewell"), p("11:00", "Interment"), p("14:00", "Final funeral rites and thanksgiving"),
          ] },
          { id: uid(), kind: "text", title: "Biography", body: "Write the life story here: where she was born, her work, her faith, her family, and what she meant to everyone who knew her." },
          { id: uid(), kind: "hymns", title: "Hymns", items: [{ id: uid(), title: "Abide with Me", body: HYMN_ABIDE }] },
          { id: uid(), kind: "people", title: "Chief mourners", items: [{ id: uid(), name: "", role: "Husband" }, { id: uid(), name: "", role: "Children" }] },
        ],
      };
    case "birthday":
      return {
        ...base, eyebrow: "Join us to celebrate", title: title || "Esi turns 30", time: "18:00",
        message: "Come hungry, wear your dancing shoes, and bring your best stories.",
        sections: [
          { id: uid(), kind: "programme", title: "The night", items: [
            p("18:00", "Welcome drinks"), p("19:00", "Dinner"), p("20:00", "Toasts and cake cutting"), p("20:30", "Games"), p("21:00", "Dance floor opens"),
          ] },
        ],
      };
    case "church":
      return {
        ...base, eyebrow: "Order of service", title: title || "Harvest Thanksgiving", time: "09:00",
        message: "You are welcome in the house of the Lord.",
        sections: [
          { id: uid(), kind: "programme", title: "Order of service", items: [
            p("09:00", "Call to worship"), p("", "Opening hymn"), p("", "Prayer of thanksgiving"), p("", "Bible readings"),
            p("", "Choir ministration"), p("", "Sermon"), p("", "Harvest offertory"), p("", "Announcements"), p("", "Benediction"),
          ] },
          { id: uid(), kind: "text", title: "Readings", body: "Add the scripture readings for today." },
        ],
      };
    case "corporate":
      return {
        ...base, eyebrow: "Programme", title: title || "Annual General Meeting", time: "09:00",
        message: "Welcome. Wi-Fi and the slides will be shared at the registration desk.",
        sections: [
          { id: uid(), kind: "programme", title: "Agenda", items: [
            p("08:30", "Registration"), p("09:00", "Welcome address"), p("09:30", "Keynote"), p("10:30", "Coffee break"),
            p("11:00", "Panel discussion"), p("12:30", "Lunch"), p("14:00", "Closing remarks"),
          ] },
          { id: uid(), kind: "people", title: "Speakers", items: [{ id: uid(), name: "", role: "Keynote" }] },
        ],
      };
    default:
      return {
        ...base, eyebrow: "You're invited", title: title || "Our event",
        message: "",
        sections: [{ id: uid(), kind: "programme", title: "Programme", items: [p("", "Arrival"), p("", "Main event"), p("", "Closing")] }],
      };
  }
}

export function starterCard(kind: EventKind): EventCard {
  const headline: Record<EventKind, string> = {
    wedding: "Welcome to the wedding of",
    funeral: "In loving memory of",
    birthday: "Welcome to the celebration",
    church: "Welcome to",
    corporate: "Welcome to",
    other: "Welcome to",
  };
  const subline = kind === "funeral" || kind === "church" ? "Scan for the order of service" : "Scan for the programme line-up";
  return { size: "poster", headline: headline[kind], subline, footer: "", showPhoto: true };
}

/** Starter dashboard name, e.g. "Ama & Kofi's wedding". */
export function defaultEventName(kind: EventKind, title: string) {
  const t = title.trim();
  if (!t) return KIND_META[kind].label;
  if (kind === "wedding") return `${t}'s wedding`;
  if (kind === "funeral") return `Funeral of ${t}`;
  return t;
}

/* ---------------------------------------------------------------- helpers */

export function formatEventDate(date: string) {
  if (!date) return "";
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function formatTime(time: string) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
export const isDark = (hex: string) => luminance(hex) < 0.2;

/** Colours for the printed code: always dark modules on a light plate so every phone can read it. */
export function qrColours(theme: EventTheme) {
  const pair = [theme.surface, theme.ink, theme.bg].sort((a, b) => luminance(b) - luminance(a));
  const light = pair[0];
  const dark = pair[pair.length - 1];
  if (contrast(light, dark) >= 7) return { light, dark };
  return { light: "#ffffff", dark: "#111111" };
}

export function calendarFile(content: EventContent, pageUrl: string) {
  if (!content.date) return null;
  const d = content.date.replace(/-/g, "");
  const t = content.time ? content.time.replace(":", "") + "00" : null;
  const esc = (s: string) => s.replace(/[,;\\]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//QR Platform//Events//EN", "BEGIN:VEVENT",
    `UID:${d}-${Math.random().toString(36).slice(2)}@qr-platform`,
    t ? `DTSTART:${d}T${t}` : `DTSTART;VALUE=DATE:${d}`,
    `SUMMARY:${esc([content.eyebrow, content.title].filter(Boolean).join(" "))}`,
    content.venue || content.address ? `LOCATION:${esc([content.venue, content.address].filter(Boolean).join(", "))}` : "",
    `URL:${pageUrl}`, "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join("\r\n"))}`;
}

export function mapsLink(content: EventContent) {
  const q = [content.venue, content.address].filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/**
 * @font-face rules for the given fonts with the font files inlined as data URLs, so an
 * exported PNG uses the real typefaces (an image can't fetch fonts on its own).
 * Only the Latin subsets are kept to keep the export quick.
 */
export async function embeddedFontCss(names: string[]) {
  const href = fontsHref(names);
  if (!href) return "";
  const css = await (await fetch(href)).text();
  const blocks = css.split(/(?=\/\* [\w-]+ \*\/)/).filter((b) => /^\/\* latin(-ext)? \*\//.test(b));
  const out = await Promise.all(
    blocks.map(async (block) => {
      const url = /url\((https:[^)]+)\)/.exec(block)?.[1];
      if (!url) return block;
      const buf = await (await fetch(url)).blob();
      const data = await new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.readAsDataURL(buf);
      });
      return block.replace(url, data);
    }),
  );
  return out.join("\n");
}
