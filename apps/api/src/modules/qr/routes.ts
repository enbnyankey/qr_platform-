import { Router } from "express";
import { z } from "zod";
import { config } from "../../config";
import { Prisma, prisma } from "../../db";
import { requireAuth, requireOrg } from "../../lib/auth";
import { invalidateQr } from "../../lib/cache";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { audit, randomCode } from "../../lib/util";
import { getSettings } from "../admin/settings";
import { assertCanCreate, assertCanEdit, entitlementsFor, requireFeature } from "../billing/entitlements";
import { parsePayload, QR_TYPES, QrStyle, QrType, styleSchema, targetUrlFor } from "./destinations";
import { renderPng, renderSvg } from "./render";
import type { QrCode } from "@qr/db";

export const qrRouter = Router({ mergeParams: true });
qrRouter.use(requireAuth, requireOrg());
const canEdit = requireOrg(["business_owner", "manager"]);

export const shortUrl = (code: string) => `${config.qrBaseUrl}/q/${code}`;

function effectiveStatus(q: { status: string; expiresAt: Date | null }) {
  if (q.status !== "active") return q.status;
  if (q.expiresAt && q.expiresAt <= new Date()) return "expired";
  return "active";
}

function serialize(q: QrCode, stats?: { total: number; recent: number; lastAt: Date | null }) {
  return {
    id: q.id, code: q.code, name: q.name, type: q.type, payload: q.payload, targetUrl: q.targetUrl,
    menuId: q.menuId, eventId: q.eventId, style: q.style, status: q.status, effectiveStatus: effectiveStatus(q),
    expiresAt: q.expiresAt, shortUrl: shortUrl(q.code), createdAt: q.createdAt, updatedAt: q.updatedAt,
    ...(stats ? { scansTotal: stats.total, scans7d: stats.recent, lastScanAt: stats.lastAt } : {}),
  };
}

async function assertMenuInOrg(orgId: string, menuId: string) {
  const menu = await prisma.menu.findFirst({ where: { id: menuId, orgId }, select: { id: true } });
  if (!menu) throw badRequest("That menu doesn't belong to this organization.");
}

async function assertEventInOrg(orgId: string, eventId: string) {
  const event = await prisma.event.findFirst({ where: { id: eventId, orgId }, select: { id: true } });
  if (!event) throw badRequest("That event doesn't belong to this organization.");
}

async function loadQr(orgId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("QR code");
  const q = await prisma.qrCode.findFirst({ where: { id, orgId } });
  if (!q) throw notFound("QR code");
  return q;
}

/** Validates style for this org: a logo must be one of the org's own uploads. */
function parseStyle(orgId: string, input: unknown): QrStyle {
  const style = styleSchema.parse(input ?? {});
  if (style.logo && !style.logo.path.startsWith(`/uploads/${orgId}/`)) throw badRequest("Upload the logo to this business first.");
  return style;
}

async function assertTypeAllowed(type: QrType) {
  const { allowedQrTypes } = await getSettings();
  if (!allowedQrTypes.includes(type)) throw badRequest("This QR type is turned off on the platform right now.");
}

const statusInput = z.enum(["active", "inactive"]);
const expiresInput = z.string().datetime({ offset: true }).nullable().optional();
const asJson = (v: unknown) => v as Prisma.InputJsonValue;

// ---------- list ----------
qrRouter.get("/", async (req, res) => {
  const f = z
    .object({
      status: z.enum(["active", "inactive", "suspended", "expired"]).optional(),
      type: z.enum(QR_TYPES as [QrType]).optional(),
      search: z.string().trim().max(80).optional(),
    })
    .parse(req.query);
  const now = new Date();
  const where: Prisma.QrCodeWhereInput = { orgId: req.org!.id };
  if (f.type) where.type = f.type;
  if (f.search) where.OR = [{ name: { contains: f.search, mode: "insensitive" } }, { code: { contains: f.search, mode: "insensitive" } }];
  if (f.status === "expired") Object.assign(where, { status: "active", expiresAt: { lte: now } });
  else if (f.status === "active") where.AND = [{ status: "active" }, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }];
  else if (f.status) where.status = f.status;

  const codes = await prisma.qrCode.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
  const ids = codes.map((c) => c.id);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [totals, recent] = await Promise.all([
    prisma.scanEvent.groupBy({ by: ["qrId"], where: { qrId: { in: ids } }, _count: { _all: true }, _max: { scannedAt: true } }),
    prisma.scanEvent.groupBy({ by: ["qrId"], where: { qrId: { in: ids }, scannedAt: { gt: weekAgo } }, _count: { _all: true } }),
  ]);
  const t = new Map(totals.map((r) => [r.qrId, r]));
  const r7 = new Map(recent.map((r) => [r.qrId, r._count._all]));
  res.json({
    qrCodes: codes.map((q) =>
      serialize(q, { total: t.get(q.id)?._count._all ?? 0, recent: r7.get(q.id) ?? 0, lastAt: t.get(q.id)?._max.scannedAt ?? null }),
    ),
  });
});

