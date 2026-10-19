import "./setup";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { outbox } from "../src/lib/mailer";
import { app as resolverApp } from "../../resolver/src/index";

/**
 * Billing: free plan limits, trials, the test checkout, Paystack webhooks,
 * idempotent payment application and both lapse policies.
 */
const api = createApp();
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
const scan = (code: string) => request(resolverApp).get(`/q/${code}`).set("User-Agent", IPHONE);
const wait = () => new Promise((r) => setTimeout(r, 150));

function lastCode(email: string) {
  const msg = [...outbox].reverse().find((m) => m.channel === "email" && m.to === email);
  return msg!.text.match(/\b(\d{6})\b/)![1];
}
async function signUp(email: string) {
  const agent = request.agent(api);
  await agent.post("/auth/register").send({ fullName: "Test Owner", email, password: "Passw0rd!" }).expect(201);
  await agent.post("/auth/verify").send({ email, code: lastCode(email) }).expect(200);
  return agent;
}
const newQr = (agent: any, orgId: string, name: string) =>
  agent.post(`/orgs/${orgId}/qr`).send({ name, type: "url", payload: { url: `https://example.com/${name}` } });

let admin: ReturnType<typeof request.agent>;
const realFetch = globalThis.fetch;

before(async () => {
  await prisma.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await prisma.$executeRawUnsafe("CREATE SCHEMA public");
  execFileSync(process.execPath, [path.resolve(__dirname, "../../../packages/db/scripts/prisma.js"), "migrate", "deploy"], { env: process.env, stdio: "ignore" });
  await prisma.user.create({ data: { email: "root@example.com", fullName: "Root", passwordHash: await bcrypt.hash("Admin12345", 4), emailVerifiedAt: new Date(), isSuperAdmin: true } });
  admin = request.agent(api);
  await admin.post("/auth/login").send({ email: "root@example.com", password: "Admin12345" }).expect(200);
});
after(async () => {
  globalThis.fetch = realFetch;
  await prisma.$disconnect();
});

