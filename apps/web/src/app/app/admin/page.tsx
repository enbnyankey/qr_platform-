"use client";

import { useState } from "react";
import useSWR from "swr";
import { Search } from "lucide-react";
import { Button, Card, cx, Field, FormError, Input, Label, LoadingBlock, PageHeader, Select, StatusPill, Textarea, Toggle } from "@/components/ui";
import { TYPE_META, TYPE_ORDER } from "@/lib/qr-types";
import { GrantPlan, PaymentsAdmin, PlansAdmin } from "@/components/admin-billing";
import { api, fetcher, relativeTime } from "@/lib/api";
import { useMe } from "@/lib/session";

const TABS = [
  { id: "organizations", label: "Businesses" },
  { id: "users", label: "Users" },
  { id: "qr-codes", label: "QR codes" },
  { id: "audit", label: "Audit log" },
  { id: "plans", label: "Plans" },
  { id: "payments", label: "Payments" },
  { id: "settings", label: "Platform settings" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function AdminPage() {
  const { data: me } = useMe();
  const [tab, setTab] = useState<Tab>("organizations");
  const [search, setSearch] = useState("");
  const { data: stats } = useSWR(me?.user.isSuperAdmin ? "/admin/stats" : null, fetcher);
  const listKey = me?.user.isSuperAdmin && !["settings", "plans", "payments"].includes(tab) ? `/admin/${tab}${tab !== "audit" && search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}` : null;
  const { data, mutate } = useSWR(listKey, fetcher, { keepPreviousData: true });
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!me) return <LoadingBlock />;
  if (!me.user.isSuperAdmin) return <p className="text-sm text-muted">This area is for platform administrators.</p>;

  async function setStatus(kind: "organizations" | "users" | "qr-codes", id: string, status: "active" | "suspended") {
    setBusyId(id);
    try {
      await api(`/admin/${kind}/${id}`, { method: "PATCH", json: { status } });
      await mutate();
    } finally {
      setBusyId(null);
    }
  }

  const s = stats?.stats;
  return (
    <>
      <PageHeader title="Platform admin" description="Every business, user and code on the platform." />
      {s && (
        <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-5">
          {[
            ["Users", s.users, `+${s.users_7d} this week`],
            ["Businesses", s.organizations],
            ["QR codes", s.qr_codes],
            ["Scans · 7 days", s.scans_7d],
            ["Published menus", s.published_menus],
          ].map(([k, v, sub]) => (
            <div key={k as string} className="grid gap-1 bg-surface p-4">
              <Label>{k}</Label>
              <span className="tabular font-display text-2xl font-semibold">{v}</span>
              {sub && <span className="text-xs text-muted">{sub}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-md border border-line bg-surface p-1" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cx("rounded px-2.5 py-1 text-sm", tab === t.id ? "bg-ink text-white" : "text-muted hover:text-ink")}>
              {t.label}
            </button>
          ))}
        </div>
        {!["audit", "settings", "plans", "payments"].includes(tab) && (
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <Input aria-label="Search" placeholder="Search" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
      </div>

      {tab === "settings" ? (
        <PlatformSettingsForm />
      ) : tab === "plans" ? (
        <PlansAdmin />
      ) : tab === "payments" ? (
        <PaymentsAdmin />
      ) : (
      <Card>
        {!data ? (
          <LoadingBlock />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              {tab === "organizations" && (
                <>
                  <Head cols={["Business", "Owner", "Plan", "Codes", "Scans 7d", "Status", ""]} />
                  <tbody className="divide-y divide-line">
                    {data.organizations.map((o: any) => (
                      <tr key={o.id}>
                        <td className="px-5 py-3 font-medium">{o.name}<div className="font-mono text-xs font-normal text-muted">{o.slug}</div></td>
                        <td className="px-3 py-3 text-muted">{o.owner_email}</td>
                        <td className="px-3 py-3">
                          <span className="capitalize">{o.plan_code}</span>
                          <div className="text-xs text-muted">
                            {o.plan_status === "trialing" ? "trial" : o.plan_status}
                            {o.plan_ends_at ? ` · to ${new Date(o.plan_ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                          </div>
                        </td>
                        <td className="tabular px-3 py-3">{o.qr_count}</td>
                        <td className="tabular px-3 py-3">{o.scans_7d}</td>
                        <td className="px-3 py-3"><StatusPill status={o.status} /></td>
                        <td className="px-5 py-3 text-right">
                          <span className="inline-flex flex-wrap justify-end gap-2">
                            <GrantPlan orgId={o.id} onDone={() => mutate()} />
                            <SuspendButton status={o.status} busy={busyId === o.id} onClick={(st) => setStatus("organizations", o.id, st)} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
              {tab === "users" && (
                <>
                  <Head cols={["Name", "Email", "Businesses", "Verified", "Status", "Joined", ""]} />
                  <tbody className="divide-y divide-line">
                    {data.users.map((u: any) => (
                      <tr key={u.id}>
                        <td className="px-5 py-3 font-medium">{u.full_name}{u.is_super_admin && <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">Admin</span>}</td>
                        <td className="px-3 py-3 text-muted">{u.email}</td>
                        <td className="tabular px-3 py-3">{u.org_count}</td>
                        <td className="px-3 py-3 text-muted">{u.email_verified_at ? "Yes" : "No"}</td>
                        <td className="px-3 py-3"><StatusPill status={u.status} /></td>
                        <td className="px-3 py-3 text-muted">{relativeTime(u.created_at)}</td>
                        <td className="px-5 py-3 text-right">
                          {u.id !== me.user.id && <SuspendButton status={u.status} busy={busyId === u.id} onClick={(st) => setStatus("users", u.id, st)} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
              {tab === "qr-codes" && (
                <>
                  <Head cols={["Code", "Business", "Goes to", "Scans", "Status", ""]} />
                  <tbody className="divide-y divide-line">
                    {data.qrCodes.map((q: any) => (
                      <tr key={q.id}>
                        <td className="px-5 py-3 font-medium">{q.name}<div className="font-mono text-xs font-normal text-muted">{q.code} · {q.type}</div></td>
                        <td className="px-3 py-3 text-muted">{q.org_name}</td>
                        <td className="max-w-72 truncate px-3 py-3 text-muted">{q.target_url ?? "—"}</td>
                        <td className="tabular px-3 py-3">{q.scans}</td>
                        <td className="px-3 py-3"><StatusPill status={q.status} /></td>
                        <td className="px-5 py-3 text-right">
                          <SuspendButton status={q.status} busy={busyId === q.id} onClick={(st) => setStatus("qr-codes", q.id, st)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
              {tab === "audit" && (
                <>
                  <Head cols={["When", "Who", "Action", "Business", "Record"]} />
                  <tbody className="divide-y divide-line">
                    {data.entries.map((a: any) => (
                      <tr key={a.id}>
                        <td className="px-5 py-3 whitespace-nowrap text-muted">{new Date(a.created_at).toLocaleString("en-GB")}</td>
                        <td className="px-3 py-3">{a.actor_email ?? "—"}</td>
                        <td className="px-3 py-3 font-mono text-xs">{a.action}</td>
                        <td className="px-3 py-3 text-muted">{a.org_name ?? "—"}</td>
                        <td className="px-3 py-3 font-mono text-xs text-muted">{a.entity}{a.entity_id ? ` · ${String(a.entity_id).slice(0, 8)}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
            </table>
          </div>
        )}
      </Card>
      )}
    </>
  );
}

function PlatformSettingsForm() {
  const { data, mutate } = useSWR("/admin/settings", fetcher);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (data && !form) setForm(data.settings);
  if (!form) return <LoadingBlock />;

  const toggleType = (t: string) =>
    setForm({ ...form, allowedQrTypes: form.allowedQrTypes.includes(t) ? form.allowedQrTypes.filter((x: string) => x !== t) : [...form.allowedQrTypes, t] });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/admin/settings", { method: "PUT", json: { ...form, maxQrPerOrg: Number(form.maxQrPerOrg) || 0, maxMenusPerOrg: Number(form.maxMenusPerOrg) || 0 } });
      await mutate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="grid max-w-3xl gap-6">
      <FormError message={error} />
      <Card className="grid gap-5 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">New sign-ups</p>
            <p className="text-sm text-muted">When off, existing users can still sign in but nobody can register.</p>
          </div>
          <Toggle checked={form.signupsOpen} label="New sign-ups" onChange={(v) => setForm({ ...form, signupsOpen: v })} />
        </div>
        <div className="grid gap-2">
          <p className="font-medium">QR types businesses can create</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPE_ORDER.map((t) => (
              <label key={t} className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2 text-sm">
                <input type="checkbox" checked={form.allowedQrTypes.includes(t)} onChange={() => toggleType(t)} className="size-4 accent-[var(--color-accent)]" />
                {TYPE_META[t].label}
              </label>
            ))}
          </div>
          <p className="text-[13px] text-muted">Turning a type off only stops new codes of that type. Existing codes keep working.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Max QR codes per business" htmlFor="ps-maxqr" hint="0 means unlimited.">
            <Input id="ps-maxqr" inputMode="numeric" value={form.maxQrPerOrg} onChange={(e) => setForm({ ...form, maxQrPerOrg: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <Field label="Max menus per business" htmlFor="ps-maxmenu" hint="0 means unlimited.">
            <Input id="ps-maxmenu" inputMode="numeric" value={form.maxMenusPerOrg} onChange={(e) => setForm({ ...form, maxMenusPerOrg: e.target.value.replace(/\D/g, "") })} />
          </Field>
        </div>
        <Field label="Announcement banner" htmlFor="ps-ann" hint="Shown at the top of every business dashboard. Leave empty to hide it.">
          <Textarea id="ps-ann" rows={2} maxLength={280} value={form.announcement} onChange={(e) => setForm({ ...form, announcement: e.target.value })} />
        </Field>
        <Field label="Support email" htmlFor="ps-support" hint="Shown to users who need help.">
          <Input id="ps-support" type="email" value={form.supportEmail} onChange={(e) => setForm({ ...form, supportEmail: e.target.value })} />
        </Field>
      </Card>
      <Card className="grid gap-5 p-5">
        <p className="font-medium">Billing</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payment provider" htmlFor="ps-provider" hint="Paystack and Hubtel need their keys in the API's .env file.">
            <Select id="ps-provider" value={form.billingProvider} onChange={(e) => setForm({ ...form, billingProvider: e.target.value })}>
              <option value="test">Test checkout (no real money)</option>
              <option value="paystack">Paystack</option>
              <option value="hubtel">Hubtel</option>
            </Select>
          </Field>
          <Field label="Free trial for new businesses" htmlFor="ps-trial" hint="Days of the trial plan. 0 turns trials off.">
            <div className="flex gap-2">
              <Input id="ps-trial" inputMode="numeric" className="w-20" value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: Number(e.target.value.replace(/\D/g, "")) || 0 })} />
              <Select aria-label="Trial plan" value={form.trialPlan} onChange={(e) => setForm({ ...form, trialPlan: e.target.value })}>
                <option value="pro">of Pro</option>
                <option value="basic">of Basic</option>
              </Select>
            </div>
          </Field>
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[13px] font-medium">When a plan isn&apos;t renewed</legend>
          {([
            ["lock_editing", "Codes keep working, editing is locked", "Printed codes never break. The business can't edit or create beyond the Free limits until they renew."],
            ["pause_extra_codes", "Extra codes pause", "Codes beyond the Free allowance (and scans over the monthly limit) show a 'temporarily unavailable' page until they renew."],
          ] as const).map(([v, title, hint]) => (
            <label key={v} className={cx("flex gap-3 rounded-md border p-3 text-sm", form.lapsePolicy === v ? "border-accent bg-accent-soft/40" : "border-line")}>
              <input type="radio" name="lapse" checked={form.lapsePolicy === v} onChange={() => setForm({ ...form, lapsePolicy: v })} className="mt-1 accent-[var(--color-accent)]" />
              <span>
                <span className="block font-medium">{title}</span>
                <span className="text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </Card>
      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-good">Saved</span>}
        <Button type="submit" loading={saving} disabled={form.allowedQrTypes.length === 0}>
          Save settings
        </Button>
      </div>
    </form>
  );
}


function Head({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
        {cols.map((c, i) => (
          <th key={i} className={cx("py-3 font-medium", i === 0 ? "px-5" : "px-3")}>
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function SuspendButton({ status, busy, onClick }: { status: string; busy: boolean; onClick: (s: "active" | "suspended") => void }) {
  return status === "suspended" ? (
    <Button size="sm" variant="secondary" loading={busy} onClick={() => onClick("active")}>
      Restore
    </Button>
  ) : (
    <Button size="sm" variant="danger" loading={busy} onClick={() => onClick("suspended")}>
      Suspend
    </Button>
  );
}
