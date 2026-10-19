import Link from "next/link";

export function FinderMark({ className = "size-7" }: { className?: string }) {
  // A QR "finder pattern": the product's mark.
  return (
    <span className={`relative inline-grid place-items-center border-[4px] border-current ${className}`} aria-hidden>
      <span className="size-[38%] bg-current" />
    </span>
  );
}

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-[#10201b] p-10 text-[#e3ebe8] lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-3 text-[#e3ebe8]">
          <FinderMark />
          <span className="font-display text-lg font-semibold">QR Platform</span>
        </Link>
        <div className="relative z-10 max-w-md">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#7fd1bf]">Print once · change anytime</p>
          <h2 className="mt-3 text-4xl font-semibold leading-tight">Every table, poster and flyer becomes a live link you control.</h2>
          <p className="mt-4 text-[15px] text-[#a9bdb5]">
            Point your codes at menus, sites and contact cards. Update where they go without reprinting, and see every scan.
          </p>
        </div>
        <ModuleField />
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 flex items-center gap-2.5 text-ink lg:hidden">
            <FinderMark className="size-6" />
            <span className="font-display text-base font-semibold">QR Platform</span>
          </Link>
          <h1 className="text-[28px] font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

/** Decorative QR-module texture drawn with a deterministic pattern. */
function ModuleField() {
  const cells: boolean[] = [];
  let seed = 7;
  for (let i = 0; i < 21 * 9; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    cells.push(seed / 233280 > 0.55);
  }
  return (
    <div className="pointer-events-none absolute -right-6 bottom-24 grid grid-cols-[repeat(21,14px)] gap-[3px] opacity-20" aria-hidden>
      {cells.map((on, i) => (
        <span key={i} className={`size-[14px] ${on ? "bg-[#7fd1bf]" : ""}`} />
      ))}
    </div>
  );
}
