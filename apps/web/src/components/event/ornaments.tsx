import type { CSSProperties } from "react";
import type { EventTheme } from "@/lib/events";

/**
 * Decorations for event pages and QR cards. Everything is sized in `em`, so the same
 * ornament works on the phone page (16px base) and on the card (base set in cqw).
 */

const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

const KENTE = { gold: "#e0a526", green: "#1d6b3c", red: "#b8282e", black: "#151312" };

/** One repeat of a strip-woven kente band, 96 × 16. */
function kenteTile() {
  const k = KENTE;
  const stripesH = [3, 7, 11].map((y) => `<rect x="0" y="${y}" width="32" height="1.6" fill="${k.green}"/>`).join("");
  const stripesV = [44, 50, 56, 62, 68].map((x) => `<rect x="${x}" y="0" width="1.6" height="16" fill="${k.gold}"/>`).join("");
  const checks = [0, 1, 2, 3]
    .flatMap((r) => [0, 1, 2, 3].map((c) => ((r + c) % 2 ? `<rect x="${80 + c * 4}" y="${r * 4}" width="4" height="4" fill="${k.black}"/>` : "")))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="16" viewBox="0 0 96 16" shape-rendering="crispEdges">
<rect width="32" height="16" fill="${k.gold}"/>${stripesH}
<rect x="32" width="8" height="16" fill="${k.black}"/><rect x="35" width="2" height="16" fill="${k.red}"/>
<rect x="40" width="32" height="16" fill="${k.green}"/>${stripesV}
<rect x="72" width="8" height="16" fill="${k.red}"/><rect x="75" width="2" height="16" fill="${k.gold}"/>
<rect x="80" width="16" height="16" fill="${k.gold}"/>${checks}</svg>`;
}

/** Diamond band inspired by woven funeral cloth borders, 24 × 16. */
function diamondTile(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="16" viewBox="0 0 24 16">
<rect y="0" width="24" height="1" fill="${color}"/><rect y="15" width="24" height="1" fill="${color}"/>
<path d="M12 3 L20 8 L12 13 L4 8 Z" fill="none" stroke="${color}" stroke-width="1.2"/>
<path d="M12 6 L15 8 L12 10 L9 8 Z" fill="${color}"/>
<circle cx="0" cy="8" r="1.3" fill="${color}"/><circle cx="24" cy="8" r="1.3" fill="${color}"/></svg>`;
}