// ---------- create ----------
qrRouter.post("/", canEdit, async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(1, "Give this QR code a name.").max(120),
      type: z.enum(QR_TYPES as [QrType]),
      payload: z.record(z.any()),
      style: z.any().optional(),
      expiresAt: expiresInput,
    })
    .parse(req.body);
  await assertTypeAllowed(body.type);
  const orgId = req.org!.id;
  const { maxQrPerOrg } = await getSettings();
  if (maxQrPerOrg > 0 && (await prisma.qrCode.count({ where: { orgId } })) >= maxQrPerOrg) {
    throw badRequest(`This business has reached the limit of ${maxQrPerOrg} QR codes.`);
  }
  await assertCanCreate(orgId, "qr");
  const payload = parsePayload(body.type, body.payload);
  const style = parseStyle(orgId, body.style);
  if (style.logo) await requireFeature(orgId, "logo");
  if (body.type === "menu") await assertMenuInOrg(orgId, payload.menuId);
  if (body.type === "event") await assertEventInOrg(orgId, payload.eventId);
  const targetUrl = targetUrlFor(body.type, payload);

  const created = await prisma.$transaction(async (tx) => {
    // Retry on the (astronomically unlikely) code collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode(8);
      if (await tx.qrCode.findUnique({ where: { code }, select: { id: true } })) continue;
      const q = await tx.qrCode.create({
        data: {
          orgId, code, name: body.name, type: body.type, payload: asJson(payload), targetUrl,
          menuId: body.type === "menu" ? payload.menuId : null, eventId: body.type === "event" ? payload.eventId : null, style: asJson(style),
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null, createdById: req.user!.id,
          history: { create: { type: body.type, payload: asJson(payload), targetUrl, changedById: req.user!.id } },
        },
      });
      await audit(req, { orgId, action: "qr.create", entity: "qr_code", entityId: q.id, after: q }, tx);
      return q;
    }
    throw conflict("Couldn't allocate a unique code. Try again.");
  });
  res.status(201).json({ qrCode: serialize(created) });
});

// ---------- read ----------
qrRouter.get("/:id", async (req, res) => {
  const q = await loadQr(req.org!.id, String(req.params.id));
  const history = await prisma.qrDestinationHistory.findMany({
    where: { qrId: q.id },
    orderBy: { changedAt: "desc" },
    take: 20,
    include: { changedBy: { select: { fullName: true } } },
  });
  res.json({
    qrCode: serialize(q),
    history: history.map((h) => ({ type: h.type, target_url: h.targetUrl, payload: h.payload, changed_at: h.changedAt, changed_by: h.changedBy?.fullName ?? null })),
  });
});

// ---------- update (name, destination, style, status, expiry) ----------
qrRouter.patch("/:id", canEdit, async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      type: z.enum(QR_TYPES as [QrType]).optional(),
      payload: z.record(z.any()).optional(),
      style: z.any().optional(),
      status: statusInput.optional(),
      expiresAt: expiresInput,
    })
    .parse(req.body);
  const orgId = req.org!.id;
  const before = await loadQr(orgId, String(req.params.id));
  if (before.status === "suspended") throw badRequest("This QR code was suspended by the platform. Contact support to restore it.");
  // Pausing a code is always allowed; changing what it does needs an active plan when over the Free limits.
  const onlyPausing = Object.keys(body).every((k) => k === "status") && body.status === "inactive";
  if (!onlyPausing) await assertCanEdit(orgId);

  const type: QrType = body.type ?? before.type;
  const destinationChanged = body.type !== undefined || body.payload !== undefined;
  let payload = before.payload as Record<string, any>;
  let targetUrl = before.targetUrl;
  if (destinationChanged) {
    if (body.type && body.type !== before.type) await assertTypeAllowed(type);
    payload = parsePayload(type, body.payload ?? before.payload);
    if (type === "menu") await assertMenuInOrg(orgId, payload.menuId);
    if (type === "event") await assertEventInOrg(orgId, payload.eventId);
    targetUrl = targetUrlFor(type, payload);
  }
  const style = body.style !== undefined ? parseStyle(orgId, { ...(before.style as object), ...body.style }) : (before.style as QrStyle);
  const hadLogo = !!(before.style as any)?.logo;
  if (style.logo && (!hadLogo || (before.style as any).logo.path !== style.logo.path)) await requireFeature(orgId, "logo");

  const after = await prisma.$transaction(async (tx) => {
    const q = await tx.qrCode.update({
      where: { id: before.id },
      data: {
        name: body.name, type, payload: asJson(payload), targetUrl, menuId: type === "menu" ? payload.menuId : null,
        eventId: type === "event" ? payload.eventId : null, style: asJson(style), status: body.status,
        expiresAt: body.expiresAt === undefined ? undefined : body.expiresAt ? new Date(body.expiresAt) : null,
        ...(destinationChanged ? { history: { create: { type, payload: asJson(payload), targetUrl, changedById: req.user!.id } } } : {}),
      },
    });
    await audit(req, { orgId, action: destinationChanged ? "qr.destination_change" : "qr.update", entity: "qr_code", entityId: q.id, before, after: q }, tx);
    return q;
  });
  await invalidateQr(after.code);
  res.json({ qrCode: serialize(after) });
});

