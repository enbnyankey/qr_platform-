"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Check, ImagePlus } from "lucide-react";
import { Button, Card, CardHeader, Field, FormError, Input, LoadingBlock, PageHeader, Select } from "@/components/ui";
import { api, ApiError, assetUrl, fetcher, uploadFile } from "@/lib/api";
import { canEdit, useSession } from "@/lib/session";

const CURRENCIES = [
  ["GHS", "Ghana cedi"],
  ["NGN", "Nigerian naira"],
  ["KES", "Kenyan shilling"],
  ["XOF", "West African CFA franc"],
  ["USD", "US dollar"],
];

export default function SettingsPage() {
  const { org, refresh } = useSession();
  const editable = canEdit(org.role);
  const { data, mutate } = useSWR(`/orgs/${org.id}`, fetcher);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data) setForm({ ...data.organization, email: data.organization.email ?? "", phone: data.organization.phone ?? "", address: data.organization.address ?? "", businessType: data.organization.businessType ?? "" });
  }, [data]);

  if (!form) return <LoadingBlock />;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFields({});
    try {
      await api(`/orgs/${org.id}`, {
        method: "PATCH",
        json: {
          name: form.name, businessType: form.businessType || null, email: form.email || null, phone: form.phone || null,
          address: form.address || null, currency: form.currency, taxRatePercent: Number(form.taxRatePercent) || 0,
          brandColor: form.brandColor, logoUrl: form.logoUrl || null,
        },
      });
      await Promise.all([mutate(), refresh()]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields ?? {});
        setError(err.message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" description="Your business profile. Branding appears on menu pages and code landing pages." />
      <form onSubmit={save} className="grid max-w-3xl gap-6">
        <FormError message={error} />
        <Card>
          <CardHeader title="Business profile" />
          <fieldset disabled={!editable} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Business name" htmlFor="o-name" error={fields.name?.[0]} className="sm:col-span-2">
              <Input id="o-name" value={form.name} onChange={set("name")} />
            </Field>
            <Field label="Business type" htmlFor="o-type">
              <Input id="o-type" value={form.businessType} onChange={set("businessType")} />
            </Field>
            <Field label="Public email" htmlFor="o-email" error={fields.email?.[0]}>
              <Input id="o-email" type="email" value={form.email} onChange={set("email")} />
            </Field>
            <Field label="Phone" htmlFor="o-phone">
              <Input id="o-phone" type="tel" value={form.phone} onChange={set("phone")} />
            </Field>
            <Field label="Address" htmlFor="o-addr">
              <Input id="o-addr" value={form.address} onChange={set("address")} />
            </Field>
          </fieldset>
        </Card>

        <Card>
          <CardHeader title="Branding" />
          <fieldset disabled={!editable} className="grid gap-5 p-5 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className="grid justify-items-start gap-2">
              <span className="text-[13px] font-medium">Logo</span>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="grid size-24 place-items-center overflow-hidden rounded-lg border border-dashed border-line bg-sunk text-muted hover:border-accent hover:text-accent"
                aria-label="Upload logo"
              >
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assetUrl(form.logoUrl)} alt="" className="size-full object-cover" />
                ) : uploading ? (
                  <span className="text-xs">Uploading…</span>
                ) : (
                  <ImagePlus className="size-6" />
                )}
              </button>
              {form.logoUrl && (
                <button type="button" className="text-xs text-muted hover:text-bad" onClick={() => setForm({ ...form, logoUrl: null })}>
                  Remove logo
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploading(true);
                  try {
                    const { path } = await uploadFile(org.id, f);
                    setForm((prev: any) => ({ ...prev, logoUrl: path }));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Upload failed.");
                  } finally {
                    setUploading(false);
                    e.target.value = "";
                  }
                }}
              />
            </div>
            <Field label="Brand colour" htmlFor="o-color" error={fields.brandColor?.[0]}>
              <div className="flex items-center gap-3">
                <input id="o-color" type="color" value={form.brandColor} onChange={set("brandColor")} className="h-10 w-14 cursor-pointer rounded-md border border-line" />
                <Input value={form.brandColor} onChange={set("brandColor")} className="max-w-32 font-mono" aria-label="Brand colour hex" />
              </div>
            </Field>
          </fieldset>
        </Card>

        <Card>
          <CardHeader title="Money" description="Used for menu prices now, and for payments and invoices in later phases." />
          <fieldset disabled={!editable} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Currency" htmlFor="o-cur" hint="Existing menu items keep the currency they were created with.">
              <Select id="o-cur" value={form.currency} onChange={set("currency")}>
                {CURRENCIES.map(([c, n]) => (
                  <option key={c} value={c}>
                    {c} · {n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tax rate (%)" htmlFor="o-tax" hint="Placeholder for now. Applied when ordering and invoicing go live.">
              <Input id="o-tax" inputMode="decimal" value={form.taxRatePercent} onChange={set("taxRatePercent")} className="tabular" />
            </Field>
          </fieldset>
        </Card>

        {editable && (
          <div className="flex items-center justify-end gap-3">
            {saved && (
              <span className="flex items-center gap-1 text-sm text-good">
                <Check className="size-4" /> Saved
              </span>
            )}
            <Button type="submit" loading={saving}>
              Save settings
            </Button>
          </div>
        )}
      </form>
    </>
  );
}