/** Wax-print style repeat: half-moons, diamonds and dots in bright party colours, 32 × 16. */
function ankaraTile() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16" viewBox="0 0 32 16">
<rect width="32" height="16" fill="#f2a516"/>
<path d="M0 16 A8 8 0 0 1 16 16 Z" fill="#0e6b6b"/><circle cx="8" cy="16" r="3.2" fill="#f2a516"/>
<path d="M16 8 L24 0 L32 8 L24 16 Z" fill="#d6336c"/><circle cx="24" cy="8" r="2.4" fill="#fff8e6"/>
<circle cx="8" cy="4" r="1.6" fill="#1b1919"/><circle cx="2" cy="2" r="1" fill="#fff8e6"/><circle cx="14" cy="2" r="1" fill="#fff8e6"/></svg>`;
}

export function Band({ theme, height = "0.9em", style }: { theme: EventTheme; height?: string; style?: CSSProperties }) {
  if (theme.ornament !== "kente" && theme.ornament !== "adinkra" && theme.ornament !== "ankara") return null;
  const tile = theme.ornament === "kente" ? kenteTile() : theme.ornament === "ankara" ? ankaraTile() : diamondTile(theme.accent);
  return <div aria-hidden style={{ height, backgroundImage: svgUrl(tile), backgroundRepeat: "repeat-x", backgroundSize: "auto 100%", backgroundPosition: "center", ...style }} />;
}

/** A leafy branch hugging a corner: one stem along the top edge, its mirror down the side. */
export function Sprig({ color, style }: { color: string; style?: CSSProperties }) {
  // Points along the stem (x, y, leaf angle); leaves alternate above and below it.
  const leaves: [number, number, number][] = [
    [26, 8, -35], [40, 9, 30], [54, 11, -30], [68, 13, 35], [82, 16, -25], [96, 20, 40], [108, 24, -20],
  ];
  const branch = (
    <>
      <path d="M4 6 C 40 6, 80 12, 122 30" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      {leaves.map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y + (r < 0 ? -3.5 : 3.5)} rx="7.5" ry="2.8" fill={color} opacity={i % 2 ? 0.7 : 0.95} transform={`rotate(${r} ${x} ${y + (r < 0 ? -3.5 : 3.5)})`} />
      ))}
      <circle cx="126" cy="33" r="2" fill={color} />
    </>
  );
  return (
    <svg aria-hidden viewBox="0 0 130 130" style={style}>
      {branch}
      <g transform="matrix(0 1 1 0 0 0)">{branch}</g>
    </svg>
  );
}

const CONFETTI: [number, number, number, number, number][] = [
  // left %, top %, size em, rotation, colour index
  [6, 10, 0.5, 20, 0], [14, 34, 0.35, 60, 1], [9, 62, 0.45, 15, 2], [20, 82, 0.3, 45, 3], [30, 14, 0.3, 80, 2],
  [72, 8, 0.45, 30, 1], [86, 22, 0.35, 70, 0], [92, 48, 0.5, 10, 3], [80, 70, 0.3, 50, 2], [68, 88, 0.4, 25, 0],
  [44, 6, 0.25, 0, 3], [56, 92, 0.3, 65, 1],
];

export function Confetti({ theme }: { theme: EventTheme }) {
  const colours = [theme.accent, "#f2b84b", "#2f8f7a", "#5468d4"];
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {CONFETTI.map(([l, t, s, r, c], i) => (
        <span
          key={i}
          style={{
            position: "absolute", left: `${l}%`, top: `${t}%`, width: `${s}em`, height: i % 3 === 0 ? `${s}em` : `${s * 2.2}em`,
            background: colours[c], borderRadius: i % 3 === 0 ? "50%" : "0.08em", transform: `rotate(${r}deg)`, opacity: 0.9,
          }}
        />
      ))}
    </div>
  );
}

/** Decorations that sit around a block: frame lines, corner sprigs or confetti. */
export function Surround({ theme, inset = "0.75em" }: { theme: EventTheme; inset?: string }) {
  if (theme.ornament === "frame") {
    return (
      <div aria-hidden style={{ position: "absolute", inset, pointerEvents: "none", border: `1px solid ${theme.accent}`, opacity: 0.85 }}>
        <div style={{ position: "absolute", inset: "0.3em", border: `1px solid ${theme.accent}`, opacity: 0.55 }} />
      </div>
    );
  }
  if (theme.ornament === "botanical") {
    return (
      <>
        <Sprig color={theme.accent} style={{ position: "absolute", top: "0.4em", left: "0.4em", width: "6em", pointerEvents: "none" }} />
        <Sprig color={theme.accent} style={{ position: "absolute", bottom: "0.4em", right: "0.4em", width: "6em", transform: "rotate(180deg)", pointerEvents: "none" }} />
      </>
    );
  }
  if (theme.ornament === "confetti") return <Confetti theme={theme} />;
  if (theme.ornament === "orbit") return (<><Orbit color={theme.ink} /><OrbitDots color={theme.ink} /></>);
  return null;
}

/** Thin circles joined by sweeping lines, like a modern brochure. Sits behind the content. */
export function Orbit({ color }: { color: string }) {
  return (
    <svg aria-hidden viewBox="0 0 100 140" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.55 }}>
      <g fill="none" stroke={color} strokeWidth="0.35" vectorEffect="non-scaling-stroke">
        <path d="M100 6 C 78 10, 70 22, 74 34" vectorEffect="non-scaling-stroke" />
        <path d="M0 112 C 18 104, 30 112, 34 126 S 52 140, 60 140" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

/** The circles for the orbit ornament, drawn in em so they stay round at any size. */
export function OrbitDots({ color }: { color: string }) {
  const ring = (style: CSSProperties, size: string) => (
    <span aria-hidden style={{ position: "absolute", width: size, height: size, borderRadius: "50%", border: `1px solid ${color}`, opacity: 0.6, pointerEvents: "none", ...style }} />
  );
  return (
    <>
      {ring({ top: "1.2em", right: "18%" }, "2.4em")}
      {ring({ top: "0.4em", right: "-0.8em" }, "1.1em")}
      {ring({ bottom: "1.4em", left: "28%" }, "1.6em")}
      {ring({ bottom: "-0.6em", left: "48%" }, "1em")}
    </>
  );
}

/** Small centred divider between the names and the details. */
export function Divider({ theme, width = "9em", align = "center" }: { theme: EventTheme; width?: string; align?: "center" | "left" }) {
  const m = align === "center" ? "0 auto" : "0";
  const c = theme.accent;
  const o = theme.ornament;
  if (o === "none") return <div aria-hidden style={{ height: "0.5em" }} />;
  if (o === "kente" || o === "adinkra" || o === "ankara") return <Band theme={theme} height="0.55em" style={{ width, margin: m }} />;
  if (o === "orbit") {
    return (
      <div aria-hidden style={{ display: "flex", gap: "0.4em", justifyContent: align === "center" ? "center" : "flex-start" }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: "0.38em", height: "0.38em", borderRadius: "50%", background: theme.ink, opacity: 0.85 }} />
        ))}
      </div>
    );
  }
  if (o === "confetti") {
    const colours = [c, "#f2b84b", "#2f8f7a", "#5468d4", c];
    return (
      <div aria-hidden style={{ display: "flex", gap: "0.45em", justifyContent: align === "center" ? "center" : "flex-start" }}>
        {colours.map((col, i) => (
          <span key={i} style={{ width: "0.42em", height: "0.42em", borderRadius: "50%", background: col }} />
        ))}
      </div>
    );
  }
  if (o === "botanical") {
    return (
      <svg aria-hidden viewBox="0 0 160 20" style={{ width, display: "block", margin: m }}>
        <path d="M4 10 H62 M98 10 H156" stroke={c} strokeWidth="1" />
        {[70, 90].map((x, i) => (
          <ellipse key={x} cx={x} cy="10" rx="8" ry="3" fill={c} transform={`rotate(${i ? 25 : -25} ${x} 10)`} />
        ))}
        <circle cx="80" cy="10" r="2.2" fill={c} />
      </svg>
    );
  }
  // frame and line
  return (
    <svg aria-hidden viewBox="0 0 160 12" style={{ width, display: "block", margin: m }}>
      <path d="M2 6 H68 M92 6 H158" stroke={c} strokeWidth="1" />
      {o === "frame" ? <path d="M80 1 L85 6 L80 11 L75 6 Z" fill="none" stroke={c} strokeWidth="1" /> : <circle cx="80" cy="6" r="2.5" fill="none" stroke={c} strokeWidth="1" />}
    </svg>
  );
}
