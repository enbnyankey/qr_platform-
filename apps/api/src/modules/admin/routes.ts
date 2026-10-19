import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireSuperAdmin } from "../../lib/auth";
import { invalidateQr } from "../../lib/cache";
import { notFound } from "../../lib/errors";
import { audit } from "../../lib/util";
import { shortUrl } from "../qr/routes";
import { getSettings, saveSettings } from "./settings";
import { entitlementsFor } from "../billing/entitlements";
import { serializePayment, serializePlan } from "../billing/service";

/** Platform administration (Super Admin only). */
export const adminRouter = Router();
adminRouter.use(requireAuth, requireSuperAdmin);

const search = z.object({ search: z.string().trim().max(80).optional() });
const contains = (q?: string) => (q ? { contains: q, mode: "insensitive" as const } : undefined);
const weekAgo = () => new Date(Date.now() - 7 * 86_400_000);

adminRouter.get("/stats", async (_req, res) => {
  const [users, users_7d, organizations, qr_codes, scans_7d, published_menus] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gt: weekAgo() } } }),
    prisma.organization.count(),
    prisma.qrCode.count(),
    prisma.scanEvent.count({ where: { scannedAt: { gt: weekAgo() } } }),
    prisma.menu.count({ where: { isPublished: true } }),
  ]);
  res.json({ stats: { users, users_7d, organizations, qr_codes, scans_7d, published_menus } });
});

adminRouter.get("/users", async (req, res) => {
  const { search: q } = search.parse(req.query);
  const users = await prisma.user.findMany({
    where: q ? { OR: [{ email: contains(q) }, { fullName: contains(q) }] } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { memberships: true } } },
  });
  res.json({
    users: users.map((u) => ({
      id: u.id, email: u.email, full_name: u.fullName, status: u.status, is_super_admin: u.isSuperAdmin,
      email_verified_at: u.emailVerifiedAt, created_at: u.createdAt, org_count: u._count.memberships,
    })),
  });
});

adminRouter.get("/organizations", async (req, res) => {
  const { search: q } = search.parse(req.query);
  const orgs = await prisma.organization.findMany({
    where: q ? { OR: [{ name: contains(q) }, { slug: contains(q) }] } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      subscription: true,
      _count: { select: { qrCodes: true } },
      memberships: { where: { role: "business_owner" }, take: 1, include: { user: { select: { email: true } } } },
    },
  });
  const scans = await prisma.scanEvent.groupBy({ by: ["orgId"], where: { orgId: { in: orgs.map((o) => o.id) }, scannedAt: { gt: weekAgo() } }, _count: { _all: true } });
  const s = new Map(scans.map((r) => [r.orgId, r._count._all]));
  res.json({
    organizations: orgs.map((o) => ({
      id: o.id, name: o.name, slug: o.slug, status: o.status, country: o.country, currency: o.currency, created_at: o.createdAt,
      qr_count: o._count.qrCodes, scans_7d: s.get(o.id) ?? 0, owner_email: o.memberships[0]?.user.email ?? null,
      plan_code: o.subscription?.planCode ?? "free", plan_status: o.subscription?.status ?? "active",
      plan_ends_at: o.subscription?.currentPeriodEnd ?? o.subscription?.trialEndsAt ?? null,
    })),
  });
});

adminRouter.get("/qr-codes", async (req, res) => {
  const { search: q } = search.parse(req.query);
  const codes = await prisma.qrCode.findMany({
    where: q ? { OR: [{ name: contains(q) }, { code: contains(q) }, { targetUrl: contains(q) }] } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { org: { select: { id: true, name: true } }, _count: { select: { scans: true } } },
  });
  res.json({
    qrCodes: codes.map((c) => ({
      id: c.id, code: c.code, name: c.name, type: c.type, status: c.status, target_url: c.targetUrl, created_at: c.createdAt,
      org_name: c.org.name, org_id: c.org.id, scans: c._count.scans, short_url: shortUrl(c.code),
    })),
  });
});

const statusBody = z.object({ status: z.enum(["active", "suspended"]) });

adminRouter.patch("/qr-codes/:id", async (req, res) => {
  const { status } = statusBody.parse(req.body);
  const before = await prisma.qrCode.findUnique({ where: { id: String(req.params.id) } });
  if (!before) throw notFound("QR code");
  const after = await prisma.qrCode.update({ where: { id: before.id }, data: { status } });
  await audit(req, { orgId: before.orgId, action: `admin.qr.${status === "suspended" ? "suspend" : "restore"}`, entity: "qr_code", entityId: before.id, before, after });
  await invalidateQr(before.code);
  res.json({ ok: true, status });
});

adminRouter.patch("/organizations/:id", async (req, res) => {
  const { status } = statusBody.parse(req.body);
  const before = await prisma.organization.findUnique({ where: { id: String(req.params.id) } });
  if (!before) throw notFound("Organization");
  await prisma.organization.update({ where: { id: before.id }, data: { status } });
  await audit(req, { orgId: before.id, action: `admin.org.${status === "suspended" ? "suspend" : "restore"}`, entity: "organization", entityId: before.id, before: { status: before.status }, after: { status } });
  const codes = await prisma.qrCode.findMany({ where: { orgId: before.id }, select: { code: true } });
  await Promise.all(codes.map((c) => invalidateQr(c.code)));
  res.json({ ok: true, status });
});

