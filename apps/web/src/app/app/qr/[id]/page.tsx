"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Check, Copy, Download, ExternalLink, Lock, Pause, Play, Trash2 } from "lucide-react";
import { BreakdownList, DailyBars } from "@/components/charts";
import { DestinationForm } from "@/components/destination-form";
import { QrPreview, StyleControls } from "@/components/qr-preview";
import { Button, Card, CardHeader, Field, FormError, Input, Label, LoadingBlock, PageHeader, Select, StatusPill } from "@/components/ui";
import { api, ApiError, fetcher, relativeTime } from "@/lib/api";
import { describeDestination, QrStyle, QrType, styleProblem, TYPE_META, TYPE_ORDER } from "@/lib/qr-types";
import { canEdit, useSession } from "@/lib/session";
import { promptUpgrade, useBilling } from "@/lib/billing";

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function QrDetail({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { org } = useSession();
  const editable = canEdit(org.role);
  const key = `/orgs/${org.id}/qr/${id}`;
  const { data, error, mutate } = useSWR(key, fetcher);
  const [days, setDays] = useState(30);
  const { data: stats } = useSWR(`${key}/analytics?days=${days}`, fetcher);
  const { data: billingInfo } = useBilling(org.id);
  const features = billingInfo?.entitlements.features;
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (error?.status === 404) return <p className="text-sm text-muted">This QR code doesn&apos;t exist or belongs to another business.</p>;
  if (!data) return <LoadingBlock />;
  const qr = data.qrCode;
  const meta = TYPE_META[qr.type as QrType];
  const imgBase = `/api${key}/image`;
  const version = new Date(qr.updatedAt).getTime();

  async function patch(body: Record<string, unknown>) {
    const res = await api(key, { method: "PATCH", json: body });
    await mutate();
    return res;
  }

  async function toggleStatus() {
    setBusy(true);
    setActionError(null);
    try {
      await patch({ status: qr.status === "active" ? "inactive" : "active" });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't change status.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setActionError(null);
    try {
      await api(key, { method: "DELETE" });
      router.replace("/app/qr");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Couldn't delete.");
      setConfirmDelete(false);
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        back={{ href: "/app/qr", label: "QR codes" }}
        title={qr.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={qr.effectiveStatus} />
            <span>
              {meta.label} · created {relativeTime(qr.createdAt)}
            </span>
          </span>
        }
        action={
          editable && qr.status !== "suspended" ? (
            <>
              <Button variant="secondary" onClick={toggleStatus} loading={busy && !confirmDelete}>
                {qr.status === "active" ? <Pause className="size-4" /> : <Play className="size-4" />}
                {qr.status === "active" ? "Deactivate" : "Activate"}
              </Button>
              {confirmDelete ? (
                <span className="flex items-center gap-2 rounded-md border border-bad/40 bg-bad-soft px-2 py-1 text-sm text-bad">
                  Delete for good?
                  <Button size="sm" variant="danger" onClick={remove} loading={busy}>
                    Delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </span>
              ) : (
                <Button variant="ghost" aria-label="Delete QR code" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      {params.get("created") && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent">
          <Check className="mt-0.5 size-4 shrink-0" />
          <p>
            Your code is live. Download it and put it on print. If you need to change where it goes later, edit the destination below. The printed code keeps working.
          </p>
        </div>
      )}
      {qr.status === "suspended" && (
        <p className="mb-6 rounded-lg border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">
          This code was suspended by the platform team, so scans show an “unavailable” page. Contact support to restore it.
        </p>
      )}
      <FormError message={actionError} />

      <div className="mt-2 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Left column: the code itself */}
        <div className="grid min-w-0 content-start gap-6">
          <Card className="grid min-w-0 gap-4 p-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${imgBase}?format=png&size=600&v=${version}`} alt={`QR code for ${qr.name}`} className="mx-auto w-full max-w-[260px] rounded-md border border-line" />
            <CopyLink url={qr.shortUrl} />
            <div className="grid grid-cols-2 gap-2">
              <a className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-surface text-sm font-medium hover:border-ink/30" href={`${imgBase}?format=png&size=2048&download=1`}>
                <Download className="size-4" /> PNG
              </a>
              {features && !features.svgDownload ? (
                <button
                  type="button"
                  onClick={() => promptUpgrade("SVG downloads for print and signage are included in the Basic and Pro plans.")}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-dashed border-line bg-surface text-sm font-medium text-muted hover:border-accent hover:text-accent"
                >
                  <Lock className="size-4" /> SVG
                </button>
              ) : (
                <a className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-surface text-sm font-medium hover:border-ink/30" href={`${imgBase}?format=svg&download=1`}>
                  <Download className="size-4" /> SVG
                </a>
              )}
            </div>
            <p className="text-[13px] text-muted">Use SVG for large prints and signage; it stays sharp at any size.</p>
          </Card>
          <Card className="min-w-0">
            <CardHeader title="Destination history" />
            <ul className="divide-y divide-line">
              {data.history.map((h: any, i: number) => (
                <li key={i} className="grid gap-0.5 px-5 py-3 text-sm">
                  <span className="truncate">{describeDestination(h.type, h.payload, h.target_url)}</span>
                  <span className="text-xs text-muted">
                    {i === 0 ? "Current · " : ""}
                    {relativeTime(h.changed_at)}
                    {h.changed_by ? ` by ${h.changed_by}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Right column: analytics + editing */}
        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader
              title="Scans"
              action={
                <Select aria-label="Time range" value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 w-auto! text-[13px]">
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                </Select>
              }
            />
            {!stats ? (
              <LoadingBlock />
            ) : (
              <div className="grid gap-6 p-5">
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    ["Scans", stats.totals.scans],
                    ["Unique visitors", stats.totals.uniqueVisitors],
                    ["All time", stats.totals.allTime],
                    ["Last scan", relativeTime(stats.totals.lastScanAt)],
                  ].map(([k, v]) => (
                    <div key={k as string} className="grid gap-1">
                      <dt>
                        <Label>{k}</Label>
                      </dt>
                      <dd className="tabular font-display text-2xl font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
                {stats.locked?.olderHistory && (
                  <p className="rounded-md bg-sunk px-3 py-2 text-[13px] text-muted">
                    Your plan shows the last {stats.maxDays} days.{" "}
                    <button type="button" className="font-medium text-accent hover:underline" onClick={() => promptUpgrade(`Your current plan keeps ${stats.maxDays} days of scan history. Basic keeps 90 days and Pro a full year.`)}>
                      Upgrade for more history
                    </button>
                  </p>
                )}
                <DailyBars data={stats.daily} />
                <div className="grid gap-6 sm:grid-cols-3">
                  <div className="grid content-start gap-3">
                    <Label>Device</Label>
                    <BreakdownList rows={stats.devices} total={stats.totals.scans} />
                  </div>
                  <div className="grid content-start gap-3">
                    <Label>Operating system</Label>
                    <BreakdownList rows={stats.os} total={stats.totals.scans} />
                  </div>
                  <div className="grid content-start gap-3">
                    <Label>Browser</Label>
                    <BreakdownList rows={stats.browsers} total={stats.totals.scans} />
                  </div>
                  {stats.locked?.location ? (
                    <button
                      type="button"
                      onClick={() => promptUpgrade("Country and city stats are included in the Basic and Pro plans.")}
                      className="grid content-start gap-2 rounded-md border border-dashed border-line p-3 text-left text-sm text-muted hover:border-accent hover:text-accent sm:col-span-2"
                    >
                      <span className="flex items-center gap-2 font-medium"><Lock className="size-4" /> Country and city</span>
                      <span>See where your scans come from on Basic and Pro.</span>
                    </button>
                  ) : (
                    <>
                      <div className="grid content-start gap-3">
                        <Label>Country</Label>
                        <BreakdownList rows={stats.countries} total={stats.totals.scans} />
                      </div>
                      <div className="grid content-start gap-3">
                        <Label>City</Label>
                        <BreakdownList rows={stats.cities} total={stats.totals.scans} />
                      </div>
                    </>
                  )}
                </div>
                <p className="-mt-2 text-[13px] text-muted">Location is approximate and comes from the network, never from GPS. It appears once the platform runs behind Cloudflare or Vercel.</p>
                {stats.totals.blocked > 0 && (
                  <p className="text-[13px] text-muted">
                    {stats.totals.blocked} scan{stats.totals.blocked === 1 ? "" : "s"} landed while the code was inactive, expired or suspended.
                  </p>
                )}
              </div>
            )}
          </Card>

          {editable && qr.status !== "suspended" && (
            <>
              <EditDestination orgId={org.id} qr={qr} onSave={patch} />
              <EditDesign orgId={org.id} qr={qr} onSave={patch} logoLocked={features ? !features.logo : false} />
              <EditSettings qr={qr} onSave={patch} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-1 rounded-md border border-line bg-sunk p-1 pl-3">
      <span className="min-w-0 flex-1 truncate font-mono text-xs" title={url}>
        {url}
      </span>
      <button
        type="button"
        className="rounded p-1.5 text-muted hover:bg-surface hover:text-ink"
        aria-label="Copy link"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked */
          }
        }}
      >
        {copied ? <Check className="size-4 text-good" /> : <Copy className="size-4" />}
      </button>
      <a href={url} target="_blank" rel="noreferrer" className="rounded p-1.5 text-muted hover:bg-surface hover:text-ink" aria-label="Open link">
        <ExternalLink className="size-4" />
      </a>
    </div>
  );
}

function useSaver(onSave: (b: Record<string, unknown>) => Promise<unknown>) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState(false);
  async function save(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    setFields({});
    setSaved(false);
    try {
      await onSave(body);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields ?? {});
        setError(e.message);
      } else setError("Couldn't save.");
    } finally {
      setSaving(false);
    }
  }
  return { saving, error, fields, saved, save };
}

function SaveRow({ saving, saved, disabled, label = "Save changes" }: { saving: boolean; saved: boolean; disabled?: boolean; label?: string }) {
  return (
    <div className="flex items-center justify-end gap-3">
      {saved && (
        <span className="flex items-center gap-1 text-sm text-good">
          <Check className="size-4" /> Saved
        </span>
      )}
      <Button type="submit" loading={saving} disabled={disabled}>
        {label}
      </Button>
    </div>
  );
}

function EditDestination({ orgId, qr, onSave }: { orgId: string; qr: any; onSave: (b: Record<string, unknown>) => Promise<unknown> }) {
  const [type, setType] = useState<QrType>(qr.type);
  const [payload, setPayload] = useState<Record<string, any>>(qr.payload);
  const s = useSaver(onSave);
  useEffect(() => {
    setType(qr.type);
    setPayload(qr.payload);
  }, [qr.type, qr.payload]);

  if (qr.type === "event" && qr.eventId) {
    return (
      <Card>
        <CardHeader title="Destination" description="This code opens an event page." />
        <div className="grid gap-3 p-5 text-sm">
          <p className="text-muted">Edit the programme, design and printable card in the event editor. Changes show up on the next scan.</p>
          <div>
            <Link href={`/app/events/${qr.eventId}`} className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline">Open the event editor</Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Destination" description="Change where this code goes. Printed copies pick up the change on the next scan." />
      <form
        className="grid gap-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          s.save({ type, payload });
        }}
      >
        <FormError message={s.error} />
        <Field label="Type" htmlFor="e-type">
          <Select
            id="e-type"
            value={type}
            onChange={(e) => {
              const t = e.target.value as QrType;
              setType(t);
              setPayload(t === qr.type ? qr.payload : t === "social" ? { platform: "instagram" } : {});
            }}
            className="sm:max-w-64"
          >
            {TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {TYPE_META[t].label}
              </option>
            ))}
          </Select>
        </Field>
        <DestinationForm orgId={orgId} type={type} payload={payload} onChange={setPayload} errors={s.fields} />
        <SaveRow saving={s.saving} saved={s.saved} label="Update destination" />
      </form>
    </Card>
  );
}

function EditDesign({ orgId, qr, onSave, logoLocked }: { orgId: string; qr: any; onSave: (b: Record<string, unknown>) => Promise<unknown>; logoLocked: boolean }) {
  const [style, setStyle] = useState<QrStyle>(qr.style);
  const s = useSaver(onSave);
  const problem = styleProblem(style);
  const changed = JSON.stringify(style) !== JSON.stringify(qr.style);
  return (
    <Card>
      <CardHeader title="Design" description="Changing colours means reprinting. The link inside the code stays the same." />
      <form
        className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_180px]"
        onSubmit={(e) => {
          e.preventDefault();
          s.save({ style });
        }}
      >
        <div className="grid gap-5">
          <FormError message={s.error} />
          <StyleControls style={style} onChange={setStyle} orgId={orgId} logoLocked={logoLocked} />
          {problem && <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{problem}</p>}
        </div>
        <div className="grid content-start justify-items-center gap-2">
          <QrPreview value={qr.shortUrl} style={style} size={160} />
          <span className="text-xs text-muted">Preview</span>
        </div>
        <div className="sm:col-span-2">
          <SaveRow saving={s.saving} saved={s.saved} disabled={!!problem || !changed} label="Save design" />
        </div>
      </form>
    </Card>
  );
}

function EditSettings({ qr, onSave }: { qr: any; onSave: (b: Record<string, unknown>) => Promise<unknown> }) {
  const [name, setName] = useState(qr.name);
  const [expires, setExpires] = useState(toLocalInput(qr.expiresAt));
  const s = useSaver(onSave);
  return (
    <Card>
      <CardHeader title="Settings" />
      <form
        className="grid gap-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          s.save({ name, expiresAt: expires ? new Date(expires).toISOString() : null });
        }}
      >
        <FormError message={s.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="s-name" error={s.fields.name?.[0]}>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Expires" htmlFor="s-exp" hint="Leave empty for no expiry.">
            <div className="flex gap-2">
              <Input id="s-exp" type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
              {expires && (
                <Button type="button" variant="ghost" onClick={() => setExpires("")}>
                  Clear
                </Button>
              )}
            </div>
          </Field>
        </div>
        <SaveRow saving={s.saving} saved={s.saved} />
      </form>
    </Card>
  );
}

export default function QrDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <QrDetail id={id} />
    </Suspense>
  );
}

