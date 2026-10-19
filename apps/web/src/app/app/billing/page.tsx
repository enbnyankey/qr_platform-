"use client";

import { useState } from "react";
import { Check, CreditCard, Lock, Smartphone } from "lucide-react";
import { Button, Card, CardHeader, cx, FormError, Label, LoadingBlock, PageHeader } from "@/components/ui";
import { api, formatMoney } from "@/lib/api";
import { BillingInfo, Entitlements, FEATURE_LABELS, limitText, monthsFreeYearly, Plan, useBilling } from "@/lib/billing";
import { useSession } from "@/lib/session";

const STATE_TEXT: Record<Entitlements["state"], string> = {
  trial: "Free trial",
  active: "Active",
  free: "Free plan",
  lapsed: "Plan ended",
};

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—";
}

export default function BillingPage() {
  const { org } = useSession();
  const { data, error } = useBilling(org.id);
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [busy, setBusy] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const isOwner = org.role === "business_owner" || org.role === "super_admin";

  if (error) return <FormError message="Couldn't load billing. Is the API running?" />;
  if (!data) return <LoadingBlock />;
  const e = data.entitlements;

  async function checkout(plan: Plan) {
    setBusy(plan.code);
    setCheckoutError(null);
    try {
      const { checkoutUrl } = await api(`/orgs/${org.id}/billing/checkout`, { method: "POST", json: { planCode: plan.code, interval } });
      window.location.href = checkoutUrl; // provider's hosted payment page (or the test checkout)
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Couldn't start the payment.");
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Plan & billing" description="Your plan, what you've used this month, and payments." />
      <div className="grid gap-6">
        <CurrentPlan e={e} />
        <Usage e={e} />

        <section className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{e.state === "active" ? "Change or renew your plan" : "Choose a plan"}</h2>
              <p className="text-sm text-muted">
                Pay with mobile money (MTN, Telecel, AirtelTigo) or card. Each payment covers one {interval === "month" ? "month" : "year"}; we&apos;ll remind you before it ends.
              </p>
            </div>
            <div className="flex rounded-md border border-line bg-surface p-1" role="tablist" aria-label="Billing period">
              {(["month", "year"] as const).map((i) => (
                <button
                  key={i}
                  role="tab"
                  aria-selected={interval === i}
                  onClick={() => setInterval(i)}
                  className={cx("rounded px-3 py-1.5 text-sm", interval === i ? "bg-ink text-white" : "text-muted hover:text-ink")}
                >
                  {i === "month" ? "Monthly" : "Yearly"}
                </button>
              ))}
            </div>
          </div>
          <FormError message={checkoutError} />
          {!data.provider && <FormError message="Payments aren't set up on the platform yet. Please contact support." />}
          {!isOwner && <p className="text-sm text-muted">Only the business owner can make payments.</p>}
          <div className="grid gap-4 md:grid-cols-3">
            {data.plans.map((p) => (
              <PlanCard
                key={p.code}
                plan={p}
                interval={interval}
                current={e.planCode === p.code && e.state !== "lapsed"}
                disabled={!isOwner || !data.provider}
                busy={busy === p.code}
                onChoose={() => checkout(p)}
                renew={e.planCode === p.code && e.state === "active"}
              />
            ))}
          </div>
          {data.provider?.name === "test" && (
            <p className="text-[13px] text-muted">The platform is in test mode: checkout uses a practice payment page and no real money moves.</p>
          )}
        </section>

        <PaymentHistory payments={data.payments} />
      </div>
    </>
  );
}

function CurrentPlan({ e }: { e: Entitlements }) {
  const tone = e.state === "lapsed" ? "border-bad/30 bg-bad-soft" : e.expiringSoon ? "border-warn/30 bg-warn-soft" : "border-line bg-surface";
  return (
    <Card className={cx("grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-center", tone)}>
      <div className="grid gap-1">
        <Label>Current plan</Label>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold">{e.planName}</h2>
          <span
            className={cx(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              e.state === "active" && "bg-good-soft text-good",
              e.state === "trial" && "bg-accent-soft text-accent",
              e.state === "free" && "bg-sunk text-muted",
              e.state === "lapsed" && "bg-bad-soft text-bad",
            )}
          >
            {STATE_TEXT[e.state]}
          </span>
        </div>
        <p className="text-sm text-muted">
          {e.state === "trial" && <>Your free trial of every {e.planName} feature ends on {fmtDate(e.endsAt)} ({e.daysLeft} days left). Choose a plan to keep them.</>}
          {e.state === "active" && <>Paid until {fmtDate(e.endsAt)} ({e.daysLeft} days left). Renew any time; extra time is added on.</>}
          {e.state === "free" && <>Upgrade for more codes, logos on codes, full stats and print-quality downloads.</>}
          {e.state === "lapsed" && (
            <>
              Your plan ended on {fmtDate(e.endsAt)}, so the Free plan limits apply.{" "}
              {e.lapsePolicy === "lock_editing"
                ? "Your printed codes still work, but editing is locked while you're over the Free limits."
                : "Codes beyond the Free allowance are paused until you renew."}
            </>
          )}
        </p>
      </div>
    </Card>
  );
}

function Meter({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const tone = max > 0 && used >= max ? "bg-bad" : pct >= 80 ? "bg-warn" : "bg-accent";
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="tabular text-muted">
          {used.toLocaleString()} {max > 0 ? `of ${max.toLocaleString()}` : "· unlimited"}
        </span>
      </div>
      <div className="h-2 rounded-full bg-sunk">{max > 0 && <div className={cx("h-full rounded-full", tone)} style={{ width: `${Math.max(pct, 2)}%` }} />}</div>
    </div>
  );
}

function Usage({ e }: { e: Entitlements }) {
  return (
    <Card>
      <CardHeader title="Usage" description="Scans reset on the 1st of each month." />
      <div className="grid gap-5 p-5 md:grid-cols-3">
        <Meter label="QR codes" used={e.usage.qr} max={e.limits.maxQr} />
        <Meter label="Menus" used={e.usage.menus} max={e.limits.maxMenus} />
        <Meter label="Scans this month" used={e.usage.scansThisMonth} max={e.limits.scansPerMonth} />
      </div>
    </Card>
  );
}

function PlanCard({ plan, interval, current, renew, disabled, busy, onChoose }: { plan: Plan; interval: "month" | "year"; current: boolean; renew: boolean; disabled: boolean; busy: boolean; onChoose: () => void }) {
  const price = interval === "month" ? plan.priceMonthlyMinor : plan.priceYearlyMinor;
  const isFree = plan.code === "free";
  return (
    <div className={cx("grid content-start gap-4 rounded-lg border bg-surface p-5", current ? "border-accent ring-2 ring-accent/20" : "border-line")}>
      <div className="grid gap-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">{plan.name}</h3>
          {current && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">Current</span>}
        </div>
        {plan.description && <p className="text-sm text-muted">{plan.description}</p>}
      </div>
      <p className="tabular">
        <span className="font-display text-3xl font-semibold">{isFree ? "Free" : formatMoney(price, plan.currency)}</span>
        {!isFree && <span className="text-sm text-muted"> / {interval}</span>}
      </p>
      {!isFree && interval === "year" && monthsFreeYearly(plan) > 0 && (
        <p className="-mt-3 text-[13px] font-medium text-good">{monthsFreeYearly(plan)} months free compared with monthly</p>
      )}
      <ul className="grid gap-1.5 text-sm">
        <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-accent" /> {limitText(plan.limits.maxQr, "QR codes")}</li>
        <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-accent" /> {limitText(plan.limits.maxMenus, "menus")}</li>
        <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-accent" /> {limitText(plan.limits.scansPerMonth, "scans a month")}</li>
        <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-accent" /> {plan.limits.analyticsDays} days of scan history</li>
        {(Object.keys(FEATURE_LABELS) as (keyof typeof FEATURE_LABELS)[]).map((f) => (
          <li key={f} className={cx("flex gap-2", !plan.features[f] && "text-faint")}>
            {plan.features[f] ? <Check className="mt-0.5 size-4 shrink-0 text-accent" /> : <Lock className="mt-0.5 size-4 shrink-0" />}
            {FEATURE_LABELS[f]}
          </li>
        ))}
      </ul>
      {!isFree && (
        <Button onClick={onChoose} loading={busy} disabled={disabled} variant={current && !renew ? "secondary" : "primary"} className="mt-auto">
          {renew ? `Renew for 1 ${interval}` : current ? `Pay for ${plan.name}` : `Choose ${plan.name}`}
        </Button>
      )}
    </div>
  );
}

function PaymentHistory({ payments }: { payments: BillingInfo["payments"] }) {
  return (
    <Card>
      <CardHeader title="Payment history" />
      {payments.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">No payments yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Plan</th>
                <th className="px-3 py-3 font-medium">Covers</th>
                <th className="px-3 py-3 font-medium">Method</th>
                <th className="px-3 py-3 text-right font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3 whitespace-nowrap">{new Date(p.paidAt ?? p.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-3 py-3">{p.planName} · {p.interval === "month" ? "monthly" : "yearly"}</td>
                  <td className="px-3 py-3 text-muted">{p.periodEnd ? `to ${new Date(p.periodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "—"}</td>
                  <td className="px-3 py-3 text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      {p.channel === "card" ? <CreditCard className="size-3.5" /> : <Smartphone className="size-3.5" />}
                      {p.channel === "card" ? "Card" : p.channel ? "Mobile money" : "—"}
                    </span>
                  </td>
                  <td className="tabular px-3 py-3 text-right">{formatMoney(p.amountMinor, p.currency)}</td>
                  <td className="px-5 py-3">
                    <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", p.status === "success" ? "bg-good-soft text-good" : p.status === "failed" ? "bg-bad-soft text-bad" : "bg-sunk text-muted")}>
                      {p.status === "success" ? "Paid" : p.status === "failed" ? "Failed" : "Cancelled"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
