"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Button, Field, FormError, Input, LoadingBlock, Select } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/session";

const BUSINESS_TYPES = ["Restaurant or café", "Bar or lounge", "Hotel", "Retail shop", "Events organizer", "School or training", "Church or NGO", "Services", "Other"];
const SWATCHES = ["#0d6b5c", "#1d4ed8", "#b4471b", "#7c3aed", "#be123c", "#14201b"];

export default function OnboardingPage() {
  const router = useRouter();
  const { data: me, error: meError, mutate, isValidating } = useMe();
  const [form, setForm] = useState({ name: "", businessType: "", phone: "", address: "", brandColor: SWATCHES[0] });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (meError?.status === 401 && !isValidating) router.replace("/login?next=/onboarding");
  }, [meError, isValidating, router]);

  if (!me) return <LoadingBlock />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    setLoading(true);
    try {
      const { organization } = await api("/orgs", { method: "POST", json: { ...form, businessType: form.businessType || undefined } });
      try {
        localStorage.setItem("qr.currentOrg", organization.id);
      } catch {
        /* ignore */
      }
      await mutate();
      router.replace("/app?welcome=1");
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      else setError(err instanceof Error ? err.message : "Couldn't create the organization.");
      setLoading(false);
    }
  }

  return (
    <AuthShell title={`Welcome, ${me.user.fullName.split(" ")[0]}`} subtitle="Set up your business. You can change all of this later in Settings.">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <FormError message={error} />
        <Field label="Business name" htmlFor="name" error={fields.name?.[0]}>
          <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Asanteman Chop Bar" autoFocus />
        </Field>
        <Field label="What kind of business?" htmlFor="type">
          <Select id="type" value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value })}>
            <option value="">Choose one</option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Business phone" htmlFor="phone" error={fields.phone?.[0]}>
          <Input id="phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+233 30 000 0000" />
        </Field>
        <Field label="Location" htmlFor="address">
          <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="e.g. Oxford Street, Osu, Accra" />
        </Field>
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-[13px] font-medium">Brand colour</legend>
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use ${c}`}
                aria-pressed={form.brandColor === c}
                onClick={() => setForm({ ...form, brandColor: c })}
                className={`size-8 rounded-full border-2 ${form.brandColor === c ? "border-ink" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
            <input type="color" aria-label="Custom colour" value={form.brandColor} onChange={(e) => setForm({ ...form, brandColor: e.target.value })} className="size-8 cursor-pointer rounded-full border border-line bg-transparent" />
          </div>
          <p className="text-[13px] text-muted">Used on your menu pages and code landing pages. Currency defaults to Ghana cedi (GHS).</p>
        </fieldset>
        <Button type="submit" loading={loading} className="mt-2 w-full">
          Create business
        </Button>
      </form>
    </AuthShell>
  );
}
