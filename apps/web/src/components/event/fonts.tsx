import { fontsHref } from "@/lib/events";

/** Loads only the Google Fonts an event uses (React hoists the link into <head>). */
export function EventFonts({ names }: { names: string[] }) {
  const href = fontsHref(names);
  if (!href) return null;
  return <link rel="stylesheet" href={href} precedence="default" />;
}
