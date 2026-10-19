import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { requireAuth, requireOrg } from "../../lib/auth";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { config } from "../../config";
import { entitlementsFor } from "./entitlements";
import { verifyPaystackSignature } from "./gateways/paystack";
import { activeGateway, createCheckout, serializePayment, serializePlan, verifyAndApply } from "./service";

// ---------- /orgs/:orgId/billing ----------
export const billingRouter = Router({ mergeParams: true });
billingRouter.use(requireAuth, requireOrg());

/** Plan, usage, available plans and payment history for the billing page. */
billingRouter.get("/", async (req, res) => {
  const orgId = req.org!.id;
  const [entitlements, plans, payments] = await Promise.all([
    entitlementsFor(orgId),
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.payment.findMany({ where: { orgId, status: { not: "pending" } }, orderBy: { createdAt: "desc" }, take: 24, include: { plan: true } }),
  ]);
  let provider: { name: string; label: string; ready: boolean } | null = null;
  try {
    const g = await activeGateway();
    provider = { name: g.name, label: g.label, ready: true };
  } catch {
    provider = null;
  }
  res.json({ entitlements, plans: plans.map(serializePlan), payments: payments.map(serializePayment), provider });
});

/** Starts paying for a plan. Only the business owner can spend money. */
billingRouter.post("/checkout", requireOrg(["business_owner"]), async (req, res) => {
  const body = z.object({ planCode: z.string().min(1), interval: z.enum(["month", "year"]) }).parse(req.body);
  res.status(201).json(await createCheckout(req, req.org!.id, body.planCode, body.interval));
});

/** Called by the return page after the provider redirects back. */
billingRouter.get("/payments/:reference", async (req, res) => {
  const reference = String(req.params.reference);
  const existing = await prisma.payment.findUnique({ where: { reference } });
  if (!existing || existing.orgId !== req.org!.id) throw notFound("Payment");
  const payment = await verifyAndApply(reference, "return");
  const full = await prisma.payment.findUniqueOrThrow({ where: { id: payment!.id }, include: { plan: true } });
  res.json({ payment: serializePayment(full), entitlements: await entitlementsFor(req.org!.id) });
});

// ---------- /webhooks/:provider (server-to-server) ----------
export const webhooksRouter = Router();

/** Paystack: signature-checked, then re-verified with the API before anything changes. */
webhooksRouter.post("/paystack", async (req, res) => {
  const raw: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
  const valid = verifyPaystackSignature(raw, req.get("x-paystack-signature"));
  const reference: string | undefined = req.body?.data?.reference;
  const log = await prisma.paymentWebhook.create({
    data: { provider: "paystack", event: req.body?.event ?? null, reference: reference ?? null, signatureValid: valid, payload: req.body ?? {} },
  });
  if (!valid) {
    await prisma.paymentWebhook.update({ where: { id: log.id }, data: { error: "invalid signature" } });
    return void res.status(401).json({ ok: false });
  }
  res.json({ ok: true }); // acknowledge fast; Paystack retries on non-2xx
  if (reference && req.body?.event === "charge.success") await processWebhook(log.id, reference);
});

/** Hubtel callbacks aren't signed, so they only prompt a status check with Hubtel's API. */
webhooksRouter.post("/hubtel", async (req, res) => {
  const reference: string | undefined = req.body?.Data?.ClientReference ?? req.body?.data?.clientReference;
  const log = await prisma.paymentWebhook.create({
    data: { provider: "hubtel", event: req.body?.Status ?? req.body?.ResponseCode ?? null, reference: reference ?? null, payload: req.body ?? {} },
  });
  res.json({ ok: true });
  if (reference) await processWebhook(log.id, reference);
});

async function processWebhook(logId: bigint, reference: string) {
  try {
    await verifyAndApply(reference, "webhook");
    await prisma.paymentWebhook.update({ where: { id: logId }, data: { processedAt: new Date() } });
  } catch (err) {
    logger.error({ err: (err as Error).message, reference }, "webhook processing failed");
    await prisma.paymentWebhook.update({ where: { id: logId }, data: { error: (err as Error).message.slice(0, 500) } });
  }
}

// ---------- /public/test-payments (test checkout page only) ----------
export const testPaymentsRouter = Router();

testPaymentsRouter.use((_req, _res, next) => (config.payments.testMode ? next() : next(forbidden("Test payments are turned off."))));

testPaymentsRouter.get("/:reference", async (req, res) => {
  const p = await prisma.payment.findUnique({ where: { reference: String(req.params.reference) }, include: { plan: true, org: true } });
  if (!p || p.provider !== "test") throw notFound("Payment");
  res.json({
    reference: p.reference, status: p.status, amountMinor: Number(p.amountMinor), currency: p.currency,
    planName: p.plan.name, interval: p.interval, businessName: p.org.name,
  });
});

testPaymentsRouter.post("/:reference", async (req, res) => {
  const { outcome, channel } = z
    .object({ outcome: z.enum(["success", "fail", "cancel"]), channel: z.enum(["mobile_money", "card"]).default("mobile_money") })
    .parse(req.body);
  const p = await prisma.payment.findUnique({ where: { reference: String(req.params.reference) } });
  if (!p || p.provider !== "test") throw notFound("Payment");
  if (p.status !== "pending") throw badRequest("This payment is already finished.");
  await prisma.payment.update({ where: { id: p.id }, data: { providerData: { testOutcome: outcome, testChannel: channel } } });
  res.json({ ok: true, returnUrl: `${config.webBaseUrl}/app/billing/return?reference=${encodeURIComponent(p.reference)}${outcome === "cancel" ? "&cancelled=1" : ""}` });
});
