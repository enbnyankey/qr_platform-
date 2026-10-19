import { Router } from "express";
import { z } from "zod";
import { Prisma, prisma } from "../../db";
import { requireAuth, requireOrg } from "../../lib/auth";
import { invalidateQr } from "../../lib/cache";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { audit, randomCode } from "../../lib/util";
import { assertCanCreate, assertCanEdit, entitlementsFor } from "../billing/entitlements";
import { targetUrlFor } from "../qr/destinations";
import { shortUrl } from "../qr/routes";
import { cardSchema, contentSchema, EVENT_KINDS, EventCard, EventContent, EventTheme, themeSchema, uploadPaths } from "./schema";

/** Event pages (weddings, funerals, ...): each one comes with its own QR code. */
export const eventsRouter = Router({ mergeParams: true });
eventsRouter.use(requireAuth, requireOrg());
const canEdit = requireOrg(["business_owner", "manager"]);
const asJson = (v: unknown) => v as Prisma.InputJsonValue;

function checkUploads(orgId: string, theme: EventTheme, content: EventContent, card?: EventCard) {
  if (uploadPaths(theme, content, card).some((p) => !p.startsWith(`/uploads/${orgId}/`))) throw badRequest("Upload photos to this business first.");
}

const dateOf = (c: EventContent) => (c.date ? new Date(`${c.date}T00:00:00Z`) : null);

async function loadEvent(orgId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Event");
  const e = await prisma.event.findFirst({ where: { id, orgId } });
  if (!e) throw notFound("Event");
  return e;
}

async function qrSummaries(eventIds: string[]) {
  if (eventIds.length === 0) return new Map<string, any[]>();
  const codes = await prisma.qrCode.findMany({ where: { eventId: { in: eventIds } }, orderBy: { createdAt: "asc" } });
  const counts = await prisma.scanEvent.groupBy({ by: ["qrId"], where: { qrId: { in: codes.map((c) => c.id) } }, _count: { _all: true } });
  const n = new Map(counts.map((c) => [c.qrId, c._count._all]));
  const byEvent = new Map<string, any[]>();
  for (const c of codes) {
    const list = byEvent.get(c.eventId!) ?? [];
    list.push({ id: c.id, code: c.code, name: c.name, status: c.status, shortUrl: shortUrl(c.code), scansTotal: n.get(c.id) ?? 0 });
    byEvent.set(c.eventId!, list);
  }
  return byEvent;
}

function serialize(e: Awaited<ReturnType<typeof loadEvent>>, qrCodes: any[] = []) {
  return {
    id: e.id, kind: e.kind, title: e.title, eventDate: e.eventDate?.toISOString().slice(0, 10) ?? null,
    theme: e.theme, content: e.content, card: e.card, isPublished: e.isPublished,
    createdAt: e.createdAt, updatedAt: e.updatedAt,
    qrCodes, scansTotal: qrCodes.reduce((sum, q) => sum + q.scansTotal, 0),
  };
}

/** Creates the event's QR code inside a transaction (retrying on the unlikely code collision). */
async function createEventQr(tx: Prisma.TransactionClient, req: any, orgId: string, eventId: string, name: string) {
  const payload = { eventId };
  const targetUrl = targetUrlFor("event", payload);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode(8);
    if (await tx.qrCode.findUnique({ where: { code }, select: { id: true } })) continue;
    const q = await tx.qrCode.create({
      data: {
        orgId, code, name, type: "event", payload, targetUrl, eventId,
        style: { fg: "#111111", bg: "#ffffff", margin: 2, ecc: "M" }, createdById: req.user.id,
        history: { create: { type: "event", payload, targetUrl, changedById: req.user.id } },
      },
    });
    await audit(req, { orgId, action: "qr.create", entity: "qr_code", entityId: q.id, after: q }, tx);
    return q;
  }
  throw conflict("Couldn't allocate a unique code. Try again.");
}

// ---------- list ----------
eventsRouter.get("/", async (req, res) => {
  const events = await prisma.event.findMany({ where: { orgId: req.org!.id }, orderBy: { createdAt: "desc" }, take: 200 });
  const qr = await qrSummaries(events.map((e) => e.id));
  res.json({ events: events.map((e) => serialize(e, qr.get(e.id))) });
});

