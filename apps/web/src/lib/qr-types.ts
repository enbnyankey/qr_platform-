import { BookOpen, CalendarHeart, FileText, Globe, MapPin, Share2, Type, UserRound } from "lucide-react";

export type QrType = "url" | "menu" | "social" | "contact" | "location" | "document" | "text" | "event";

export const TYPE_META: Record<QrType, { label: string; description: string; icon: typeof Globe }> = {
  url: { label: "Website", description: "Open any web page", icon: Globe },
  menu: { label: "Digital menu", description: "Show one of your menus", icon: BookOpen },
  social: { label: "Social profile", description: "Instagram, TikTok, WhatsApp…", icon: Share2 },
  contact: { label: "Contact card", description: "Save your details to a phone", icon: UserRound },
  location: { label: "Location", description: "Directions in Google Maps", icon: MapPin },
  document: { label: "Document", description: "A PDF or file link", icon: FileText },
  text: { label: "Plain text", description: "A short message or note", icon: Type },
  event: { label: "Event page", description: "Wedding, funeral or party programme", icon: CalendarHeart },
};

export const TYPE_ORDER: QrType[] = ["url", "menu", "social", "contact", "location", "document", "text"];

export const SOCIAL_PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "x", label: "X (Twitter)" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "snapchat", label: "Snapchat" },
  { value: "other", label: "Other" },
];

/** One-line human summary of where a code goes. */
export function describeDestination(type: QrType, payload: Record<string, any>, targetUrl?: string | null) {
  switch (type) {
    case "contact":
      return [payload.firstName, payload.lastName].filter(Boolean).join(" ") + (payload.phone ? ` · ${payload.phone}` : "");
    case "text":
      return String(payload.text ?? "").slice(0, 80);
    case "location":
      return payload.address || `${payload.latitude}, ${payload.longitude}`;
    case "social":
      return payload.platform === "whatsapp" && payload.phone ? `WhatsApp ${payload.phone}` : payload.url;
    default:
      return targetUrl ?? payload.url ?? "";
  }
}

export interface QrStyle {
  fg: string;
  bg: string;
  margin: number;
  ecc: "L" | "M" | "Q" | "H";
  logo?: { path: string; size: number } | null;
}
export const DEFAULT_STYLE: QrStyle = { fg: "#111111", bg: "#ffffff", margin: 2, ecc: "M" };

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Mirrors the API rule so people see the problem before saving. */
export function styleProblem(s: QrStyle): string | null {
  if (luminance(s.fg) >= luminance(s.bg)) return "The code colour must be darker than the background, or many phones won't read it.";
  if ((luminance(s.bg) + 0.05) / (luminance(s.fg) + 0.05) < 4) return "Increase the contrast between the code and background so phones can scan it.";
  return null;
}
