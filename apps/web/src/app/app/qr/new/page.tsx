"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { CalendarHeart, Check } from "lucide-react";
import { DestinationForm } from "@/components/destination-form";
import { QrPreview, StyleControls } from "@/components/qr-preview";
import { Button, Card, cx, Field, FormError, Input, PageHeader } from "@/components/ui";
import { api, ApiError, fetcher } from "@/lib/api";
import { DEFAULT_STYLE, QrStyle, QrType, styleProblem, TYPE_META, TYPE_ORDER } from "@/lib/qr-types";
import { canEdit, useSession } from "@/lib/session";
import { useBilling } from "@/lib/billing";

const STEPS = ["Type", "Content", "Design"] as const;

function Wizard() {
  const router = useRouter();
  const params = useSearchParams();
  const { org } = useSession();
  const initialType = (params.get("type") as QrType) || null;
  const [step, setStep] = useState(initialType ? 1 : 0);
  const [type, setType] = useState<QrType | null>(initialType);
  const [name, setName] = useState(params.get("name") ?? "");
  const [payload, setPayload] = useState<Record<string, any>>(params.get("menuId") ? { menuId: params.get("menuId") } : {});
  const [style, setStyle] = useState<QrStyle>(DEFAULT_STYLE);
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const { data: platform } = useSWR("/public/settings", fetcher);
  const { data: billingInfo } = useBilling(org.id);
  const types = TYPE_ORDER.filter((t) => !platform || platform.allowedQrTypes.includes(t));

  if (!canEdit(org.role)) {
    return <p className="text-sm text-muted">Only owners and managers can create QR codes.</p>;
  }

  function chooseType(t: QrType) {
    setType(t);
    setPayload(t === "social" ? { platform: "instagram" } : {});
    if (!name) setName(TYPE_META[t].label);
    setFields({});
    setStep(1);
  }

  async function create() {
    if (!type) return;
    setSaving(true);
    setError(null);
    setFields({});
    try {
      const { qrCode } = await api(`/orgs/${org.id}/qr`, {
        method: "POST",
        json: { name, type, payload, style, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null },
      });
      router.replace(`/app/qr/${qrCode.id}?created=1`);
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields ?? {});
        setError(err.message);
        // Jump back to the step that has the problem
        if (err.fields && Object.keys(err.fields).some((k) => !["fg", "bg", "margin", "ecc"].includes(k))) setStep(1);
      } else setError("Couldn't create the code.");
      setSaving(false);
    }
  }

  const problem = styleProblem(style);

  return (
    <>
      <PageHeader title="New QR code" back={{ href: "/app/qr", label: "QR codes" }} />
      <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <button
              type="button"
              disabled={i > 0 && !type}
              onClick={() => setStep(i)}
              aria-current={step === i ? "step" : undefined}
              className={cx("flex items-center gap-2 rounded-full py-1 pr-3 pl-1", step === i ? "bg-ink text-white" : "text-muted hover:text-ink disabled:opacity-40")}
            >
              <span className={cx("grid size-6 place-items-center rounded-full font-mono text-xs", step === i ? "bg-white/15" : i < step ? "bg-accent text-white" : "bg-sunk")}>
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              {s}
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-line" aria-hidden />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((t) => {
            const { label, description, icon: Icon } = TYPE_META[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => chooseType(t)}
                className={cx("flex items-start gap-3 rounded-lg border bg-surface p-4 text-left transition-colors hover:border-accent", type === t ? "border-accent ring-2 ring-accent/20" : "border-line")}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-soft text-accent">
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block font-medium">{label}</span>
                  <span className="text-sm text-muted">{description}</span>
                </span>
              </button>
            );
          })}
          <Link href="/app/events/new" className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:border-accent">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-soft text-accent">
              <CalendarHeart className="size-5" />
            </span>
            <span>
              <span className="block font-medium">Event page</span>
              <span className="text-sm text-muted">Wedding or funeral programme with a printable card</span>
            </span>
          </Link>
        </div>
      )}

      {step > 0 && type && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="p-5 sm:p-6">
            <div className="grid gap-5">
              <FormError message={error} />
              {step === 1 && (
                <>
                  <Field label="Name" htmlFor="q-name" hint="Only you see this. e.g. “Table 4 menu” or “Flyer – October”." error={fields.name?.[0]}>
                    <Input id="q-name" value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <DestinationForm orgId={org.id} type={type} payload={payload} onChange={setPayload} errors={fields} />
                  <Field label="Expiry (optional)" htmlFor="q-exp" hint="After this time, scans show an “expired” page instead.">
                    <Input id="q-exp" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="sm:max-w-64" />
                  </Field>
                  <div className="flex justify-between gap-2">
                    <Button variant="ghost" onClick={() => setStep(0)}>
                      Back
                    </Button>
                    <Button onClick={() => setStep(2)}>Next: design</Button>
                  </div>
                </>
              )}
              {step === 2 && (
                <>
                  <StyleControls style={style} onChange={setStyle} orgId={org.id} logoLocked={billingInfo ? !billingInfo.entitlements.features.logo : false} />
                  {problem && <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{problem}</p>}
                  <div className="flex justify-between gap-2">
                    <Button variant="ghost" onClick={() => setStep(1)}>
                      Back
                    </Button>
                    <Button onClick={create} loading={saving} disabled={!!problem || !name.trim()}>
                      Create QR code
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Card>
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <Card className="grid justify-items-center gap-3 p-5">
              <QrPreview value={`https://qr.preview/q/${type}`} style={style} size={220} />
              <p className="text-center text-[13px] text-muted">Preview. Your real code gets a unique short link when you create it.</p>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}

export default function NewQrPage() {
  return (
    <Suspense>
      <Wizard />
    </Suspense>
  );
}
