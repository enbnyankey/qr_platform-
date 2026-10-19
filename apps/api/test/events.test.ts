import "./setup";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { outbox } from "../src/lib/mailer";
import { app as resolverApp } from "../../resolver/src/index";

/** Event pages: creating an event makes its QR code, drafts stay private, scans land on the page. */
const api = createApp();
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";

function lastCode(email: string) {
  const msg = [...outbox].reverse().find((m) => m.channel === "email" && m.to === email);
  return msg!.text.match(/\b(\d{6})\b/)![1];
}
async function signUp(email: string) {
  const agent = request.agent(api);
  await agent.post("/auth/register").send({ fullName: "Event Owner", email, password: "Passw0rd!" }).expect(201);
  await agent.post("/auth/verify").send({ email, code: lastCode(email) }).expect(200);
  return agent;
}

const theme = {
  template: "ivory", bg: "#faf6ee", surface: "#fffdf8", ink: "#2a2420", muted: "#7a6e62", accent: "#a8834a",
  headingFont: "Cormorant Garamond", bodyFont: "Jost", ornament: "frame",
};
const content = {
  eyebrow: "The wedding of", title: "Ama & Kofi", date: "2026-12-12", time: "10:00", venue: "Holy Spirit Cathedral",
  sections: [
    { id: "p1", kind: "programme", title: "Programme", items: [{ id: "i1", time: "10:00", title: "Arrival of guests", detail: "" }] },
    { id: "h1", kind: "hymns", title: "Hymns", items: [{ id: "x1", title: "Great is Thy Faithfulness", body: "Great is Thy faithfulness…" }] },
  ],
};

let owner: ReturnType<typeof request.agent>;
let orgId: string;

before(async () => {
  await prisma.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await prisma.$executeRawUnsafe("CREATE SCHEMA public");
  execFileSync(process.execPath, [path.resolve(__dirname, "../../../packages/db/scripts/prisma.js"), "migrate", "deploy"], { env: process.env, stdio: "ignore" });
  owner = await signUp("events@example.com");
  orgId = (await owner.post("/orgs").send({ name: "Mensah Events" }).expect(201)).body.organization.id;
});
after(() => prisma.$disconnect());

describe("Events", () => {
  let eventId: string;
  let code: string;

  test("creating an event also creates its QR code", async () => {
    const res = await owner
      .post(`/orgs/${orgId}/events`)
      .send({ kind: "wedding", title: "Ama & Kofi's wedding", theme, content, card: { headline: "Welcome to the wedding of Ama & Kofi", subline: "Scan for the programme" } })
      .expect(201);
    const e = res.body.event;
    eventId = e.id;
    assert.equal(e.isPublished, false);
    assert.equal(e.eventDate, "2026-12-12");
    assert.equal(e.qrCodes.length, 1);
    assert.equal(e.content.sections[0].items[0].title, "Arrival of guests");
    code = e.qrCodes[0].code;
    const qr = (await owner.get(`/orgs/${orgId}/qr/${e.qrCodes[0].id}`).expect(200)).body.qrCode;
    assert.equal(qr.type, "event");
    assert.equal(qr.targetUrl, `http://web.test/e/${eventId}`);
  });

  test("a draft isn't visible to guests; publishing makes it visible", async () => {
    const draft = await request(api).get(`/public/events/${eventId}`).expect(404);
    assert.equal(draft.body.error.code, "not_published");
    await owner.patch(`/orgs/${orgId}/events/${eventId}`).send({ isPublished: true }).expect(200);
    const pub = (await request(api).get(`/public/events/${eventId}`).expect(200)).body;
    assert.equal(pub.event.content.title, "Ama & Kofi");
    assert.equal(pub.event.theme.template, "ivory");
    assert.equal(pub.organization.name, "Mensah Events");
  });

  test("scanning the code redirects to the event page", async () => {
    const res = await request(resolverApp).get(`/q/${code}`).set("User-Agent", IPHONE).expect(302);
    assert.equal(res.headers.location, `http://web.test/e/${eventId}`);
  });

  test("content is validated and edits are saved", async () => {
    const bad = await owner.patch(`/orgs/${orgId}/events/${eventId}`).send({ theme: { ...theme, accent: "gold" } });
    assert.equal(bad.status, 400);
    const foreign = await owner
      .patch(`/orgs/${orgId}/events/${eventId}`)
      .send({ theme: { ...theme, coverImage: "/uploads/00000000-0000-0000-0000-000000000000/x.png" } });
    assert.equal(foreign.status, 400);
    const edited = { ...content, title: "Ama & Kofi Mensah", date: "2026-12-19" };
    const res = await owner.patch(`/orgs/${orgId}/events/${eventId}`).send({ content: edited, card: { size: "table", headline: "Akwaaba!" } }).expect(200);
    assert.equal(res.body.event.content.title, "Ama & Kofi Mensah");
    assert.equal(res.body.event.eventDate, "2026-12-19");
    assert.equal(res.body.event.card.size, "table");
  });

  test("an event that guests have scanned can't be deleted; a fresh one can", async () => {
    await new Promise((r) => setTimeout(r, 150)); // scan log is written fire-and-forget
    const res = await owner.delete(`/orgs/${orgId}/events/${eventId}`);
    assert.equal(res.status, 409);
    const fresh = (await owner.post(`/orgs/${orgId}/events`).send({ kind: "funeral", title: "Celebration of life", theme }).expect(201)).body.event;
    await owner.delete(`/orgs/${orgId}/events/${fresh.id}`).expect(200);
    assert.equal(await prisma.qrCode.count({ where: { eventId: fresh.id } }), 0);
    const list = (await owner.get(`/orgs/${orgId}/events`).expect(200)).body.events;
    assert.equal(list.length, 1);
    assert.equal(list[0].scansTotal, 1);
  });
});
