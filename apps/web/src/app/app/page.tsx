"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowDownRight, ArrowUpRight, BookOpen, Plus, QrCode } from "lucide-react";
import { DailyBars } from "@/components/charts";
import { ButtonLink, Card, CardHeader, EmptyState, Label, LoadingBlock, PageHeader } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";
import { TYPE_META } from "@/lib/qr-types";

export default function OverviewPage() {
  const { org, me } = useSession();
  const { data } = useSWR(`/orgs/${org.id}/overview`, fetcher);

  const first = me.user.fullName.split(" ")[0];
  const delta = data ? data.counts.scans7d - data.counts.scansPrev7d : 0;

  return (
    <>
      <PageHeader
        title={`Hello, ${first}`}
        description={`Here's how ${org.name}'s codes are doing.`}
        action={
          <ButtonLink href="/app/qr/new">
            <Plus className="size-4" /> New QR code
          </ButtonLink>
        }
      />
      {!data ? (
        <LoadingBlock />
      ) : data.counts.qrTotal === 0 ? (
        <Card>
          <EmptyState
            icon={<QrCode className="size-6" />}
            title="Create your first QR code"
            body="Point it at your website, a social profile, a contact card or a digital menu. You can change where it goes later without reprinting."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink href="/app/qr/new">
                  <Plus className="size-4" /> New QR code
                </ButtonLink>
                <ButtonLink href="/app/menus" variant="secondary">
                  <BookOpen className="size-4" /> Build a menu first
                </ButtonLink>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-6">
          <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Scans · last 7 days" value={data.counts.scans7d}>
              {data.counts.scansPrev7d > 0 || data.counts.scans7d > 0 ? (
                <span className={`inline-flex items-center gap-1 text-xs ${delta >= 0 ? "text-good" : "text-bad"}`}>
                  {delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                  {Math.abs(delta)} vs previous 7 days
                </span>
              ) : (
                <span className="text-xs text-muted">No scans yet</span>
              )}
            </Stat>
            <Stat label="Active codes" value={data.counts.qrActive}>
              <span className="text-xs text-muted">of {data.counts.qrTotal} created</span>
            </Stat>
            <Stat label="Menus" value={data.counts.menus}>
              <Link href="/app/menus" className="text-xs text-accent hover:underline">
                Manage menus
              </Link>
            </Stat>
            <Stat label="Inactive or expired" value={data.counts.qrTotal - data.counts.qrActive}>
              <Link href="/app/qr?status=inactive" className="text-xs text-accent hover:underline">
                Review
              </Link>
            </Stat>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card>
              <CardHeader title="Scans" description="All codes, last 14 days" />
              <div className="p-5">
                <DailyBars data={data.daily} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Most scanned this week" action={<Link href="/app/qr" className="text-sm text-accent hover:underline">All codes</Link>} />
              <ul className="divide-y divide-line">
                {data.topQr.map((q: any) => {
                  const Icon = TYPE_META[q.type as keyof typeof TYPE_META]?.icon ?? QrCode;
                  return (
                    <li key={q.id}>
                      <Link href={`/app/qr/${q.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-sunk/60">
                        <span className="grid size-8 place-items-center rounded-md bg-sunk text-muted">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{q.name}</span>
                          <span className="font-mono text-xs text-muted">{q.code}</span>
                        </span>
                        <span className="tabular text-sm font-medium">{q.scans}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, children }: { label: string; value: number; children?: React.ReactNode }) {
  return (
    <div className="grid gap-1 bg-surface p-5">
      <Label>{label}</Label>
      <p className="tabular font-display text-[32px] font-semibold leading-none">{value.toLocaleString()}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