// ---------- create (event + its QR code) ----------
eventsRouter.post("/", canEdit, async (req, res) => {
  const body = z
    .object({
      kind: z.enum(EVENT_KINDS),
      title: z.string().trim().min(1, "Give the event a name.").max(120),
      theme: themeSchema,
      content: contentSchema.default({}),
      card: cardSchema.default({}),
    })
    .parse(req.body);
  const orgId = req.org!.id;
  checkUploads(orgId, body.theme, body.content, body.card);
  await assertCanCreate(orgId, "qr"); // every event uses one QR code from the plan

  const event = await prisma.$transaction(async (tx) => {
    const e = await tx.event.create({
      data: {
        orgId, kind: body.kind, title: body.title, eventDate: dateOf(body.content),
        theme: asJson(body.theme), content: asJson(body.content), card: asJson(body.card), createdById: req.user!.id,
      },
    });
    await createEventQr(tx, req, orgId, e.id, body.title);
    await audit(req, { orgId, action: "event.create", entity: "event", entityId: e.id, after: e }, tx);
    return e;
  });
  const qr = await qrSummaries([event.id]);
  res.status(201).json({ event: serialize(event, qr.get(event.id)) });
});

// ---------- read ----------
eventsRouter.get("/:id", async (req, res) => {
  const e = await loadEvent(req.org!.id, String(req.params.id));
  const qr = await qrSummaries([e.id]);
  const ent = await entitlementsFor(req.org!.id);
  res.json({ event: serialize(e, qr.get(e.id)), showPlatformBranding: !ent.features.removeBranding });
});

// ---------- update ----------
eventsRouter.patch("/:id", canEdit, async (req, res) => {
  const body = z
    .object({
      kind: z.enum(EVENT_KINDS).optional(),
      title: z.string().trim().min(1, "Give the event a name.").max(120).optional(),
      theme: themeSchema.optional(),
      content: contentSchema.optional(),
      card: cardSchema.optional(),
      isPublished: z.boolean().optional(),
    })
    .parse(req.body);
  const orgId = req.org!.id;
  const before = await loadEvent(orgId, String(req.params.id));
  const onlyUnpublishing = Object.keys(body).every((k) => k === "isPublished") && body.isPublished === false;
  if (!onlyUnpublishing) await assertCanEdit(orgId);
  const theme = body.theme ?? themeSchema.parse(before.theme);
  const content = body.content ?? contentSchema.parse(before.content);
  checkUploads(orgId, theme, content, body.card);

  const after = await prisma.$transaction(async (tx) => {
    const e = await tx.event.update({
      where: { id: before.id },
      data: {
        kind: body.kind, title: body.title, isPublished: body.isPublished,
        theme: body.theme ? asJson(body.theme) : undefined,
        content: body.content ? asJson(body.content) : undefined,
        eventDate: body.content ? dateOf(body.content) : undefined,
        card: body.card ? asJson(body.card) : undefined,
      },
    });
    const action = body.isPublished === true && !before.isPublished ? "event.publish" : body.isPublished === false && before.isPublished ? "event.unpublish" : "event.update";
    await audit(req, { orgId, action, entity: "event", entityId: e.id, before, after: e }, tx);
    return e;
  });
  const qr = await qrSummaries([after.id]);
  res.json({ event: serialize(after, qr.get(after.id)) });
});

// ---------- add another QR code (e.g. one per table, or after deleting the first) ----------
eventsRouter.post("/:id/qr", canEdit, async (req, res) => {
  const orgId = req.org!.id;
  const e = await loadEvent(orgId, String(req.params.id));
  await assertCanCreate(orgId, "qr");
  await prisma.$transaction((tx) => createEventQr(tx, req, orgId, e.id, e.title));
  const qr = await qrSummaries([e.id]);
  res.status(201).json({ event: serialize(e, qr.get(e.id)) });
});

// ---------- delete (only if its codes were never scanned, i.e. probably never printed) ----------
eventsRouter.delete("/:id", canEdit, async (req, res) => {
  const orgId = req.org!.id;
  const e = await loadEvent(orgId, String(req.params.id));
  const codes = await prisma.qrCode.findMany({ where: { eventId: e.id }, select: { id: true, code: true } });
  if (codes.length && (await prisma.scanEvent.count({ where: { qrId: { in: codes.map((c) => c.id) } } })) > 0) {
    throw conflict("Guests have already scanned this event's QR code. Unpublish it instead of deleting.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.qrCode.deleteMany({ where: { eventId: e.id } });
    await tx.event.delete({ where: { id: e.id } });
    await audit(req, { orgId, action: "event.delete", entity: "event", entityId: e.id, before: e }, tx);
  });
  await Promise.all(codes.map((c) => invalidateQr(c.code)));
  res.json({ ok: true });
});
