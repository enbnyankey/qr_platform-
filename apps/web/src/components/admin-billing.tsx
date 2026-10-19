"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button, Card, cx, Field, FormError, Input, Label, LoadingBlock, Select, Toggle } from "@/components/ui";
import { api, fetcher, formatMoney } from "@/lib/api";
import { FEATURE_LABELS } from "@/lib/billing";

/** Admin → Plans: edit prices, limits and features of each plan. */
export function PlansAdmin() {
  const { data, mutate } = useSWR("/admin/plans", fetcher);
  if (!data) return <LoadingBlock />;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {data.plans.map((p: any) => (
        <PlanEditor key={p.code} plan={p} onSaved={() => mutate()} />
      ))}
    </div>
  );
}

function PlanEditor({ plan, onSaved }: { plan: any; onSaved: () => void }) {
  const [f, setF] = useState({
    name: plan.name,
    description: plan.description ?? "",
    priceMonthly: String(plan.priceMonthlyMinor / 100),
    priceYearly: String(plan.priceYearlyMinor / 100),
    limits: { ...plan.limits },
    features: { ...plan.features },
    isActive: plan.isActive,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isFree = plan.code === "free";
  const num = (v: string) => Number(v.replace(/[^0-9.]/g, "")) || 0;
  const setLimit = (k: string, v: string) => setF({ ...f, limits: { ...f.limits, [k]: Math.floor(num(v)) } });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/admin/plans/${plan.code}`, {
        method: "PUT",
        json: { ...f, description: f.description || null, priceMonthly: num(f.priceMonthly), priceYearly: num(f.priceYearly) },
      });
      onSaved();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={save} className="grid gap-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <Label>{plan.code}</Label>
          <span className="text-xs text-muted">{plan.subscribers} business{plan.subscribers === 1 ? "" : "es"}</span>
        </div>
        <FormError message={error} />
        <Field label="Name" htmlFor={`pl-name-${plan.code}`}>
          <Input id={`pl-name-${plan.code}`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Description" htmlFor={`pl-desc-${plan.code}`}>
          <Input id={`pl-desc-${plan.code}`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        {!isFree && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Monthly (${plan.currency})`} htmlFor={`pl-m-${plan.code}`}>
              <Input id={`pl-m-${plan.code}`} inputMode="decimal" className="tabular" value={f.priceMonthly} onChange={(e) => setF({ ...f, priceMonthly: e.target.value })} />
            </Field>
            <Field label={`Yearly (${plan.currency})`} htmlFor={`pl-y-${plan.code}`}>
              <Input id={`pl-y-${plan.code}`} inputMode="decimal" className="tabular" value={f.priceYearly} onChange={(e) => setF({ ...f, priceYearly: e.target.value })} />
            </Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {([
            ["maxQr", "QR codes"],
            ["maxMenus", "Menus"],
            ["scansPerMonth", "Scans / month"],
            ["analyticsDays", "Days of stats"],
          ] as const).map(([k, label]) => (
            <Field key={k} label={label} htmlFor={`pl-${k}-${plan.code}`}>
              <Input id={`pl-${k}-${plan.code}`} inputMode="numeric" className="tabular" value={f.limits[k]} onChange={(e) => setLimit(k, e.target.value)} />
            </Field>
          ))}
        </div>
        <p className="-mt-2 text-[13px] text-muted">0 means unlimited (except days of stats).</p>
        <div className="grid gap-2">
          {(Object.keys(FEATURE_LABELS) as (keyof typeof FEATURE_LABELS)[]).map((k) => (
            <label key={k} className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" checked={!!f.features[k]} onChange={(e) => setF({ ...f, features: { ...f.features, [k]: e.target.checked } })} className="size-4 accent-[var(--color-accent)]" />
              {FEATURE_LABELS[k]}
            </label>
          ))}
        </div>
        {!isFree && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>Available to buy</span>
            <Toggle checked={f.isActive} label={`${plan.name} available`} onChange={(v) => setF({ ...f, isActive: v })} />
          </div>
        )}
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-good">Saved</span>}
          <Button type="submit" size="sm" loading={saving}>
            Save {plan.name}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Admin → Payments: every checkout attempt across the platform. */
export function PaymentsAdmin() {
  const [status, setStatus] = useState("");
  const { data } = useSWR(`/admin/payments${status ? `?status=${status}` : ""}`, fetcher, { keepPreviousData: true });
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        {["", "success", "pending", "failed", "abandoned"].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={cx("rounded px-2.5 py-1 text-sm", status === s ? "bg-ink text-white" : "text-muted hover:text-ink")}>
            {s ? s[0].toUpperCase() + s.slice(1) : "All"}
          </button>
        ))}
      </div>
      {!data ? (
        <LoadingBlock />
      ) : data.payments.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">No payments.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-3 py-3 font-medium">Business</th>
                <th className="px-3 py-3 font-medium">Plan</th>
                <th className="px-3 py-3 font-medium">Provider</th>
                <th className="px-3 py-3 text-right font-medium">Amount</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.payments.map((p: any) => (
                <tr key={p.id}>
                  <td className="px-5 py-3 whitespace-nowrap text-muted">{new Date(p.createdAt).toLocaleString("en-GB")}</td>
                  <td className="px-3 py-3">{p.orgName}</td>
                  <td className="px-3 py-3">{p.planName} · {p.interval}</td>
                  <td className="px-3 py-3 text-muted">{p.provider}{p.channel ? ` · ${p.channel.replace("_", " ")}` : ""}</td>
                  <td className="tabular px-3 py-3 text-right">{formatMoney(p.amountMinor, p.currency)}</td>
                  <td className="px-3 py-3">
                    <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", p.status === "success" ? "bg-good-soft text-good" : p.status === "failed" ? "bg-bad-soft text-bad" : "bg-sunk text-muted")} title={p.failureNote ?? undefined}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-muted">{p.reference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Small inline form in the Businesses table to give a plan without payment. */
export function GrantPlan({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [planCode, setPlanCode] = useState("pro");
  const [days, setDays] = useState("30");
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Give plan
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      <Select aria-label="Plan" value={planCode} onChange={(e) => setPlanCode(e.target.value)} className="h-8 w-auto! text-[13px]">
        <option value="basic">Basic</option>
        <option value="pro">Pro</option>
      </Select>
      <Input aria-label="Days" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} className="h-8 w-16 text-[13px]" />
      <span className="text-xs text-muted">days</span>
      <Button
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/admin/organizations/${orgId}/subscription`, { method: "POST", json: { planCode, days: Number(days) || 30 } });
            onDone();
            setOpen(false);
          } finally {
            setBusy(false);
          }
        }}
      >
        Give
      </Button>
    </span>
  );
}
