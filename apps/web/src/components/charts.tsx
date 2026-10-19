"use client";

import { useState } from "react";

/**
 * Single-series daily bar chart. Thin bars with rounded tops anchored to the baseline,
 * recessive gridlines, a per-bar hover tooltip, and a text summary for screen readers.
 */
export function DailyBars({ data, height = 160, label = "Scans" }: { data: { day: string; scans: number }[]; height?: number; label?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.scans));
  const niceMax = niceCeil(max);
  const ticks = [0, niceMax / 2, niceMax];
  const total = data.reduce((s, d) => s + d.scans, 0);
  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <figure className="grid gap-2">
      <div className="relative" style={{ height }}>
        {/* gridlines + y labels */}
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${(t / niceMax) * 100}%`, transform: "translateY(50%)" }}>
            <span className="tabular w-8 shrink-0 text-right font-mono text-[10px] text-faint">{t}</span>
            <div className="h-px flex-1 bg-line/70" />
          </div>
        ))}
        <div className="absolute inset-y-0 right-0 left-10 flex items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
          {data.map((d, i) => (
            <div
              key={d.day}
              className="group relative flex h-full flex-1 items-end"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${fmt(d.day)}: ${d.scans} ${label.toLowerCase()}`}
            >
              <div
                className={`mx-auto w-full max-w-6 rounded-t-[4px] transition-colors ${hover === i ? "bg-accent-hover" : "bg-accent"}`}
                style={{ height: d.scans ? `max(2px, ${(d.scans / niceMax) * 100}%)` : 0 }}
              />
              {hover === i && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs shadow-sm">
                  <div className="text-muted">{fmt(d.day)}</div>
                  <div className="tabular font-semibold">
                    {d.scans} {label.toLowerCase()}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="ml-10 flex justify-between font-mono text-[10px] text-faint">
        <span>{data[0] && fmt(data[0].day)}</span>
        <span>{data.at(-1) && fmt(data.at(-1)!.day)}</span>
      </div>
      <figcaption className="sr-only">
        {total} {label.toLowerCase()} over {data.length} days.
      </figcaption>
    </figure>
  );
}

function niceCeil(n: number) {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  const steps = [1, 2, 2.5, 5, 10];
  for (const s of steps) if (s * pow >= n) return s * pow;
  return 10 * pow;
}

/** Ranked horizontal bars for a breakdown (device, OS, browser…). Values sit in ink, not color. */
export function BreakdownList({ rows, total }: { rows: { label: string; scans: number }[]; total: number }) {
  if (!rows.length) return <p className="text-sm text-muted">No scans in this period.</p>;
  return (
    <ul className="grid gap-2.5">
      {rows.map((r) => {
        const pct = total ? Math.round((r.scans / total) * 100) : 0;
        return (
          <li key={r.label} className="grid gap-1">
            <div className="flex justify-between gap-3 text-sm">
              <span className="truncate capitalize">{r.label}</span>
              <span className="tabular text-muted">
                {r.scans} · {pct}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-sunk">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 2)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
