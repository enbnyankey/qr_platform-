import { z } from "zod";
import { config } from "../../config";

/** Only web links may be redirect targets; blocks javascript:, data:, file: and similar. */
const webUrl = z
  .string()
  .trim()
  .max(2000)
  .transform((v) => (/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`))
  .refine((v) => {
    try {
      const u = new URL(v);
      const okProtocol = u.protocol === "https:" || u.protocol === "http:";
      return okProtocol && (u.hostname.includes(".") || u.hostname === "localhost");
    } catch {
      return false;
    }
  }, "Enter a valid web address starting with https://");

export const SOCIAL_PLATFORMS = ["instagram", "facebook", "x", "tiktok", "whatsapp", "linkedin", "youtube", "snapchat", "other"] as const;

export const payloadSchemas = {
  url: z.object({ url: webUrl }),
  social: z.object({
    platform: z.enum(SOCIAL_PLATFORMS),
    url: webUrl.optional(),
    phone: z.string().trim().regex(/^\+?[0-9 ]{7,16}$/, "Enter a phone number with country code, e.g. +233 24 000 0000").optional(),
  }).refine((p) => (p.platform === "whatsapp" ? !!p.phone || !!p.url : !!p.url), "Enter the profile link (or the WhatsApp number)."),
  document: z.object({ url: webUrl, title: z.string().trim().max(120).optional() }),
  contact: z.object({
    firstName: z.string().trim().min(1, "Enter a first name.").max(60),
    lastName: z.string().trim().max(60).optional(),
    organization: z.string().trim().max(120).optional(),
    title: z.string().trim().max(80).optional(),
    phone: z.string().trim().max(30).optional(),
    email: z.string().trim().email().optional().or(z.literal("")),
    website: z.string().trim().max(300).optional(),
    address: z.string().trim().max(240).optional(),
  }),
  location: z.object({
    label: z.string().trim().max(120).optional(),
    address: z.string().trim().max(240).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }).refine((p) => !!p.address || (p.latitude !== undefined && p.longitude !== undefined), "Enter an address or both coordinates."),
  menu: z.object({ menuId: z.string().uuid("Choose a menu.") }),
  text: z.object({ text: z.string().trim().min(1, "Enter some text.").max(1000) }),
  event: z.object({ eventId: z.string().uuid("Choose an event.") }),
} as const;

export type QrType = keyof typeof payloadSchemas;
export const QR_TYPES = Object.keys(payloadSchemas) as QrType[];

export function parsePayload(type: QrType, payload: unknown) {
  return payloadSchemas[type].parse(payload) as Record<string, any>;
}

/** The URL the resolver redirects to. Contact and text are served by the resolver itself (null). */
export function targetUrlFor(type: QrType, p: Record<string, any>): string | null {
  switch (type) {
    case "url":
    case "document":
      return p.url;
    case "social":
      if (p.platform === "whatsapp" && p.phone) return `https://wa.me/${String(p.phone).replace(/[^0-9]/g, "")}`;
      return p.url;
    case "location": {
      const q = p.latitude !== undefined && p.longitude !== undefined ? `${p.latitude},${p.longitude}` : p.address;
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    }
    case "menu":
      return `${config.webBaseUrl}/m/${p.menuId}`;
    case "event":
      return `${config.webBaseUrl}/e/${p.eventId}`;
    case "contact":
    case "text":
      return null;
  }
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const styleSchema = z
  .object({
    fg: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#111111"),
    bg: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
    margin: z.number().int().min(0).max(8).default(2),
    ecc: z.enum(["L", "M", "Q", "H"]).default("M"),
    // Optional logo in the centre: an uploaded image path and its width as % of the code.
    logo: z
      .object({ path: z.string().regex(/^\/uploads\/[0-9a-f-]{36}\/[\w.-]+\.(png|jpe?g|webp)$/i, "Upload the logo as PNG, JPG or WebP."), size: z.number().int().min(10).max(25).default(20) })
      .nullable()
      .optional(),
  })
  // A centre logo hides modules, so the code needs the highest error correction.
  .transform((s) => (s.logo ? { ...s, ecc: "H" as const } : s))
  // Many phone scanners can't read light-on-dark or low-contrast codes.
  .refine((s) => luminance(s.fg) < luminance(s.bg), { message: "The code colour must be darker than the background.", path: ["fg"] })
  .refine((s) => (luminance(s.bg) + 0.05) / (luminance(s.fg) + 0.05) >= 4, { message: "Increase the contrast between the code and background so phones can scan it.", path: ["fg"] });
export type QrStyle = z.infer<typeof styleSchema>;
