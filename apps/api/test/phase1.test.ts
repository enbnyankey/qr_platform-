import "./setup";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import bcrypt from "bcryptjs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { outbox } from "../src/lib/mailer";
import { clearSettingsCache } from "../src/modules/admin/settings";
import { app as resolverApp } from "../../resolver/src/index";

/**
 * End-to-end checks for the Phase 1 exit criteria in the delivery plan:
 * register/verify/login, organization setup, QR create/customize, dynamic destination,
 * status enforcement, scan analytics, digital menu via QR, and tenant isolation.
 */
const api = createApp();
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function lastCode(email: string) {
  const msg = [...outbox].reverse().find((m) => m.channel === "email" && m.to === email);
  assert.ok(msg, `no email sent to ${email}`);
  return msg.text.match(/\b(\d{6})\b/)![1];
}

async function signUp(email: string, name = "Ama Mensah") {
  const agent = request.agent(api);
  await agent.post("/auth/register").send({ fullName: name, email, password: "Passw0rd!" }).expect(201);
  await agent.post("/auth/verify").send({ email, code: lastCode(email) }).expect(200);
  return agent;
}

const scan = (code: string, ua = IPHONE) => request(resolverApp).get(`/q/${code}`).set("User-Agent", ua);
const waitForLogs = () => new Promise((r) => setTimeout(r, 150)); // scan logging is fire-and-forget

before(async () => {
  // Fresh schema from the Prisma migrations for every run.
  await prisma.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await prisma.$executeRawUnsafe("CREATE SCHEMA public");
  execFileSync(process.execPath, [path.resolve(__dirname, "../../../packages/db/scripts/prisma.js"), "migrate", "deploy"], {
    env: process.env,
    stdio: "ignore",
  });
});
after(async () => {
  await prisma.$disconnect();
});

