"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Upload } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { fetcher, uploadFile } from "@/lib/api";
import { QrType, SOCIAL_PLATFORMS } from "@/lib/qr-types";

type Payload = Record<string, any>;
type Errors = Record<string, string[] | undefined>;

/** Type-specific inputs for a QR destination. Controlled: parent owns `payload`. */
export function DestinationForm({ orgId, type, payload, onChange, errors = {} }: { orgId: string; type: QrType; payload: Payload; onChange: (p: Payload) => void; errors?: Errors }) {
  const set = (k: string, v: unknown) => onChange({ ...payload, [k]: v });
  const text = (k: string) => ({ value: payload[k] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value) });
  const err = (k: string) => errors[k]?.[0];

  switch (type) {
    case "url":
      return (
        <Field label="Web address" htmlFor="d-url" error={err("url")} hint="We'll add https:// if you leave it out.">
          <Input id="d-url" type="url" inputMode="url" placeholder="https://yourbusiness.com" {...text("url")} />
        </Field>
      );
    case "menu":
      return <MenuPicker orgId={orgId} value={payload.menuId} onChange={(id) => set("menuId", id)} error={err("menuId")} />;
    case "social":
      return (
        <div className="grid gap-4">
          <Field label="Platform" htmlFor="d-platform">
            <Select id="d-platform" value={payload.platform ?? "instagram"} onChange={(e) => onChange({ ...payload, platform: e.target.value })}>
              {SOCIAL_PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          {payload.platform === "whatsapp" ? (
            <Field label="WhatsApp number" htmlFor="d-phone" error={err("phone") ?? errors._errors?.[0]} hint="Include the country code. Scanning opens a chat with this number.">
              <Input id="d-phone" type="tel" placeholder="+233 24 000 0000" {...text("phone")} />
            </Field>
          ) : (
            <Field label="Profile link" htmlFor="d-surl" error={err("url") ?? errors._errors?.[0]}>
              <Input id="d-surl" type="url" placeholder="https://instagram.com/yourbusiness" {...text("url")} />
            </Field>
          )}
        </div>
      );
    case "contact":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="c-first" error={err("firstName")}>
            <Input id="c-first" {...text("firstName")} />
          </Field>
          <Field label="Last name" htmlFor="c-last">
            <Input id="c-last" {...text("lastName")} />
          </Field>
          <Field label="Phone" htmlFor="c-phone">
            <Input id="c-phone" type="tel" {...text("phone")} />
          </Field>
          <Field label="Email" htmlFor="c-email" error={err("email")}>
            <Input id="c-email" type="email" {...text("email")} />
          </Field>
          <Field label="Company" htmlFor="c-org">
            <Input id="c-org" {...text("organization")} />
          </Field>
          <Field label="Job title" htmlFor="c-title">
            <Input id="c-title" {...text("title")} />
          </Field>
          <Field label="Website" htmlFor="c-web" className="sm:col-span-2">
            <Input id="c-web" {...text("website")} />
          </Field>
          <Field label="Address" htmlFor="c-addr" className="sm:col-span-2">
            <Input id="c-addr" {...text("address")} />
          </Field>
        </div>
      );
    case "location":
      return (
        <div className="grid gap-4">
          <Field label="Address or place name" htmlFor="l-addr" error={errors._errors?.[0]} hint="Or leave this empty and enter exact coordinates below.">
            <Input id="l-addr" placeholder="e.g. Accra Mall, Spintex Road" {...text("address")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Latitude" htmlFor="l-lat" error={err("latitude")}>
              <Input id="l-lat" inputMode="decimal" placeholder="5.6037" value={payload.latitude ?? ""} onChange={(e) => set("latitude", e.target.value === "" ? undefined : Number(e.target.value))} />
            </Field>
            <Field label="Longitude" htmlFor="l-lng" error={err("longitude")}>
              <Input id="l-lng" inputMode="decimal" placeholder="-0.1870" value={payload.longitude ?? ""} onChange={(e) => set("longitude", e.target.value === "" ? undefined : Number(e.target.value))} />
            </Field>
          </div>
        </div>
      );
    case "document":
      return <DocumentInput orgId={orgId} payload={payload} onChange={onChange} error={err("url")} />;
    case "text":
      return (
        <Field label="Message" htmlFor="t-text" error={err("text")} hint="Shown on a simple page when scanned. Up to 1,000 characters.">
          <Textarea id="t-text" rows={4} maxLength={1000} {...text("text")} />
        </Field>
      );
  }
}

function MenuPicker({ orgId, value, onChange, error }: { orgId: string; value?: string; onChange: (id: string) => void; error?: string }) {
  const { data, isValidating } = useSWR(`/orgs/${orgId}/menus`, fetcher);
  const menus: any[] = data?.menus ?? [];
  if (data && !isValidating && menus.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line p-4 text-sm text-muted">
        You don&apos;t have a menu yet.{" "}
        <Link href="/app/menus" className="font-medium text-accent hover:underline">
          Create one
        </Link>{" "}
        and come back.
      </div>
    );
  }
  const selected = menus.find((m) => m.id === value);
  return (
    <Field label="Menu" htmlFor="d-menu" error={error} hint={selected && !selected.isPublished ? "This menu isn't published yet. Publish it so customers can see it." : undefined}>
      <Select id="d-menu" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a menu</option>
        {menus.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.isPublished ? "" : " (draft)"}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function DocumentInput({ orgId, payload, onChange, error }: { orgId: string; payload: Payload; onChange: (p: Payload) => void; error?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { path } = await uploadFile(orgId, file);
      onChange({ ...payload, url: `${window.location.origin}/api${path}`, title: payload.title || file.name });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="grid gap-4">
      <Field label="Document link" htmlFor="doc-url" error={error ?? uploadError ?? undefined} hint="Paste a link (Google Drive, Dropbox…) or upload a PDF up to 5 MB.">
        <div className="flex gap-2">
          <Input id="doc-url" type="url" placeholder="https://…" value={payload.url ?? ""} onChange={(e) => onChange({ ...payload, url: e.target.value })} />
          <Button type="button" variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> Upload
          </Button>
          <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={pick} />
        </div>
      </Field>
      <Field label="Title (optional)" htmlFor="doc-title">
        <Input id="doc-title" value={payload.title ?? ""} onChange={(e) => onChange({ ...payload, title: e.target.value })} />
      </Field>
    </div>
  );
}
