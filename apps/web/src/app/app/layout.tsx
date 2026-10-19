"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import { BookOpen, CalendarHeart, ChevronDown, ChevronsUpDown, CreditCard, LayoutDashboard, LogOut, Menu as MenuIcon, QrCode, Settings, ShieldCheck, Sparkles, X } from "lucide-react";
import { FinderMark } from "@/components/auth-shell";
import { HelpAssistant } from "@/components/help-assistant";
import { cx, LoadingBlock, Select } from "@/components/ui";
import { api, assetUrl, fetcher } from "@/lib/api";
import { useBilling } from "@/lib/billing";
import { SessionProvider, useMe, useSession } from "@/lib/session";

const NAV = [
  { href: "/app", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/app/qr", label: "QR codes", icon: QrCode },
  { href: "/app/events", label: "Events", icon: CalendarHeart },
  { href: "/app/menus", label: "Menus", icon: BookOpen },
  { href: "/app/billing", label: "Plan & billing", icon: CreditCard },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: me, error, mutate, isValidating } = useMe();

  useEffect(() => {
    if (error?.status === 401 && !isValidating) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (me && me.organizations.length === 0 && !me.user.isSuperAdmin) router.replace("/onboarding");
  }, [error, isValidating, me, pathname, router]);

  if (!me || (me.organizations.length === 0 && !me.user.isSuperAdmin)) {
    return (
      <div className="grid min-h-screen place-items-center">
        {error && error.status !== 401 ? <p className="text-sm text-bad">Couldn&apos;t reach the server. Is the API running?</p> : <LoadingBlock />}
      </div>
    );
  }
  if (me.organizations.length === 0) {
    // Super admin without a business of their own: admin console only.
    return <AdminOnlyShell>{children}</AdminOnlyShell>;
  }

  return (
    <SessionProvider me={me} refresh={mutate}>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}

function AdminOnlyShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!pathname.startsWith("/app/admin")) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="grid max-w-sm gap-3 text-center">
          <FinderMark className="mx-auto size-8" />
          <h1 className="text-2xl font-semibold">You&apos;re signed in as a platform admin</h1>
          <p className="text-sm text-muted">You don&apos;t have a business of your own yet.</p>
          <div className="mt-2 flex justify-center gap-2">
            <Link href="/app/admin" className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white">Open admin console</Link>
            <Link href="/onboarding" className="rounded-md border border-line px-3.5 py-2 text-sm font-medium">Create a business</Link>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <span className="flex items-center gap-2.5">
          <FinderMark className="size-6" />
          <span className="font-display font-semibold">QR Platform · Admin</span>
        </span>
        <SignOut />
      </div>
      {children}
    </div>
  );
}

