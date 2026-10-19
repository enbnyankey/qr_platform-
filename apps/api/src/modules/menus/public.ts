import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { notFound } from "../../lib/errors";
import { getSettings } from "../admin/settings";
import { entitlementsFor } from "../billing/entitlements";
import { loadMenuTree } from "./routes";

/** Customer-facing, unauthenticated endpoints. Only published menus of active orgs are visible. */
export const publicRouter = Router();

publicRouter.get("/menus/:menuId", async (req, res) => {
  const menuId = String(req.params.menuId);
  if (!z.string().uuid().safeParse(menuId).success) throw notFound("Menu");
  const m = await prisma.menu.findFirst({ where: { id: menuId, isPublished: true, org: { status: "active" } }, include: { org: true } });
  if (!m) throw notFound("Menu");
  const ent = await entitlementsFor(m.orgId);
  res.setHeader("Cache-Control", "public, max-age=30");
  res.json({
    showPlatformBranding: !ent.features.removeBranding,
    menu: { id: m.id, name: m.name, description: m.description, updatedAt: m.updatedAt, sections: await loadMenuTree(m.id) },
    organization: { name: m.org.name, brandColor: m.org.brandColor, logoUrl: m.org.logoUrl, currency: m.org.currency, address: m.org.address, phone: m.org.phone },
  });
});

/** A published event page (wedding programme, funeral order of service, ...). */
publicRouter.get("/events/:eventId", async (req, res) => {
  const eventId = String(req.params.eventId);
  if (!z.string().uuid().safeParse(eventId).success) throw notFound("Event");
  const e = await prisma.event.findFirst({ where: { id: eventId, org: { status: "active" } }, include: { org: { select: { name: true } } } });
  if (!e) throw notFound("Event");
  if (!e.isPublished) return void res.status(404).json({ error: { code: "not_published", message: "This page isn't published yet." } });
  const ent = await entitlementsFor(e.orgId);
  res.setHeader("Cache-Control", "public, max-age=15");
  res.json({
    showPlatformBranding: !ent.features.removeBranding,
    event: { id: e.id, kind: e.kind, title: e.title, theme: e.theme, content: e.content, updatedAt: e.updatedAt },
    organization: { name: e.org.name },
  });
});

/** Public, non-sensitive platform settings the web app needs before sign-in. */
publicRouter.get("/settings", async (_req, res) => {
  const s = await getSettings();
  res.json({ signupsOpen: s.signupsOpen, announcement: s.announcement, supportEmail: s.supportEmail, allowedQrTypes: s.allowedQrTypes });
});
