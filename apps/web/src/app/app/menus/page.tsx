"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR, { mutate } from "swr";
import { BookOpen, Plus } from "lucide-react";
import { Button, Card, EmptyState, Field, FormError, Input, LoadingBlock, PageHeader, StatusPill } from "@/components/ui";
import { api, fetcher, relativeTime } from "@/lib/api";
import { canEdit, useSession } from "@/lib/session";

export default function MenusPage() {
  const router = useRouter();
  const { org } = useSession();
  const { data } = useSWR(`/orgs/${org.id}/menus`, fetcher);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = canEdit(org.role);
  const menus: any[] = data?.menus ?? [];

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { menu } = await api(`/orgs/${org.id}/menus`, { method: "POST", json: { name } });
      await mutate(`/orgs/${org.id}/menus`);
      router.push(`/app/menus/${menu.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the menu.");
      setSaving(false);
    }
  }

  const form = (
    <form onSubmit={create} className="grid w-full max-w-md gap-3 text-left">
      <FormError message={error} />
      <Field label="Menu name" htmlFor="m-name" hint="e.g. Lunch, Drinks, Weekend specials">
        <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" loading={saving} disabled={!name.trim()}>
          Create menu
        </Button>
        {menus.length > 0 && (
          <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );

  return (
    <>
      <PageHeader
        title="Menus"
        description="Digital menus customers open by scanning a code on the table or counter."
        action={
          editable && menus.length > 0 && !creating ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New menu
            </Button>
          ) : undefined
        }
      />
      {!data ? (
        <LoadingBlock />
      ) : menus.length === 0 ? (
        <Card>
          <EmptyState icon={<BookOpen className="size-6" />} title="Build your first menu" body="Add sections and items with prices and photos, publish it, then link a QR code to it." action={editable ? form : undefined} />
        </Card>
      ) : (
        <div className="grid gap-4">
          {creating && <Card className="p-5">{form}</Card>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {menus.map((m) => (
              <Link key={m.id} href={`/app/menus/${m.id}`} className="group rounded-lg border border-line bg-surface p-5 transition-colors hover:border-accent">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold group-hover:text-accent">{m.name}</h2>
                  <StatusPill status={m.isPublished ? "published" : "draft"} />
                </div>
                {m.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{m.description}</p>}
                <p className="mt-4 text-[13px] text-muted">
                  {m.itemCount} item{m.itemCount === 1 ? "" : "s"} · {m.qrCount} QR code{m.qrCount === 1 ? "" : "s"} · updated {relativeTime(m.updatedAt)}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
