import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { assetUrl, formatMoney } from "@/lib/api";

/**
 * Customer-facing digital menu, opened by scanning a menu QR code.
 * Server-rendered so it paints fast on slow mobile connections.
 */
const API = process.env.API_INTERNAL_URL ?? "http://localhost:6061";

interface PublicMenu {
  showPlatformBranding?: boolean;
  menu: {
    id: string;
    name: string;
    description: string | null;
    updatedAt: string;
    sections: { id: string; name: string; description: string | null; items: { id: string; name: string; description: string | null; priceMinor: number; currency: string; imageUrl: string | null; isAvailable: boolean }[] }[];
  };
  organization: { name: string; brandColor: string; logoUrl: string | null; currency: string; address: string | null; phone: string | null };
}

async function load(menuId: string): Promise<PublicMenu | null> {
  const res = await fetch(`${API}/public/menus/${encodeURIComponent(menuId)}`, { next: { revalidate: 15 } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Menu API returned ${res.status}`);
  return res.json();
}

export async function generateMetadata({ params }: { params: Promise<{ menuId: string }> }): Promise<Metadata> {
  const data = await load((await params).menuId).catch(() => null);
  if (!data) return { title: "Menu not found" };
  return { title: { absolute: `${data.menu.name} · ${data.organization.name}` }, description: data.menu.description ?? `Menu at ${data.organization.name}` };
}

export default async function PublicMenuPage({ params }: { params: Promise<{ menuId: string }> }) {
  const data = await load((await params).menuId);
  if (!data) notFound();
  const { menu, organization: org } = data;
  const sections = menu.sections.filter((s) => s.items.length > 0);

  return (
    <div className="min-h-screen bg-[#faf9f7] text-ink" style={{ ["--brand" as string]: org.brandColor }}>
      <header className="relative overflow-hidden px-5 pt-10 pb-8 text-white" style={{ background: org.brandColor }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_-10%,rgba(255,255,255,0.22),transparent_55%)]" aria-hidden />
        <div className="relative mx-auto flex max-w-2xl items-center gap-4">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assetUrl(org.logoUrl)} alt="" className="size-16 rounded-xl bg-white object-cover shadow-sm" />
          ) : (
            <span className="grid size-16 place-items-center rounded-xl bg-white/15 font-display text-2xl font-semibold">{org.name.slice(0, 1)}</span>
          )}
          <div className="min-w-0">
            <p className="text-sm text-white/80">{org.name}</p>
            <h1 className="text-3xl font-semibold leading-tight">{menu.name}</h1>
          </div>
        </div>
        {menu.description && <p className="relative mx-auto mt-4 max-w-2xl text-[15px] text-white/85">{menu.description}</p>}
      </header>

      {sections.length > 1 && (
        <nav className="sticky top-0 z-10 border-b border-black/5 bg-[#faf9f7]/95 backdrop-blur" aria-label="Menu sections">
          <ul className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-5 py-3 [scrollbar-width:none]">
            {sections.map((s) => (
              <li key={s.id} className="shrink-0">
                <a href={`#s-${s.id}`} className="block rounded-full border border-black/10 bg-white px-3.5 py-1.5 text-sm font-medium hover:border-[var(--brand)] hover:text-[var(--brand)]">
                  {s.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <main className="mx-auto grid max-w-2xl gap-10 px-5 py-8">
        {sections.length === 0 && <p className="py-10 text-center text-muted">This menu is being updated. Please check back soon.</p>}
        {sections.map((s) => (
          <section key={s.id} id={`s-${s.id}`} className="scroll-mt-20">
            <h2 className="mb-1 text-2xl font-semibold">{s.name}</h2>
            {s.description && <p className="mb-3 text-sm text-muted">{s.description}</p>}
            <ul className="mt-3 divide-y divide-black/5 rounded-xl border border-black/5 bg-white">
              {s.items.map((i) => (
                <li key={i.id} className={`flex gap-4 p-4 ${i.isAvailable ? "" : "opacity-55"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-sans text-[16px] font-semibold tracking-normal">{i.name}</h3>
                      <span className="tabular shrink-0 font-semibold" style={{ color: i.isAvailable ? org.brandColor : undefined }}>
                        {formatMoney(i.priceMinor, i.currency)}
                      </span>
                    </div>
                    {i.description && <p className="mt-1 text-sm leading-relaxed text-muted">{i.description}</p>}
                    {!i.isAvailable && <p className="mt-1.5 inline-block rounded bg-black/5 px-1.5 py-0.5 text-xs font-medium">Sold out today</p>}
                  </div>
                  {i.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={assetUrl(i.imageUrl)} alt="" loading="lazy" className="size-20 shrink-0 rounded-lg object-cover" />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      <footer className="mx-auto max-w-2xl px-5 pt-2 pb-10 text-center text-xs text-muted">
        {[org.address, org.phone].filter(Boolean).join(" · ")}
        <p className="mt-2">Prices in {org.currency}. Updated {new Date(menu.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.</p>
        {data.showPlatformBranding && <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.1em] text-faint">Made with QR Platform</p>}
      </footer>
    </div>
  );
}