function SignOut({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      className={cx("flex items-center gap-2 text-sm text-muted hover:text-ink", className)}
      onClick={async () => {
        await api("/auth/logout", { method: "POST" });
        await globalMutate(() => true, undefined, { revalidate: false }); // clear every cached response
        router.replace("/login");
      }}
    >
      <LogOut className="size-4" /> Sign out
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me, org, setOrgId } = useSession();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const nav = me.user.isSuperAdmin ? [...NAV, { href: "/app/admin", label: "Admin", icon: ShieldCheck }] : NAV;

  const sidebar = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/app" className="flex items-center gap-2.5 px-2 pt-1 text-ink">
        <FinderMark className="size-6" />
        <span className="font-display text-base font-semibold">QR Platform</span>
      </Link>

      <div className="relative">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2.5">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assetUrl(org.logoUrl)} alt="" className="size-9 rounded-md object-cover" />
          ) : (
            <span className="grid size-9 shrink-0 place-items-center rounded-md font-display text-sm font-semibold text-white" style={{ background: org.brandColor }}>
              {org.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{org.name}</p>
            <p className="truncate text-xs capitalize text-muted">{org.role.replace("_", " ")}</p>
          </div>
          {me.organizations.length > 1 && <ChevronsUpDown className="size-4 text-muted" aria-hidden />}
        </div>
        {me.organizations.length > 1 && (
          <Select aria-label="Switch business" value={org.id} onChange={(e) => setOrgId(e.target.value)} trigger={<span className="sr-only">Switch business</span>}>
            {me.organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      <nav className="grid gap-0.5" aria-label="Main">
        {nav.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors",
                active ? "bg-accent-soft font-medium text-accent" : "text-ink/80 hover:bg-sunk hover:text-ink",
              )}
            >
              <Icon className="size-[18px]" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

    </div>
  );

  const current = [...nav].reverse().find((n) => (n.exact ? pathname === n.href : pathname.startsWith(n.href)));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen border-r border-line bg-canvas lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-canvas shadow-xl">
            <button aria-label="Close menu" onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-md p-1.5 hover:bg-sunk">
              <X className="size-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        {/* Top navbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-canvas/95 px-4 backdrop-blur sm:px-6 lg:px-10">
          <button aria-label="Open menu" onClick={() => setOpen(true)} className="-ml-1.5 rounded-md p-1.5 hover:bg-sunk lg:hidden">
            <MenuIcon className="size-5" />
          </button>
          <Link href="/app" className="flex items-center gap-2 lg:hidden">
            <FinderMark className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-muted">
              <span className="hidden sm:inline">{org.name}</span>
              {current && (
                <>
                  <span className="mx-2 hidden text-faint sm:inline">/</span>
                  <span className="font-medium text-ink">{current.label}</span>
                </>
              )}
            </p>
          </div>
          <ProfileMenu />
        </header>

        <Announcement />
        <PlanBanner />
        <UpgradeDialog />
        <HelpAssistant />
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}

/** Platform-wide message set by admins in Platform settings. */
function Announcement() {
  const { data } = useSWR("/public/settings", fetcher, { revalidateOnFocus: false });
  if (!data?.announcement) return null;
  return (
    <div role="status" className="border-b border-warn/30 bg-warn-soft px-4 py-2.5 text-sm text-warn sm:px-6 lg:px-10">
      {data.announcement}
    </div>
  );
}

/** Trial countdown, renewal reminder or "plan ended" notice, linking to billing. */
function PlanBanner() {
  const { org } = useSession();
  const pathname = usePathname();
  const { data } = useBilling(org.id);
  const e = data?.entitlements;
  if (!e || pathname.startsWith("/app/billing")) return null;
  let text: string | null = null;
  let tone = "border-accent/30 bg-accent-soft text-accent";
  if (e.state === "trial") text = `You're on a free ${e.planName} trial: ${e.daysLeft} day${e.daysLeft === 1 ? "" : "s"} left.`;
  if (e.state === "active" && e.expiringSoon) {
    text = `Your ${e.planName} plan ends in ${e.daysLeft} day${e.daysLeft === 1 ? "" : "s"}. Renew to keep your features.`;
    tone = "border-warn/30 bg-warn-soft text-warn";
  }
  if (e.state === "lapsed") {
    text = e.lapsePolicy === "lock_editing" ? "Your plan has ended. Printed codes still work, but renew to keep editing." : "Your plan has ended and some codes are paused. Renew to switch them back on.";
    tone = "border-bad/30 bg-bad-soft text-bad";
  }
  if (!text) return null;
  return (
    <div role="status" className={cx("flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 text-sm sm:px-6 lg:px-10", tone)}>
      <span>{text}</span>
      <Link href="/app/billing" className="font-medium underline underline-offset-2">
        {e.state === "trial" ? "See plans" : "Renew now"}
      </Link>
    </div>
  );
}

/** Opens whenever the API says the plan doesn't allow something (HTTP 402). */
function UpgradeDialog() {
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  const { org } = useSession();
  useEffect(() => {
    const onUpgrade = (ev: Event) => {
      setMessage((ev as CustomEvent).detail?.message ?? "Your plan doesn't include this.");
      globalMutate(`/orgs/${org.id}/billing`);
    };
    window.addEventListener("qr:upgrade", onUpgrade);
    return () => window.removeEventListener("qr:upgrade", onUpgrade);
  }, [org.id]);
  useEffect(() => {
    if (!message) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMessage(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [message]);
  if (!message) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
      <div className="absolute inset-0 bg-ink/40" onClick={() => setMessage(null)} />
      <div className="relative grid w-full max-w-sm gap-4 rounded-xl border border-line bg-surface p-6 shadow-xl">
        <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
          <Sparkles className="size-5" />
        </span>
        <div className="grid gap-1.5">
          <h2 id="upgrade-title" className="text-xl font-semibold">Upgrade to continue</h2>
          <p className="text-sm text-muted">{message}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setMessage(null)} className="rounded-md px-3.5 py-2 text-sm hover:bg-sunk">
            Not now
          </button>
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              router.push("/app/billing");
            }}
            className="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            See plans
          </button>
        </div>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

/** Avatar button in the navbar that opens the account menu. */
function ProfileMenu() {
  const router = useRouter();
  const { me, org } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    await api("/auth/logout", { method: "POST" });
    await globalMutate(() => true, undefined, { revalidate: false });
    router.replace("/login");
  }

  const item = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-sunk";
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-full py-1 pr-2 pl-1 hover:bg-sunk"
      >
        <span className="grid size-8 place-items-center rounded-full bg-ink font-display text-[13px] font-semibold text-white">{initials(me.user.fullName)}</span>
        <span className="hidden max-w-40 truncate text-sm font-medium md:block">{me.user.fullName}</span>
        <ChevronDown className={cx("size-4 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 rounded-lg border border-line bg-surface p-1.5 shadow-lg">
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink font-display text-sm font-semibold text-white">{initials(me.user.fullName)}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{me.user.fullName}</p>
              <p className="truncate text-xs text-muted">{me.user.email}</p>
            </div>
          </div>
          <p className="mx-2.5 mb-1.5 rounded-md bg-sunk px-2 py-1 text-xs text-muted">
            <span className="capitalize">{org.role.replace("_", " ")}</span> at {org.name}
          </p>
          <div className="my-1 h-px bg-line" />
          <Link role="menuitem" href="/app/settings" className={item}>
            <Settings className="size-4 text-muted" /> Business settings
          </Link>
          <Link role="menuitem" href="/app/billing" className={item}>
            <CreditCard className="size-4 text-muted" /> Plan & billing
          </Link>
          {me.user.isSuperAdmin && (
            <Link role="menuitem" href="/app/admin" className={item}>
              <ShieldCheck className="size-4 text-muted" /> Admin console
            </Link>
          )}
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" type="button" onClick={signOut} className={cx(item, "text-bad hover:bg-bad-soft")}>
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