// ---------- delete (only codes that were never scanned, i.e. probably never printed) ----------
qrRouter.delete("/:id", canEdit, async (req, res) => {
  const q = await loadQr(req.org!.id, String(req.params.id));
  if ((await prisma.scanEvent.count({ where: { qrId: q.id } })) > 0) {
    throw conflict("This code has already been scanned, so it may be in print. Deactivate it instead of deleting.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.qrCode.delete({ where: { id: q.id } });
    await audit(req, { orgId: req.org!.id, action: "qr.delete", entity: "qr_code", entityId: q.id, before: q }, tx);
  });
  await invalidateQr(q.code);
  res.json({ ok: true });
});

// ---------- image export ----------
qrRouter.get("/:id/image", async (req, res) => {
  const opts = z
    .object({ format: z.enum(["png", "svg"]).default("png"), size: z.coerce.number().int().min(128).max(4096).default(1024), download: z.string().optional() })
    .parse(req.query);
  const q = await loadQr(req.org!.id, String(req.params.id));
  if (opts.format === "svg") await requireFeature(req.org!.id, "svgDownload");
  const style = styleSchema.parse(q.style ?? {});
  const filename = `${q.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "qr"}-${q.code}.${opts.format}`;
  if (opts.download !== undefined) res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, max-age=60");
  if (opts.format === "svg") res.type("image/svg+xml").send(await renderSvg(shortUrl(q.code), style));
  else res.type("image/png").send(await renderPng(shortUrl(q.code), style, opts.size));
});

// ---------- analytics ----------
qrRouter.get("/:id/analytics", async (req, res) => {
  const requested = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query).days;
  const q = await loadQr(req.org!.id, String(req.params.id));
  const ent = await entitlementsFor(req.org!.id);
  // The plan decides how far back stats go and whether location is shown.
  const maxDays = ent.limits.analyticsDays > 0 ? ent.limits.analyticsDays : 365;
  const days = Math.min(requested, maxDays);
  const since = new Date(Date.now() - days * 86_400_000);
  const where = { qrId: q.id, scannedAt: { gt: since } };

  const [scans, allTime, blocked, last, uniques] = await Promise.all([
    prisma.scanEvent.count({ where }),
    prisma.scanEvent.count({ where: { qrId: q.id } }),
    prisma.scanEvent.count({ where: { ...where, outcome: { notIn: ["redirected", "served"] } } }),
    prisma.scanEvent.findFirst({ where: { qrId: q.id }, orderBy: { scannedAt: "desc" }, select: { scannedAt: true } }),
    prisma.scanEvent.groupBy({ by: ["ipHash"], where: { ...where, ipHash: { not: null } } }),
  ]);

  const daily = await prisma.$queryRaw<{ day: string; scans: number }[]>`
    SELECT to_char(d, 'YYYY-MM-DD') AS day, COALESCE(s.n, 0)::int AS scans
      FROM generate_series(date_trunc('day', now()) - make_interval(days => ${days - 1}::int), date_trunc('day', now()), interval '1 day') d
      LEFT JOIN (SELECT date_trunc('day', scanned_at) AS day, count(*) AS n FROM scan_events
                  WHERE qr_id = ${q.id}::uuid AND scanned_at > ${since} GROUP BY 1) s ON s.day = d
     ORDER BY d`;

  const breakdown = async (field: "deviceType" | "os" | "browser" | "country" | "city" | "outcome") => {
    const rows = await prisma.scanEvent.groupBy({ by: [field], where, _count: { _all: true } });
    return rows
      .map((r) => ({ label: (r[field] as string | null) ?? "Unknown", scans: r._count._all }))
      .sort((a, b) => b.scans - a.scans)
      .slice(0, 8);
  };
  const location = ent.features.locationAnalytics;
  const [devices, os, browsers, countries, cities, outcomes] = await Promise.all([
    breakdown("deviceType"), breakdown("os"), breakdown("browser"),
    location ? breakdown("country") : Promise.resolve([]), location ? breakdown("city") : Promise.resolve([]), breakdown("outcome"),
  ]);

  res.json({
    days,
    maxDays,
    locked: { location: !location, olderHistory: requested > maxDays },
    totals: { scans, uniqueVisitors: uniques.length, blocked, lastScanAt: last?.scannedAt ?? null, allTime },
    daily, devices, os, browsers, countries, cities, outcomes,
  });
});
