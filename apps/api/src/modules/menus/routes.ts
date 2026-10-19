import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireOrg } from "../../lib/auth";
import { badRequest, notFound } from "../../lib/errors";
import { audit } from "../../lib/util";
import { getSettings } from "../admin/settings";
import { assertCanCreate, assertCanEdit } from "../billing/entitlements";
import type { Menu, MenuItem } from "@qr/db";

/** Merchant-side menu management: /orgs/:orgId/menus */
export const menusRouter = Router({ mergeParams: true });
menusRouter.use(requireAuth, requireOrg());
const canEdit = requireOrg(["business_owner", "manager"]);
// When a plan has lapsed and the business is over the Free limits, menus become read-only until renewal.
menusRouter.use(async (req, _res, next) => {
  if (req.method === "GET" || req.method === "DELETE" || (req.method === "POST" && req.path === "/")) return next();
  try {
    await assertCanEdit(req.org!.id);
    next();
  } catch (err) {
    next(err);
  }
});

const uuid = z.string().uuid();
const price = z.number({ invalid_type_error: "Enter a price." }).min(0).max(10_000_000);
const toMinor = (major: number) => BigInt(Math.round(major * 100));

async function menuInOrg(orgId: string, menuId: string) {
  if (!uuid.safeParse(menuId).success) throw notFound("Menu");
  const m = await prisma.menu.findFirst({ where: { id: menuId, orgId } });
  if (!m) throw notFound("Menu");
  return m;
}

export function serializeItem(i: MenuItem) {
  return {
    id: i.id, sectionId: i.sectionId, name: i.name, description: i.description, priceMinor: Number(i.priceMinor),
    price: Number(i.priceMinor) / 100, currency: i.currency, imageUrl: i.imageUrl, isAvailable: i.isAvailable, sortOrder: i.sortOrder,
  };
}

