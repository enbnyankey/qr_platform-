"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Plus, QrCode, Search } from "lucide-react";
import { ButtonLink, Card, cx, EmptyState, Input, LoadingBlock, PageHeader, StatusPill } from "@/components/ui";
import { fetcher, relativeTime } from "@/lib/api";
import { describeDestination, TYPE_META, QrType } from "@/lib/qr-types";
import { useSession } from "@/lib/session";

const FILTERS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "expired", label: "Expired" },
  { value: "suspended", label: "Suspended" },
];

function QrList() {
  const { org } = useSession();
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [search, setSearch] = useState("");
  const qs = new URLSearchParams({ ...(status && { status }), ...(search.trim() && { search: search.trim() }) }).toString();
  const { data, isLoading } = useSWR(`/orgs/${org.id}/qr${qs ? `?${qs}` : ""}`, fetcher, { keepPreviousData: true });
  const codes: any[] = data?.qrCodes ?? [];

  return (
    <>
      <PageHeader
        title="QR codes"
        description="Every code is dynamic: change where it points at any time without reprinting."
        action={
          <ButtonLink href="/app/qr/new">
            <Plus className="size-4" /> New QR code
          </ButtonLink>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-md border border-line bg-surface p-1" role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              role="tab"
              aria-selected={status === f.value}
              onClick={() => setStatus(f.value)}
              className={cx("rounded px-2.5 py-1 text-sm", status === f.value ? "bg-ink text-white" : "text-muted hover:text-ink")}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <Input aria-label="Search codes" placeholder="Search by name or code" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card>
        {isLoading && !data ? (
          <LoadingBlock />
        ) : codes.length === 0 ? (
          <EmptyState
            icon={<QrCode className="size-6" />}
            title={status || search ? "No codes match" : "No QR codes yet"}
            body={status || search ? "Try another filter or search term." : "Create a code for your website, menu, social profile or contact card."}
            action={!status && !search ? <ButtonLink href="/app/qr/new">New QR code</ButtonLink> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Goes to</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 text-right font-medium">Scans (7d)</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-5 py-3 font-medium">Last scan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {codes.map((q) => {
                  const meta = TYPE_META[q.type as QrType];
                  const Icon = meta.icon;
                  return (
                    <tr key={q.id} className="group hover:bg-sunk/50">
                      <td className="px-5 py-3">
                        <Link href={`/app/qr/${q.id}`} className="flex items-center gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-sunk text-muted group-hover:bg-accent-soft group-hover:text-accent">
                            <Icon className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{q.name}</span>
                            <span className="font-mono text-xs text-muted">
                              {meta.label} · {q.code}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="max-w-64 truncate px-3 py-3 text-muted">{describeDestination(q.type, q.payload, q.targetUrl)}</td>
                      <td className="px-3 py-3">
                        <StatusPill status={q.effectiveStatus} />
                      </td>
                      <td className="tabular px-3 py-3 text-right">{q.scans7d}</td>
                      <td className="tabular px-3 py-3 text-right text-muted">{q.scansTotal}</td>
                      <td className="px-5 py-3 text-muted">{relativeTime(q.lastScanAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

export default function QrListPage() {
  return (
    <Suspense>
      <QrList />
    </Suspense>
  );
}
