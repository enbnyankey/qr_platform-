"use client";

import { use, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Pencil, Plus, QrCode, Trash2, X } from "lucide-react";
import { Button, ButtonLink, Card, Field, FormError, Input, Label, LoadingBlock, PageHeader, StatusPill, Textarea, Toggle } from "@/components/ui";
import { api, assetUrl, fetcher, formatMoney, uploadFile } from "@/lib/api";
import { canEdit, useSession } from "@/lib/session";

type Item = { id: string; name: string; description: string | null; price: number; priceMinor: number; currency: string; imageUrl: string | null; isAvailable: boolean };
type Section = { id: string; name: string; description: string | null; items: Item[] };

export default function MenuEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { org } = useSession();
  const editable = canEdit(org.role);
  const key = `/orgs/${org.id}/menus/${id}`;
  const { data, error, mutate } = useSWR(key, fetcher);
  const [err, setErr] = useState<string | null>(null);
  const [newSection, setNewSection] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (error?.status === 404) return <p className="text-sm text-muted">This menu doesn&apos;t exist.</p>;
  if (!data) return <LoadingBlock />;
  const menu = data.menu;
  const sections: Section[] = menu.sections;

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      await Promise.all([mutate(), globalMutate(`/orgs/${org.id}/menus`)]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  async function move(index: number, dir: -1 | 1) {
    const ids = sections.map((s) => s.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await run(() => api(`${key}/sections/order`, { method: "PUT", json: { ids } }));
  }

  const itemCount = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <>
      <PageHeader
        back={{ href: "/app/menus", label: "Menus" }}
        title={menu.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={menu.isPublished ? "published" : "draft"} />
            {itemCount} item{itemCount === 1 ? "" : "s"} in {sections.length} section{sections.length === 1 ? "" : "s"}
          </span>
        }
        action={
          <>
            {menu.isPublished && (
              <a href={`/m/${menu.id}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-surface px-3.5 text-sm font-medium hover:border-ink/30">
                <ExternalLink className="size-4" /> View live
              </a>
            )}
            {editable && (
              <ButtonLink href={`/app/qr/new?type=menu&menuId=${menu.id}&name=${encodeURIComponent(`${menu.name} menu`)}`}>
                <QrCode className="size-4" /> Create QR for this menu
              </ButtonLink>
            )}
          </>
        }
      />
      <FormError message={err} />

      <div className="mt-2 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid content-start gap-5">
          {sections.length === 0 && (
            <Card className="p-6 text-sm text-muted">Start with a section such as “Starters”, “Mains” or “Drinks”, then add items to it.</Card>
          )}
          {sections.map((s, i) => (
            <SectionCard
              key={s.id}
              section={s}
              editable={editable}
              currency={org.currency}
              orgId={org.id}
              menuKey={key}
              onChanged={() => mutate()}
              onError={setErr}
              onMoveUp={i > 0 ? () => move(i, -1) : undefined}
              onMoveDown={i < sections.length - 1 ? () => move(i, 1) : undefined}
            />
          ))}
          {editable && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newSection.trim()) return;
                run(() => api(`${key}/sections`, { method: "POST", json: { name: newSection } })).then(() => setNewSection(""));
              }}
            >
              <Input aria-label="New section name" placeholder="New section, e.g. Drinks" value={newSection} onChange={(e) => setNewSection(e.target.value)} className="max-w-xs" />
              <Button type="submit" variant="secondary" disabled={!newSection.trim()}>
                <Plus className="size-4" /> Add section
              </Button>
            </form>
          )}
        </div>

        <aside className="grid content-start gap-5">
          <Card className="grid gap-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Published</p>
                <p className="text-[13px] text-muted">{menu.isPublished ? "Customers can open it." : "Only you can see it."}</p>
              </div>
              <Toggle checked={menu.isPublished} disabled={!editable} label="Published" onChange={(v) => run(() => api(key, { method: "PATCH", json: { isPublished: v } }))} />
            </div>
          </Card>
          <Card className="grid gap-3 p-5">
            <Label>Linked QR codes</Label>
            {menu.qrCodes.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <ul className="grid gap-1.5">
                {menu.qrCodes.map((q: any) => (
                  <li key={q.id}>
                    <Link href={`/app/qr/${q.id}`} className="flex items-center gap-2 text-sm hover:text-accent">
                      <QrCode className="size-4 text-muted" /> {q.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {editable && (
            <Card className="grid gap-3 p-5">
              <Label>Menu details</Label>
              {renaming ? (
                <RenameForm
                  menu={menu}
                  onCancel={() => setRenaming(false)}
                  onSave={(body) => run(() => api(key, { method: "PATCH", json: body })).then(() => setRenaming(false))}
                />
              ) : (
                <>
                  {menu.description && <p className="text-sm text-muted">{menu.description}</p>}
                  <Button variant="secondary" size="sm" onClick={() => setRenaming(true)}>
                    <Pencil className="size-3.5" /> Edit name and description
                  </Button>
                </>
              )}
              {confirmDelete ? (
                <div className="grid gap-2 rounded-md bg-bad-soft p-3 text-sm text-bad">
                  Delete this menu and all its items?
                  <div className="flex gap-2">
                    <Button size="sm" variant="danger" onClick={() => run(() => api(key, { method: "DELETE" })).then(() => router.replace("/app/menus"))}>
                      Delete menu
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="text-bad" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-3.5" /> Delete menu
                </Button>
              )}
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function RenameForm({ menu, onSave, onCancel }: { menu: any; onSave: (b: { name: string; description: string | null }) => void; onCancel: () => void }) {
  const [name, setName] = useState(menu.name);
  const [description, setDescription] = useState(menu.description ?? "");
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name, description: description || null });
      }}
    >
      <Field label="Name" htmlFor="r-name">
        <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Description" htmlFor="r-desc">
        <Textarea id="r-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!name.trim()}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SectionCard({
  section, editable, currency, orgId, menuKey, onChanged, onError, onMoveUp, onMoveDown,
}: {
  section: Section; editable: boolean; currency: string; orgId: string; menuKey: string;
  onChanged: () => void; onError: (m: string | null) => void; onMoveUp?: () => void; onMoveDown?: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(section.name);

  const call = async (fn: () => Promise<unknown>) => {
    onError(null);
    try {
      await fn();
      onChanged();
      return true;
    } catch (e) {
      onError(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        {renaming ? (
          <form
            className="flex flex-1 gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await call(() => api(`${menuKey}/sections/${section.id}`, { method: "PATCH", json: { name } }))) setRenaming(false);
            }}
          >
            <Input aria-label="Section name" value={name} onChange={(e) => setName(e.target.value)} className="h-8 max-w-xs" autoFocus />
            <Button size="sm" type="submit">
              Save
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <h2 className="text-lg font-semibold">{section.name}</h2>
        )}
        {editable && !renaming && (
          <div className="flex items-center gap-0.5">
            <IconBtn label="Move section up" onClick={onMoveUp} disabled={!onMoveUp}>
              <ArrowUp className="size-4" />
            </IconBtn>
            <IconBtn label="Move section down" onClick={onMoveDown} disabled={!onMoveDown}>
              <ArrowDown className="size-4" />
            </IconBtn>
            <IconBtn label="Rename section" onClick={() => setRenaming(true)}>
              <Pencil className="size-4" />
            </IconBtn>
            <IconBtn
              label="Delete section"
              onClick={() => {
                if (section.items.length && !window.confirm(`Delete “${section.name}” and its ${section.items.length} items?`)) return;
                call(() => api(`${menuKey}/sections/${section.id}`, { method: "DELETE" }));
              }}
            >
              <Trash2 className="size-4" />
            </IconBtn>
          </div>
        )}
      </div>

      <ul className="divide-y divide-line">
        {section.items.map((item) =>
          editingId === item.id ? (
            <li key={item.id} className="p-5">
              <ItemForm
                orgId={orgId}
                currency={currency}
                initial={item}
                onCancel={() => setEditingId(null)}
                onSubmit={async (body) => (await call(() => api(`${menuKey}/items/${item.id}`, { method: "PATCH", json: body }))) && setEditingId(null)}
              />
            </li>
          ) : (
            <li key={item.id} className="flex items-start gap-4 px-5 py-4">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetUrl(item.imageUrl)} alt="" className="size-14 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="size-14 shrink-0 rounded-md bg-sunk" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className={`font-medium ${item.isAvailable ? "" : "text-muted line-through"}`}>{item.name}</p>
                  <p className="tabular text-sm font-medium">{formatMoney(item.priceMinor, item.currency)}</p>
                </div>
                {item.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{item.description}</p>}
                {!item.isAvailable && <p className="mt-1 text-xs font-medium text-warn">Marked sold out</p>}
              </div>
              {editable && (
                <div className="flex shrink-0 items-center gap-1">
                  <Toggle checked={item.isAvailable} label={`${item.name} available`} onChange={(v) => call(() => api(`${menuKey}/items/${item.id}`, { method: "PATCH", json: { isAvailable: v } }))} />
                  <IconBtn label={`Edit ${item.name}`} onClick={() => setEditingId(item.id)}>
                    <Pencil className="size-4" />
                  </IconBtn>
                  <IconBtn label={`Delete ${item.name}`} onClick={() => call(() => api(`${menuKey}/items/${item.id}`, { method: "DELETE" }))}>
                    <Trash2 className="size-4" />
                  </IconBtn>
                </div>
              )}
            </li>
          ),
        )}
      </ul>

      {editable && (
        <div className="border-t border-line p-5">
          {adding ? (
            <ItemForm
              orgId={orgId}
              currency={currency}
              onCancel={() => setAdding(false)}
              onSubmit={async (body) => (await call(() => api(`${menuKey}/sections/${section.id}/items`, { method: "POST", json: body }))) && setAdding(false)}
            />
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add item
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick?: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="rounded-md p-1.5 text-muted hover:bg-sunk hover:text-ink disabled:opacity-30">
      {children}
    </button>
  );
}

function ItemForm({ orgId, currency, initial, onSubmit, onCancel }: { orgId: string; currency: string; initial?: Item; onSubmit: (b: Record<string, unknown>) => Promise<unknown>; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const priceNum = Number(price);
  const valid = name.trim() && price !== "" && Number.isFinite(priceNum) && priceNum >= 0;

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSubmit({ name, description: description || null, price: priceNum, imageUrl });
        setSaving(false);
      }}
    >
      <FormError message={error} />
      <div className="grid gap-4 sm:grid-cols-[96px_minmax(0,1fr)]">
        <div className="grid content-start gap-1.5">
          <span className="text-[13px] font-medium">Photo</span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative grid size-24 place-items-center overflow-hidden rounded-md border border-dashed border-line bg-sunk text-muted hover:border-accent hover:text-accent"
            aria-label={imageUrl ? "Replace photo" : "Add photo"}
          >
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={assetUrl(imageUrl)} alt="" className="size-full object-cover" />
            ) : uploading ? (
              <span className="text-xs">Uploading…</span>
            ) : (
              <ImagePlus className="size-6" />
            )}
          </button>
          {imageUrl && (
            <button type="button" className="flex items-center gap-1 text-xs text-muted hover:text-bad" onClick={() => setImageUrl(null)}>
              <X className="size-3" /> Remove
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
              setError(null);
              try {
                setImageUrl((await uploadFile(orgId, f)).path);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Upload failed.");
              } finally {
                setUploading(false);
                e.target.value = "";
              }
            }}
          />
        </div>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
            <Field label="Item name" htmlFor={`i-name-${initial?.id ?? "new"}`}>
              <Input id={`i-name-${initial?.id ?? "new"}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jollof rice with chicken" autoFocus />
            </Field>
            <Field label={`Price (${currency})`} htmlFor={`i-price-${initial?.id ?? "new"}`}>
              <Input id={`i-price-${initial?.id ?? "new"}`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" className="tabular" />
            </Field>
          </div>
          <Field label="Description (optional)" htmlFor={`i-desc-${initial?.id ?? "new"}`}>
            <Textarea id={`i-desc-${initial?.id ?? "new"}`} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving} disabled={!valid || uploading}>
          {initial ? "Save item" : "Add item"}
        </Button>
      </div>
    </form>
  );
}