/** Full menu tree. Used by the editor and (published only) by the public page. */
export async function loadMenuTree(menuId: string) {
  const sections = await prisma.menuSection.findMany({
    where: { menuId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  return sections.map((s) => ({ id: s.id, name: s.name, description: s.description, sortOrder: s.sortOrder, items: s.items.map(serializeItem) }));
}

function serializeMenu(m: Menu) {
  return { id: m.id, name: m.name, description: m.description, isPublished: m.isPublished, createdAt: m.createdAt, updatedAt: m.updatedAt };
}

const touch = (menuId: string) => prisma.menu.update({ where: { id: menuId }, data: { updatedAt: new Date() } });

// ---------- menus ----------
menusRouter.get("/", async (req, res) => {
  const menus = await prisma.menu.findMany({
    where: { orgId: req.org!.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { qrCodes: true } }, sections: { select: { _count: { select: { items: true } } } } },
  });
  res.json({
    menus: menus.map((m) => ({
      ...serializeMenu(m),
      itemCount: m.sections.reduce((n, s) => n + s._count.items, 0),
      qrCount: m._count.qrCodes,
    })),
  });
});

menusRouter.post("/", canEdit, async (req, res) => {
  const body = z.object({ name: z.string().trim().min(1, "Name the menu.").max(120), description: z.string().trim().max(500).optional() }).parse(req.body);
  const { maxMenusPerOrg } = await getSettings();
  if (maxMenusPerOrg > 0 && (await prisma.menu.count({ where: { orgId: req.org!.id } })) >= maxMenusPerOrg) {
    throw badRequest(`This business has reached the limit of ${maxMenusPerOrg} menus.`);
  }
  await assertCanCreate(req.org!.id, "menus");
  const m = await prisma.menu.create({ data: { orgId: req.org!.id, name: body.name, description: body.description ?? null } });
  await audit(req, { orgId: req.org!.id, action: "menu.create", entity: "menu", entityId: m.id, after: m });
  res.status(201).json({ menu: serializeMenu(m) });
});

menusRouter.get("/:menuId", async (req, res) => {
  const m = await menuInOrg(req.org!.id, String(req.params.menuId));
  const qrCodes = await prisma.qrCode.findMany({ where: { menuId: m.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, code: true } });
  res.json({ menu: { ...serializeMenu(m), sections: await loadMenuTree(m.id), qrCodes } });
});

menusRouter.patch("/:menuId", canEdit, async (req, res) => {
  const body = z
    .object({ name: z.string().trim().min(1).max(120).optional(), description: z.string().trim().max(500).nullable().optional(), isPublished: z.boolean().optional() })
    .parse(req.body);
  const before = await menuInOrg(req.org!.id, String(req.params.menuId));
  const after = await prisma.menu.update({ where: { id: before.id }, data: { name: body.name, description: body.description, isPublished: body.isPublished } });
  await audit(req, { orgId: req.org!.id, action: "menu.update", entity: "menu", entityId: before.id, before, after });
  res.json({ menu: serializeMenu(after) });
});

menusRouter.delete("/:menuId", canEdit, async (req, res) => {
  const m = await menuInOrg(req.org!.id, String(req.params.menuId));
  if ((await prisma.qrCode.count({ where: { menuId: m.id } })) > 0) throw badRequest("QR codes still point to this menu. Point them somewhere else first.");
  await prisma.menu.delete({ where: { id: m.id } });
  await audit(req, { orgId: req.org!.id, action: "menu.delete", entity: "menu", entityId: m.id, before: m });
  res.json({ ok: true });
});

// ---------- sections ----------
async function sectionInMenu(menuId: string, sectionId: string) {
  if (!uuid.safeParse(sectionId).success) throw notFound("Section");
  const s = await prisma.menuSection.findFirst({ where: { id: sectionId, menuId } });
  if (!s) throw notFound("Section");
  return s;
}

menusRouter.post("/:menuId/sections", canEdit, async (req, res) => {
  const m = await menuInOrg(req.org!.id, String(req.params.menuId));
  const body = z.object({ name: z.string().trim().min(1, "Name the section.").max(80), description: z.string().trim().max(300).optional() }).parse(req.body);
  const last = await prisma.menuSection.aggregate({ where: { menuId: m.id }, _max: { sortOrder: true } });
  const s = await prisma.menuSection.create({
    data: { orgId: req.org!.id, menuId: m.id, name: body.name, description: body.description ?? null, sortOrder: (last._max.sortOrder ?? -1) + 1 },
  });
  res.status(201).json({ section: { id: s.id, name: s.name, description: s.description, sortOrder: s.sortOrder, items: [] } });
});

/** Reorder sections by sending the full ordered list of ids. (Declared before /:sectionId routes.) */
menusRouter.put("/:menuId/sections/order", canEdit, async (req, res) => {
  const m = await menuInOrg(req.org!.id, String(req.params.menuId));
  const { ids } = z.object({ ids: z.array(uuid) }).parse(req.body);
  await prisma.$transaction(ids.map((id, i) => prisma.menuSection.updateMany({ where: { id, menuId: m.id }, data: { sortOrder: i } })));
  res.json({ ok: true });
});

menusRouter.patch("/:menuId/sections/:sectionId", canEdit, async (req, res) => {
  const m = await menuInOrg(req.org!.id, String(req.params.menuId));
  const body = z
    .object({ name: z.string().trim().min(1).max(80).optional(), description: z.string().trim().max(300).nullable().optional(), sortOrder: z.number().int().optional() })
    .parse(req.body);
  const before = await sectionInMenu(m.id, String(req.params.sectionId));
  const s = await prisma.menuSection.update({ where: { id: before.id }, data: body });
  res.json({ section: { id: s.id, name: s.name, description: s.description, sortOrder: s.sortOrder } });
});

menusRouter.delete("/:menuId/sections/:sectionId", canEdit, async (req, res) => {
  const m = await menuInOrg(req.org!.id, String(req.params.menuId));
  await prisma.menuSection.deleteMany({ where: { id: String(req.params.sectionId), menuId: m.id } });
  res.json({ ok: true });
});

// ---------- items ----------
const itemInput = z.object({
  name: z.string().trim().min(1, "Name the item.").max(120),
  description: z.string().trim().max(500).nullable().optional(),
  price,
  imageUrl: z.string().trim().max(500).nullable().optional(),
  isAvailable: z.boolean().optional(),
});

async function itemInMenu(menuId: string, itemId: string) {
  if (!uuid.safeParse(itemId).success) throw notFound("Item");
  const item = await prisma.menuItem.findFirst({ where: { id: itemId, section: { menuId } } });
  if (!item) throw notFound("Item");
  return item;
}

menusRouter.post("/:menuId/sections/:sectionId/items", canEdit, async (req, res) => {
  const m = await menuInOrg(req.org!.id, String(req.params.menuId));
  const section = await sectionInMenu(m.id, String(req.params.sectionId));
  const body = itemInput.parse(req.body);
  const last = await prisma.menuItem.aggregate({ where: { sectionId: section.id }, _max: { sortOrder: true } });
  const item = await prisma.menuItem.create({
    data: {
      orgId: req.org!.id, sectionId: section.id, name: body.name, description: body.description ?? null, priceMinor: toMinor(body.price),
      currency: req.org!.currency, imageUrl: body.imageUrl ?? null, isAvailable: body.isAvailable ?? true, sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
  });
  await touch(m.id);
  res.status(201).json({ item: serializeItem(item) });
});

menusRouter.patch("/:menuId/items/:itemId", canEdit, async (req, res) => {
  const m = await menuInOrg(req.org!.id, String(req.params.menuId));
  const body = itemInput.partial().extend({ sectionId: uuid.optional(), sortOrder: z.number().int().optional() }).parse(req.body);
  if (body.sectionId) await sectionInMenu(m.id, body.sectionId);
  const before = await itemInMenu(m.id, String(req.params.itemId));
  const item = await prisma.menuItem.update({
    where: { id: before.id },
    data: {
      name: body.name, description: body.description, imageUrl: body.imageUrl, isAvailable: body.isAvailable,
      sectionId: body.sectionId, sortOrder: body.sortOrder, priceMinor: body.price === undefined ? undefined : toMinor(body.price),
    },
  });
  await touch(m.id);
  res.json({ item: serializeItem(item) });
});

menusRouter.delete("/:menuId/items/:itemId", canEdit, async (req, res) => {
  const m = await menuInOrg(req.org!.id, String(req.params.menuId));
  await prisma.menuItem.deleteMany({ where: { id: String(req.params.itemId), section: { menuId: m.id } } });
  await touch(m.id);
  res.json({ ok: true });
});