describe("Phase 1 exit criteria", () => {
  let owner: ReturnType<typeof request.agent>;
  let orgId: string;
  let qr: any;

  test("a new user can register, verify by email code and sign in", async () => {
    const agent = request.agent(api);
    await agent.post("/auth/register").send({ fullName: "Kofi Asante", email: "kofi@example.com", password: "short" }).expect(400);
    await agent.post("/auth/register").send({ fullName: "Kofi Asante", email: "Kofi@Example.com", password: "Passw0rd!" }).expect(201);

    // Unverified login is refused and triggers a fresh code
    const blocked = await agent.post("/auth/login").send({ email: "kofi@example.com", password: "Passw0rd!" }).expect(403);
    assert.equal(blocked.body.error.code, "email_unverified");

    const wrong = lastCode("kofi@example.com") === "000000" ? "111111" : "000000";
    await agent.post("/auth/verify").send({ email: "kofi@example.com", code: wrong }).expect(400);
    await agent.post("/auth/verify").send({ email: "kofi@example.com", code: lastCode("kofi@example.com") }).expect(200);
    await agent.post("/auth/logout").expect(200);
    await agent.get("/auth/me").expect(401);

    await agent.post("/auth/login").send({ email: "kofi@example.com", password: "wrong-pass1" }).expect(401);
    await agent.post("/auth/login").send({ email: "kofi@example.com", password: "Passw0rd!" }).expect(200);
    const me = await agent.get("/auth/me").expect(200);
    assert.equal(me.body.user.email, "kofi@example.com");
    assert.deepEqual(me.body.organizations, []);
    owner = agent;
  });

  test("password reset with an emailed code", async () => {
    await request(api).post("/auth/forgot").send({ email: "kofi@example.com" }).expect(200);
    const code = lastCode("kofi@example.com");
    await request(api).post("/auth/reset").send({ email: "kofi@example.com", code, password: "NewPassw0rd" }).expect(200);
    await request(api).post("/auth/reset").send({ email: "kofi@example.com", code, password: "Another1pw" }).expect(400); // single use
    await owner.post("/auth/login").send({ email: "kofi@example.com", password: "NewPassw0rd" }).expect(200);
  });

  test("a business owner can create an organization and manage its profile", async () => {
    const res = await owner.post("/orgs").send({ name: "Kofi's Chop Bar", businessType: "restaurant", brandColor: "#b4471b" }).expect(201);
    orgId = res.body.organization.id;
    assert.equal(res.body.organization.slug, "kofi-s-chop-bar");
    assert.equal(res.body.organization.currency, "GHS");
    const me = await owner.get("/auth/me").expect(200);
    assert.equal(me.body.organizations[0].role, "business_owner");
    const upd = await owner.patch(`/orgs/${orgId}`).send({ phone: "+233240000000", taxRatePercent: 12.5 }).expect(200);
    assert.equal(upd.body.organization.taxRatePercent, 12.5);
  });

  test("an authorized user can create and customize a QR code; unsafe input is rejected", async () => {
    await owner.post(`/orgs/${orgId}/qr`).send({ name: "Bad", type: "url", payload: { url: "javascript:alert(1)" } }).expect(400);
    await owner.post(`/orgs/${orgId}/qr`).send({ name: "Faint", type: "url", payload: { url: "https://example.com" }, style: { fg: "#dddddd", bg: "#ffffff" } }).expect(400);

    const res = await owner
      .post(`/orgs/${orgId}/qr`)
      .send({ name: "Website", type: "url", payload: { url: "example.com/home" }, style: { fg: "#1a1a1a", bg: "#ffffff", ecc: "Q" } })
      .expect(201);
    qr = res.body.qrCode;
    assert.match(qr.code, /^[0-9A-Za-z]{8}$/);
    assert.equal(qr.shortUrl, `http://qr.test/q/${qr.code}`);
    assert.equal(qr.targetUrl, "https://example.com/home");
    assert.equal(qr.style.ecc, "Q");

    const png = await owner.get(`/orgs/${orgId}/qr/${qr.id}/image?format=png&size=256`).expect(200);
    assert.equal(png.headers["content-type"], "image/png");
    assert.deepEqual([...png.body.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    const svg = await owner.get(`/orgs/${orgId}/qr/${qr.id}/image?format=svg&download=1`).expect(200);
    assert.match(svg.headers["content-disposition"], /attachment/);
    assert.match(Buffer.from(svg.body).toString(), /<svg/);
  });

  test("scanning an active QR opens the correct destination and records the scan", async () => {
    const res = await scan(qr.code).expect(302);
    assert.equal(res.headers.location, "https://example.com/home");
    assert.equal(res.headers["cache-control"], "no-store");
    await scan(qr.code, "WhatsApp/2.23.20 A").expect(302); // link preview bot: redirected, not counted
    await waitForLogs();
    const a = await owner.get(`/orgs/${orgId}/qr/${qr.id}/analytics?days=7`).expect(200);
    assert.equal(a.body.totals.scans, 1);
    assert.equal(a.body.devices[0].label, "mobile");
    assert.equal(a.body.os[0].label, "iOS");
    assert.equal(a.body.daily.length, 7);
  });

  test("the destination changes without changing the printed code", async () => {
    const res = await owner.patch(`/orgs/${orgId}/qr/${qr.id}`).send({ payload: { url: "https://example.com/new-menu" } }).expect(200);
    assert.equal(res.body.qrCode.code, qr.code);
    const s = await scan(qr.code).expect(302);
    assert.equal(s.headers.location, "https://example.com/new-menu");
    const detail = await owner.get(`/orgs/${orgId}/qr/${qr.id}`).expect(200);
    assert.equal(detail.body.history.length, 2);
  });

  test("inactive, expired and suspended states are enforced", async () => {
    await owner.patch(`/orgs/${orgId}/qr/${qr.id}`).send({ status: "inactive" }).expect(200);
    assert.match((await scan(qr.code).expect(410)).text, /isn't active/);

    await owner.patch(`/orgs/${orgId}/qr/${qr.id}`).send({ status: "active", expiresAt: new Date(Date.now() - 60_000).toISOString() }).expect(200);
    assert.match((await scan(qr.code).expect(410)).text, /expired/);
    const list = await owner.get(`/orgs/${orgId}/qr?status=expired`).expect(200);
    assert.equal(list.body.qrCodes[0].effectiveStatus, "expired");

    await owner.patch(`/orgs/${orgId}/qr/${qr.id}`).send({ expiresAt: null }).expect(200);
    await scan(qr.code).expect(302);

    // Platform suspension: owner cannot re-enable it
    await prisma.user.create({ data: { email: "root@example.com", fullName: "Root", passwordHash: await bcrypt.hash("Admin12345", 4), emailVerifiedAt: new Date(), isSuperAdmin: true } });
    const admin = request.agent(api);
    await admin.post("/auth/login").send({ email: "root@example.com", password: "Admin12345" }).expect(200);
    await admin.patch(`/admin/qr-codes/${qr.id}`).send({ status: "suspended" }).expect(200);
    assert.match((await scan(qr.code).expect(410)).text, /suspended/);
    await owner.patch(`/orgs/${orgId}/qr/${qr.id}`).send({ status: "active" }).expect(400);
    await admin.patch(`/admin/qr-codes/${qr.id}`).send({ status: "active" }).expect(200);
    await scan(qr.code).expect(302);
    await owner.get("/admin/stats").expect(403);

    await waitForLogs();
    const a = await owner.get(`/orgs/${orgId}/qr/${qr.id}/analytics`).expect(200);
    assert.ok(a.body.totals.blocked >= 3);
  });

  test("a digital menu can be created and opened from a QR code", async () => {
    const menu = (await owner.post(`/orgs/${orgId}/menus`).send({ name: "Lunch" }).expect(201)).body.menu;
    const section = (await owner.post(`/orgs/${orgId}/menus/${menu.id}/sections`).send({ name: "Mains" }).expect(201)).body.section;
    const item = (await owner.post(`/orgs/${orgId}/menus/${menu.id}/sections/${section.id}/items`).send({ name: "Jollof & chicken", price: 85.5 }).expect(201)).body.item;
    assert.equal(item.priceMinor, 8550);
    assert.equal(item.currency, "GHS");
    await owner.patch(`/orgs/${orgId}/menus/${menu.id}/items/${item.id}`).send({ isAvailable: false }).expect(200);

    await request(api).get(`/public/menus/${menu.id}`).expect(404); // not published yet
    await owner.patch(`/orgs/${orgId}/menus/${menu.id}`).send({ isPublished: true }).expect(200);
    const pub = await request(api).get(`/public/menus/${menu.id}`).expect(200);
    assert.equal(pub.body.organization.brandColor, "#b4471b");
    assert.equal(pub.body.menu.sections[0].items[0].isAvailable, false);

    const mq = (await owner.post(`/orgs/${orgId}/qr`).send({ name: "Table menu", type: "menu", payload: { menuId: menu.id } }).expect(201)).body.qrCode;
    const s = await scan(mq.code).expect(302);
    assert.equal(s.headers.location, `http://web.test/m/${menu.id}`);
    await owner.delete(`/orgs/${orgId}/menus/${menu.id}`).expect(400); // still referenced by a QR
  });

  test("contact and text codes are served by the resolver", async () => {
    const c = (await owner.post(`/orgs/${orgId}/qr`).send({ name: "Card", type: "contact", payload: { firstName: "Kofi", lastName: "Asante", phone: "+233240000000", email: "kofi@example.com" } }).expect(201)).body.qrCode;
    const v = await scan(c.code).expect(200);
    assert.match(v.headers["content-type"], /text\/vcard/);
    assert.match(v.text, /FN:Kofi Asante/);
    const t = (await owner.post(`/orgs/${orgId}/qr`).send({ name: "Wifi note", type: "text", payload: { text: "<b>Password</b>: chopbar2026" } }).expect(201)).body.qrCode;
    const page = await scan(t.code).expect(200);
    assert.match(page.text, /&lt;b&gt;Password/); // escaped
  });

  test("organizations are isolated from each other", async () => {
    const other = await signUp("esi@example.com", "Esi Owusu");
    const otherOrg = (await other.post("/orgs").send({ name: "Esi Events" }).expect(201)).body.organization;
    await other.get(`/orgs/${orgId}`).expect(403);
    await other.get(`/orgs/${orgId}/qr`).expect(403);
    await other.get(`/orgs/${orgId}/qr/${qr.id}/image`).expect(403);
    await other.get(`/orgs/${otherOrg.id}/qr/${qr.id}`).expect(404); // right org, wrong record
    const ownerMenus = (await owner.get(`/orgs/${orgId}/menus`).expect(200)).body.menus;
    await other.post(`/orgs/${otherOrg.id}/qr`).send({ name: "x", type: "menu", payload: { menuId: ownerMenus[0].id } }).expect(400);
  });

  test("a scanned code can't be deleted; an unscanned one can", async () => {
    await owner.delete(`/orgs/${orgId}/qr/${qr.id}`).expect(409);
    const fresh = (await owner.post(`/orgs/${orgId}/qr`).send({ name: "Draft", type: "location", payload: { address: "Osu, Accra" } }).expect(201)).body.qrCode;
    assert.match(fresh.targetUrl, /maps\/search\/\?api=1&query=Osu%2C%20Accra/);
    await owner.delete(`/orgs/${orgId}/qr/${fresh.id}`).expect(200);
  });

  test("overview summarises the organization", async () => {
    const o = await owner.get(`/orgs/${orgId}/overview`).expect(200);
    assert.equal(o.body.counts.qrTotal, 4);
    assert.equal(o.body.counts.menus, 1);
    assert.ok(o.body.counts.scans7d >= 4);
    assert.equal(o.body.daily.length, 14);
  });

  test("a logo can be placed in the centre of a code (forces high error correction)", async () => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64",
    );
    const up = await owner.post(`/orgs/${orgId}/uploads`).attach("file", png, { filename: "logo.png", contentType: "image/png" }).expect(201);
    const res = await owner
      .post(`/orgs/${orgId}/qr`)
      .send({ name: "Branded", type: "url", payload: { url: "https://example.com" }, style: { logo: { path: up.body.path, size: 20 } } })
      .expect(201);
    assert.equal(res.body.qrCode.style.ecc, "H");
    const img = await owner.get(`/orgs/${orgId}/qr/${res.body.qrCode.id}/image?format=png&size=512`).expect(200);
    assert.deepEqual([...img.body.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    const svg = await owner.get(`/orgs/${orgId}/qr/${res.body.qrCode.id}/image?format=svg`).expect(200);
    assert.match(Buffer.from(svg.body).toString(), /<image /);
    // Another org's upload path is rejected
    await owner.post(`/orgs/${orgId}/qr`).send({ name: "x", type: "url", payload: { url: "https://example.com" }, style: { logo: { path: "/uploads/00000000-0000-0000-0000-000000000000/a.png" } } }).expect(400);
    fs.rmSync(path.resolve(__dirname, "../uploads", orgId), { recursive: true, force: true });
  });

  test("scans record coarse location from CDN headers", async () => {
    const q = (await owner.post(`/orgs/${orgId}/qr`).send({ name: "Geo", type: "url", payload: { url: "https://example.com/geo" } }).expect(201)).body.qrCode;
    await scan(q.code).set("cf-ipcountry", "GH").set("cf-ipcity", "Kumasi").expect(302);
    await waitForLogs();
    const a = await owner.get(`/orgs/${orgId}/qr/${q.id}/analytics`).expect(200);
    assert.equal(a.body.countries[0].label, "GH");
    assert.equal(a.body.cities[0].label, "Kumasi");
  });

  test("a phone number gets the verification code by SMS as well", async () => {
    await request(api).post("/auth/register").send({ fullName: "Yaw Mensah", email: "yaw@example.com", password: "Passw0rd!", phone: "024 000 0000" }).expect(201);
    const sms = [...outbox].reverse().find((m) => m.channel === "sms");
    assert.equal(sms?.to, "233240000000");
    assert.equal(sms?.text.match(/\d{6}/)?.[0], lastCode("yaw@example.com"));
  });

  test("platform settings: admins control sign-ups, QR types and limits", async () => {
    const admin = request.agent(api);
    await admin.post("/auth/login").send({ email: "root@example.com", password: "Admin12345" }).expect(200);
    await owner.put("/admin/settings").send({ signupsOpen: false }).expect(403);
    const saved = await admin
      .put("/admin/settings")
      .send({ signupsOpen: false, allowedQrTypes: ["url", "menu"], maxQrPerOrg: 0, announcement: "Maintenance on Sunday 2am" })
      .expect(200);
    assert.equal(saved.body.settings.signupsOpen, false);
    const pub = await request(api).get("/public/settings").expect(200);
    assert.equal(pub.body.announcement, "Maintenance on Sunday 2am");
    await request(api).post("/auth/register").send({ fullName: "Late Comer", email: "late@example.com", password: "Passw0rd!" }).expect(403);
    await owner.post(`/orgs/${orgId}/qr`).send({ name: "t", type: "text", payload: { text: "hi" } }).expect(400);
    const total = (await owner.get(`/orgs/${orgId}/qr`).expect(200)).body.qrCodes.length;
    await admin.put("/admin/settings").send({ signupsOpen: true, maxQrPerOrg: total }).expect(200);
    await owner.post(`/orgs/${orgId}/qr`).send({ name: "over", type: "url", payload: { url: "https://example.com" } }).expect(400);
    await admin.put("/admin/settings").send({ maxQrPerOrg: 0, announcement: "", allowedQrTypes: ["url", "social", "document", "contact", "location", "menu", "text"] }).expect(200);
    clearSettingsCache();
  });
});
