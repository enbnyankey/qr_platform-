import { Router } from "express";
import { z } from "zod";
import { Prisma, prisma } from "../../db";
import { billing } from "@qr/db";
import { requireAuth, requireOrg } from "../../lib/auth";
import { notFound } from "../../lib/errors";
import { audit, randomCode, slugify } from "../../lib/util";
import type { Organization } from "@qr/db";

export const orgsRouter = Router();
orgsRouter.use(requireAuth);

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #0d6b5c.");
const orgFields = {
  name: z.string().trim().min(2, "Enter the business name.").max(120),
  businessType: z.string().trim().max(60).optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(240).optional().nullable(),
  country: z.string().length(2).toUpperCase().optional(),
  currency: z.string().length(3).toUpperCase().optional(),
  taxRatePercent: z.number().min(0).max(100).optional(),
  brandColor: hexColor.optional(),
  logoUrl: z.string().trim().max(500).optional().nullable(),
};

export function serializeOrg(o: Organization) {
  return {
    id: o.id, name: o.name, slug: o.slug, businessType: o.businessType, email: o.email, phone: o.phone,
    address: o.address, country: o.country, currency: o.currency, taxRatePercent: o.taxRateBps / 100,
    brandColor: o.brandColor, logoUrl: o.logoUrl, status: o.status, createdAt: o.createdAt,
  };
}

orgsRouter.post("/", async (req, res) => {
  const body = z.object(orgFields).parse(req.body);
  const org = await prisma.$transaction(async (tx) => {
    let slug = slugify(body.name);
    if (await tx.organization.findUnique({ where: { slug }, select: { id: true } })) slug = `${slug}-${randomCode(4).toLowerCase()}`;
    const created = await tx.organization.create({
      data: {
        name: body.name, slug, businessType: body.businessType ?? null, email: body.email || null, phone: body.phone ?? null,
        address: body.address ?? null, country: body.country, currency: body.currency,
        taxRateBps: Math.round((body.taxRatePercent ?? 0) * 100), brandColor: body.brandColor, logoUrl: body.logoUrl ?? null,
        createdById: req.user!.id,
        memberships: { create: { userId: req.user!.id, role: "business_owner" } },
      },
    });
    await billing.startSubscription(tx, prisma, created.id);
    await audit(req, { orgId: created.id, action: "org.create", entity: "organization", entityId: created.id, after: created }, tx);
    return created;
  });
  res.status(201).json({ organization: serializeOrg(org) });
});

orgsRouter.get("/:orgId", requireOrg(), async (req, res) => {
  const org = await prisma.organization.findUnique({ where: { id: req.org!.id } });
  if (!org) throw notFound("Organization");
  res.json({ organization: serializeOrg(org), role: req.org!.role });
});

orgsRouter.patch("/:orgId", requireOrg(["business_owner", "manager"]), async (req, res) => {
  const body = z.object(orgFields).partial().parse(req.body);
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: req.org!.id } });
  const data: Prisma.OrganizationUpdateInput = {
    name: body.name,
    businessType: body.businessType,
    email: body.email === undefined ? undefined : body.email || null,
    phone: body.phone,
    address: body.address,
    country: body.country,
    currency: body.currency,
    brandColor: body.brandColor,
    logoUrl: body.logoUrl,
    taxRateBps: body.taxRatePercent === undefined ? undefined : Math.round(body.taxRatePercent * 100),
  };
  const after = await prisma.organization.update({ where: { id: before.id }, data });
  await audit(req, { orgId: before.id, action: "org.update", entity: "organization", entityId: before.id, before, after });
  res.json({ organization: serializeOrg(after) });
});

/** Dashboard summary for the overview page. */
orgsRouter.get("/:orgId/overview", requireOrg(), async (req, res) => {
  const orgId = req.org!.id;
  const now = new Date();
  const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const [qrTotal, qrActive, menus, scans7d, scansPrev7d] = await Promise.all([
    prisma.qrCode.count({ where: { orgId } }),
    prisma.qrCode.count({ where: { orgId, status: "active", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
    prisma.menu.count({ where: { orgId } }),
    prisma.scanEvent.count({ where: { orgId, scannedAt: { gt: days(7) } } }),
    prisma.scanEvent.count({ where: { orgId, scannedAt: { gt: days(14), lte: days(7) } } }),
  ]);

  // Day buckets with zero-filled gaps: easiest to express in SQL.
  const daily = await prisma.$queryRaw<{ day: string; scans: number }[]>`
    SELECT to_char(d, 'YYYY-MM-DD') AS day, COALESCE(s.n, 0)::int AS scans
      FROM generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d
      LEFT JOIN (SELECT date_trunc('day', scanned_at) AS day, count(*) AS n FROM scan_events
                  WHERE org_id = ${orgId}::uuid AND scanned_at > now() - interval '14 days' GROUP BY 1) s ON s.day = d
     ORDER BY d`;

  const recent = await prisma.scanEvent.groupBy({
    by: ["qrId"],
    where: { orgId, scannedAt: { gt: days(7) } },
    _count: { _all: true },
  });
  const counts = new Map(recent.map((r) => [r.qrId, r._count._all]));
  const codes = await prisma.qrCode.findMany({ where: { orgId }, select: { id: true, name: true, type: true, code: true, createdAt: true } });
  const topQr = codes
    .map((q) => ({ id: q.id, name: q.name, type: q.type, code: q.code, scans: counts.get(q.id) ?? 0, createdAt: q.createdAt }))
    .sort((a, b) => b.scans - a.scans || b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5)
    .map(({ createdAt: _c, ...rest }) => rest);

  res.json({ counts: { qrTotal, qrActive, menus, scans7d, scansPrev7d }, daily, topQr });
});
