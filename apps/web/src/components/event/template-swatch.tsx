import type { EventContent, EventTheme } from "@/lib/events";
import { EventView } from "./event-view";

/**
 * Miniature of the top of an event page, used in template pickers and the events list.
 * It is the real page (hero only) rendered small, so what you pick is what you get.
 */
export function TemplateSwatch({ theme, content, size = 7 }: { theme: EventTheme; content: Partial<EventContent>; size?: number }) {
  const full: EventContent = { eyebrow: "", title: "", subtitle: "", date: "", time: "", venue: "", address: "", message: "", sections: [], ...content };
  return (
    <div aria-hidden style={{ height: "100%", overflow: "hidden", pointerEvents: "none", background: theme.bg }}>
      <EventView theme={theme} content={full} preview heroOnly baseSize={size} showBranding={false} />
    </div>
  );
}