describe("Billing", () => {
  test("a new business starts on a Pro trial", async () => {
    const owner = await signUp("trial@example.com");
    const org = (await owner.post("/orgs").send({ name: "Trial Shop" }).expect(201)).body.organization;
    const b = (await owner.get(`/orgs/${org.id}/billing`).expect(200)).body;
    assert.equal(b.entitlements.state, "trial");
    assert.equal(b.entitlements.planCode, "pro");
    assert.equal(b.entitlements.daysLeft, 14);
    assert.deepEqual(b.plans.map((p: any) => p.code), ["free", "basic", "pro"]);
    assert.equal(b.provider.name, "test");
  });

  let owner: ReturnType<typeof request.agent>;
  let orgId: string;
  const codes: any[] = [];

  test("the Free plan asks for payment at its limits and for premium features", async () => {
    await admin.put("/admin/settings").send({ trialDays: 0 }).expect(200);
    owner = await signUp("free@example.com");
    orgId = (await owner.post("/orgs").send({ name: "Free Shop" }).expect(201)).body.organization.id;
    assert.equal((await owner.get(`/orgs/${orgId}/billing`)).body.entitlements.state, "free");

    for (const n of ["a", "b", "c"]) codes.push((await newQr(owner, orgId, n).expect(201)).body.qrCode);
    const over = await newQr(owner, orgId, "d").expect(402);
    assert.equal(over.body.error.code, "upgrade_required");
    assert.equal(over.body.error.details.reason, "qr_limit");

    await owner.post(`/orgs/${orgId}/menus`).send({ name: "Lunch" }).expect(201);
    assert.equal((await owner.post(`/orgs/${orgId}/menus`).send({ name: "Dinner" }).expect(402)).body.error.details.reason, "menus_limit");

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const up = await owner.post(`/orgs/${orgId}/uploads`).attach("file", png, { filename: "l.png", contentType: "image/png" }).expect(201);
    const logo = await owner.patch(`/orgs/${orgId}/qr/${codes[0].id}`).send({ style: { logo: { path: up.body.path, size: 20 } } }).expect(402);
    assert.equal(logo.body.error.details.feature, "logo");
    await owner.get(`/orgs/${orgId}/qr/${codes[0].id}/image?format=svg`).expect(402);
    await owner.get(`/orgs/${orgId}/qr/${codes[0].id}/image?format=png`).expect(200);

    const stats = (await owner.get(`/orgs/${orgId}/qr/${codes[0].id}/analytics?days=30`).expect(200)).body;
    assert.equal(stats.days, 7);
    assert.equal(stats.locked.location, true);
    assert.equal(stats.locked.olderHistory, true);
  });

  let reference: string;

  test("paying through the test checkout upgrades the plan exactly once", async () => {
    const co = (await owner.post(`/orgs/${orgId}/billing/checkout`).send({ planCode: "basic", interval: "month" }).expect(201)).body;
    reference = co.reference;
    assert.equal(co.checkoutUrl, `http://web.test/pay/test/${reference}`);

    // Still pending until the customer pays
    assert.equal((await owner.get(`/orgs/${orgId}/billing/payments/${reference}`).expect(200)).body.payment.status, "pending");

    const page = (await request(api).get(`/public/test-payments/${reference}`).expect(200)).body;
    assert.equal(page.amountMinor, 4900);
    assert.equal(page.planName, "Basic");
    const paid = (await request(api).post(`/public/test-payments/${reference}`).send({ outcome: "success" }).expect(200)).body;
    assert.match(paid.returnUrl, /\/app\/billing\/return\?reference=/);

    const [r1, r2] = await Promise.all([
      owner.get(`/orgs/${orgId}/billing/payments/${reference}`).expect(200),
      owner.get(`/orgs/${orgId}/billing/payments/${reference}`).expect(200),
    ]);
    assert.equal(r1.body.payment.status, "success");
    assert.equal(r2.body.payment.status, "success");
    assert.equal(r1.body.entitlements.state, "active");
    assert.equal(r1.body.entitlements.planCode, "basic");
    const days = r1.body.entitlements.daysLeft;
    assert.ok(days >= 28 && days <= 31, `expected about a month, got ${days}`);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { orgId } });
    assert.equal(sub.currentPeriodEnd?.getTime(), new Date(r1.body.payment.periodEnd).getTime());

    await newQr(owner, orgId, "d").expect(201); // the 4th code is now allowed
    const audits = await prisma.auditLog.count({ where: { orgId, action: "billing.payment_success" } });
    assert.equal(audits, 1);
  });

  test("renewing the same plan early adds to the remaining time", async () => {
    const before = (await prisma.subscription.findUniqueOrThrow({ where: { orgId } })).currentPeriodEnd!;
    const co = (await owner.post(`/orgs/${orgId}/billing/checkout`).send({ planCode: "basic", interval: "month" }).expect(201)).body;
    await request(api).post(`/public/test-payments/${co.reference}`).send({ outcome: "success" }).expect(200);
    const res = (await owner.get(`/orgs/${orgId}/billing/payments/${co.reference}`).expect(200)).body;
    assert.equal(new Date(res.payment.periodStart).getTime(), before.getTime());
    assert.ok(res.entitlements.daysLeft >= 58);
  });

  test("failed and cancelled payments change nothing", async () => {
    const fail = (await owner.post(`/orgs/${orgId}/billing/checkout`).send({ planCode: "pro", interval: "year" }).expect(201)).body;
    await request(api).post(`/public/test-payments/${fail.reference}`).send({ outcome: "fail" }).expect(200);
    const r = (await owner.get(`/orgs/${orgId}/billing/payments/${fail.reference}`).expect(200)).body;
    assert.equal(r.payment.status, "failed");
    assert.equal(r.entitlements.planCode, "basic");
    await request(api).post(`/public/test-payments/${fail.reference}`).send({ outcome: "success" }).expect(400); // already finished
  });

  test("only the business owner can pay; other businesses can't see the payment", async () => {
    const other = await signUp("other@example.com");
    await other.post("/orgs").send({ name: "Other" }).expect(201);
    await other.get(`/orgs/${orgId}/billing/payments/${reference}`).expect(403);
    await admin.post(`/orgs/${orgId}/billing/checkout`).send({ planCode: "basic", interval: "month" }).expect(201); // super admin may
  });

  test("Paystack webhooks need a valid signature and are re-verified with Paystack", async () => {
    const pay = await prisma.payment.create({
      data: { orgId, planCode: "pro", interval: "month", amountMinor: 14900n, currency: "GHS", provider: "paystack", reference: "PSK-TEST-1" },
    });
    const body = JSON.stringify({ event: "charge.success", data: { reference: pay.reference, amount: 14900 } });
    await request(api).post("/webhooks/paystack").set("Content-Type", "application/json").set("x-paystack-signature", "bad").send(body).expect(401);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: pay.id } })).status, "pending");

    let verifyCalls = 0;
    globalThis.fetch = (async (url: any, init?: any) => {
      if (String(url).startsWith("https://api.paystack.co/transaction/verify/")) {
        verifyCalls++;
        return new Response(JSON.stringify({ status: true, data: { status: "success", amount: 14900, currency: "GHS", channel: "mobile_money", id: 99 } }), { status: 200 });
      }
      return realFetch(url, init);
    }) as typeof fetch;
    const sig = crypto.createHmac("sha512", "sk_test_dummy").update(body).digest("hex");
    await request(api).post("/webhooks/paystack").set("Content-Type", "application/json").set("x-paystack-signature", sig).send(body).expect(200);
    await wait();
    const done = await prisma.payment.findUniqueOrThrow({ where: { id: pay.id } });
    assert.equal(done.status, "success");
    assert.equal(done.channel, "mobile_money");
    assert.equal(verifyCalls, 1);
    assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { orgId } })).planCode, "pro");
    // A duplicate webhook does nothing
    await request(api).post("/webhooks/paystack").set("Content-Type", "application/json").set("x-paystack-signature", sig).send(body).expect(200);
    await wait();
    assert.equal(verifyCalls, 1);
    assert.equal(await prisma.paymentWebhook.count({ where: { reference: "PSK-TEST-1" } }), 3);

    // Wrong amount is never applied
    const bad = await prisma.payment.create({
      data: { orgId, planCode: "pro", interval: "year", amountMinor: 149000n, currency: "GHS", provider: "paystack", reference: "PSK-TEST-2" },
    });
    globalThis.fetch = (async () => new Response(JSON.stringify({ status: true, data: { status: "success", amount: 100, currency: "GHS" } }), { status: 200 })) as typeof fetch;
    const body2 = JSON.stringify({ event: "charge.success", data: { reference: bad.reference } });
    const sig2 = crypto.createHmac("sha512", "sk_test_dummy").update(body2).digest("hex");
    await request(api).post("/webhooks/paystack").set("Content-Type", "application/json").set("x-paystack-signature", sig2).send(body2).expect(200);
    await wait();
    const badDone = await prisma.payment.findUniqueOrThrow({ where: { id: bad.id } });
    assert.equal(badDone.status, "failed");
    assert.match(badDone.failureNote ?? "", /Amount mismatch/);
    globalThis.fetch = realFetch;
  });

  test("lapsed plan with the default policy: codes keep working, editing is locked", async () => {
    await prisma.subscription.update({ where: { orgId }, data: { currentPeriodEnd: new Date(Date.now() - 60_000) } });
    const e = (await owner.get(`/orgs/${orgId}/billing`).expect(200)).body.entitlements;
    assert.equal(e.state, "lapsed");
    assert.equal(e.planCode, "free");
    assert.equal(e.overLimit.qr, true);

    const newest = (await owner.get(`/orgs/${orgId}/qr`).expect(200)).body.qrCodes[0];
    assert.equal((await owner.patch(`/orgs/${orgId}/qr/${newest.id}`).send({ payload: { url: "https://example.com/x" } }).expect(402)).body.error.details.reason, "lapsed");
    await owner.patch(`/orgs/${orgId}/qr/${codes[1].id}`).send({ status: "inactive" }).expect(200); // pausing is always allowed
    await owner.patch(`/orgs/${orgId}/qr/${codes[1].id}`).send({ status: "active" }).expect(402);
    await scan(newest.code).expect(302); // printed codes never break under this policy
  });

  test("lapsed plan with the pause policy: newer codes pause, the oldest keep working", async () => {
    await admin.put("/admin/settings").send({ lapsePolicy: "pause_extra_codes" }).expect(200);
    const list = (await owner.get(`/orgs/${orgId}/qr`).expect(200)).body.qrCodes;
    const newest = list[0];
    const oldest = list[list.length - 1];
    await scan(oldest.code).expect(302);
    const paused = await scan(newest.code).expect(402);
    assert.match(paused.text, /renew their plan/);
    await wait();
    assert.equal(await prisma.scanEvent.count({ where: { qrId: newest.id, outcome: "blocked_plan" } }), 1);
  });

  test("the monthly scan limit pauses codes under the pause policy", async () => {
    const free = await prisma.plan.findUniqueOrThrow({ where: { code: "free" } });
    await prisma.plan.update({ where: { code: "free" }, data: { limits: { ...(free.limits as object), scansPerMonth: 1 } } });
    const list = (await owner.get(`/orgs/${orgId}/qr`).expect(200)).body.qrCodes;
    const res = await scan(list[list.length - 1].code).expect(402);
    assert.match(res.text, /more scans this month/);
    await prisma.plan.update({ where: { code: "free" }, data: { limits: free.limits as object } });
    await admin.put("/admin/settings").send({ lapsePolicy: "lock_editing", trialDays: 14 }).expect(200);
  });

  test("admins can edit plans and grant a plan without payment", async () => {
    const plans = (await admin.get("/admin/plans").expect(200)).body.plans;
    const basic = plans.find((p: any) => p.code === "basic");
    const saved = await admin
      .put("/admin/plans/basic")
      .send({ ...basic, priceMonthly: 59, priceYearly: 590, isActive: true })
      .expect(200);
    assert.equal(saved.body.plan.priceMonthlyMinor, 5900);
    await owner.get("/admin/plans").expect(403);

    const granted = (await admin.post(`/admin/organizations/${orgId}/subscription`).send({ planCode: "pro", days: 30 }).expect(200)).body;
    assert.equal(granted.entitlements.state, "active");
    assert.equal(granted.entitlements.planCode, "pro");
    const pays = (await admin.get("/admin/payments?status=success").expect(200)).body.payments;
    assert.ok(pays.length >= 3);
  });
});