adminRouter.patch("/users/:id", async (req, res) => {
  const { status } = statusBody.parse(req.body);
  const before = await prisma.user.findUnique({ where: { id: String(req.params.id) }, select: { id: true, status: true } });
  if (!before) throw notFound("User");
  await prisma.user.update({ where: { id: before.id }, data: { status } });
  await audit(req, { action: `admin.user.${status === "suspended" ? "suspend" : "restore"}`, entity: "user", entityId: before.id, before, after: { status } });
  res.json({ ok: true, status });
});

adminRouter.get("/audit", async (_req, res) => {
  const entries = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const [users, orgs] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: entries.map((e) => e.actorId).filter(Boolean) as string[] } }, select: { id: true, email: true } }),
    prisma.organization.findMany({ where: { id: { in: entries.map((e) => e.orgId).filter(Boolean) as string[] } }, select: { id: true, name: true } }),
  ]);
  const u = new Map(users.map((x) => [x.id, x.email]));
  const o = new Map(orgs.map((x) => [x.id, x.name]));
  res.json({
    entries: entries.map((a) => ({
      id: a.id.toString(), action: a.action, entity: a.entity, entity_id: a.entityId, created_at: a.createdAt, ip: a.ip,
      actor_email: a.actorId ? u.get(a.actorId) ?? null : null, org_name: a.orgId ? o.get(a.orgId) ?? null : null,
    })),
  });
});

// ---------- platform configuration ----------
adminRouter.get("/settings", async (_req, res) => {
  res.json({ settings: await getSettings() });
});

adminRouter.put("/settings", async (req, res) => {
  const before = await getSettings();
  const settings = await saveSettings(req.body, req.user!.id);
  await audit(req, { action: "admin.settings.update", entity: "platform_settings", entityId: "platform", before, after: settings });
  res.json({ settings });
});

// ---------- billing ----------
const planInput = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200).nullable().optional(),
  priceMonthly: z.number().min(0).max(1_000_000),
  priceYearly: z.number().min(0).max(10_000_000),
  limits: z.object({
    maxQr: z.number().int().min(0),
    maxMenus: z.number().int().min(0),
    scansPerMonth: z.number().int().min(0),
    analyticsDays: z.number().int().min(1).max(365),
  }),
  features: z.object({ logo: z.boolean(), svgDownload: z.boolean(), locationAnalytics: z.boolean(), removeBranding: z.boolean() }),
  isActive: z.boolean(),
});

adminRouter.get("/plans", async (_req, res) => {
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { subscriptions: true } } } });
  res.json({ plans: plans.map((p) => ({ ...serializePlan(p), subscribers: p._count.subscriptions })) });
});

adminRouter.put("/plans/:code", async (req, res) => {
  const body = planInput.parse(req.body);
  const before = await prisma.plan.findUnique({ where: { code: String(req.params.code) } });
  if (!before) throw notFound("Plan");
  const after = await prisma.plan.update({
    where: { code: before.code },
    data: {
      name: body.name, description: body.description ?? null,
      priceMonthlyMinor: before.code === "free" ? 0n : BigInt(Math.round(body.priceMonthly * 100)),
      priceYearlyMinor: before.code === "free" ? 0n : BigInt(Math.round(body.priceYearly * 100)),
      limits: body.limits, features: body.features, isActive: before.code === "free" ? true : body.isActive,
    },
  });
  await audit(req, { action: "admin.plan.update", entity: "plan", entityId: before.code, before, after });
  res.json({ plan: serializePlan(after) });
});

/** Give a business a plan without payment (e.g. a partner or a goodwill extension). */
adminRouter.post("/organizations/:id/subscription", async (req, res) => {
  const body = z.object({ planCode: z.string().min(1), days: z.number().int().min(1).max(3650) }).parse(req.body);
  const org = await prisma.organization.findUnique({ where: { id: String(req.params.id) } });
  if (!org) throw notFound("Organization");
  const plan = await prisma.plan.findUnique({ where: { code: body.planCode } });
  if (!plan) throw notFound("Plan");
  const end = new Date(Date.now() + body.days * 86_400_000);
  const sub = await prisma.subscription.upsert({
    where: { orgId: org.id },
    create: { orgId: org.id, planCode: plan.code, status: "active", currentPeriodEnd: end, grantedById: req.user!.id },
    update: { planCode: plan.code, status: "active", currentPeriodEnd: end, trialEndsAt: null, grantedById: req.user!.id },
  });
  await audit(req, { orgId: org.id, action: "admin.subscription.grant", entity: "subscription", entityId: org.id, after: sub });
  res.json({ entitlements: await entitlementsFor(org.id) });
});

adminRouter.get("/payments", async (req, res) => {
  const { status } = z.object({ status: z.enum(["pending", "success", "failed", "abandoned"]).optional() }).parse(req.query);
  const payments = await prisma.payment.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { plan: true, org: { select: { name: true } } },
  });
  res.json({ payments: payments.map((p) => ({ ...serializePayment(p), orgName: p.org.name })) });
});
