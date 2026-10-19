import crypto from "crypto";
import type { Request } from "express";
import { billing, prisma } from "@qr/db";
import type { Payment, Plan } from "@qr/db";
import { config } from "../../config";
import { badRequest, HttpError } from "../../lib/errors";
import { logger } from "../../lib/logger";
import { audit } from "../../lib/util";
import { Gateway, GatewayError } from "./gateways";
import { hubtel } from "./gateways/hubtel";
import { paystack } from "./gateways/paystack";
import { testGateway } from "./gateways/test";

const GATEWAYS: Record<string, Gateway> = { paystack, hubtel, test: testGateway };

export function gatewayFor(name: string): Gateway {
  const g = GATEWAYS[name];
  if (!g) throw badRequest(`Unknown payment provider "${name}".`);
  return g;
}

/** The provider chosen in Platform settings, if it's set up; otherwise a clear error. */
export async function activeGateway(): Promise<Gateway> {
  const { provider } = await billing.billingSettings(prisma);
  const g = gatewayFor(provider);
  if (!g.configured()) {
    throw new HttpError(503, "payments_unavailable", `${g.label} isn't set up yet. An administrator needs to add its keys or choose another provider.`);
  }
  return g;
}

export function serializePlan(p: Plan) {
  return {
    code: p.code, name: p.name, description: p.description, currency: p.currency,
    priceMonthlyMinor: Number(p.priceMonthlyMinor), priceYearlyMinor: Number(p.priceYearlyMinor),
    limits: p.limits, features: p.features, isActive: p.isActive, sortOrder: p.sortOrder,
  };
}

export function serializePayment(p: Payment & { plan?: Plan }) {
  return {
    id: p.id, reference: p.reference, planCode: p.planCode, planName: p.plan?.name, interval: p.interval,
    amountMinor: Number(p.amountMinor), currency: p.currency, provider: p.provider, status: p.status, channel: p.channel,
    periodStart: p.periodStart, periodEnd: p.periodEnd, paidAt: p.paidAt, createdAt: p.createdAt, failureNote: p.failureNote,
  };
}

const newReference = () => `QRP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

function addInterval(from: Date, interval: "month" | "year") {
  const d = new Date(from);
  if (interval === "month") d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

/** Starts a checkout for a plan. Returns the provider's hosted payment page. */
export async function createCheckout(req: Request, orgId: string, planCode: string, interval: "month" | "year") {
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan || !plan.isActive || plan.code === "free") throw badRequest("Choose a paid plan.");
  const amount = Number(interval === "month" ? plan.priceMonthlyMinor : plan.priceYearlyMinor);
  if (amount <= 0) throw badRequest("This plan doesn't have a price for that billing period yet.");

  const gateway = await activeGateway();
  const reference = newReference();
  const payment = await prisma.payment.create({
    data: { orgId, planCode, interval, amountMinor: BigInt(amount), currency: plan.currency, provider: gateway.name, reference, createdById: req.user!.id },
  });
  const returnUrl = `${config.webBaseUrl}/app/billing/return?reference=${encodeURIComponent(reference)}`;
  try {
    const { checkoutUrl, providerRef } = await gateway.createCheckout({
      reference,
      amountMinor: amount,
      currency: plan.currency,
      email: req.user!.email,
      description: `${plan.name} plan · 1 ${interval}`,
      returnUrl,
      cancelUrl: `${returnUrl}&cancelled=1`,
      callbackUrl: `${config.apiPublicUrl}/webhooks/${gateway.name}`,
      metadata: { orgId, planCode, interval, paymentId: payment.id },
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { checkoutUrl, providerRef } });
    await audit(req, { orgId, action: "billing.checkout", entity: "payment", entityId: payment.id, after: { reference, planCode, interval, amount, provider: gateway.name } });
    return { reference, checkoutUrl };
  } catch (err) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed", failureNote: (err as Error).message.slice(0, 300) } });
    if (err instanceof GatewayError) {
      logger.error({ err: err.message, status: err.status, body: err.body }, "checkout failed");
      throw new HttpError(502, "payment_provider_error", "The payment provider couldn't start the checkout. Please try again in a moment.");
    }
    throw err;
  }
}

/**
 * Checks a payment with the provider and, on success, extends the subscription exactly once.
 * Safe to call any number of times, from the return page, a webhook, or both at once.
 */
export async function verifyAndApply(reference: string, source: string) {
  const payment = await prisma.payment.findUnique({ where: { reference } });
  if (!payment) return null;
  if (payment.status !== "pending") return payment;

  const result = await gatewayFor(payment.provider).verify(reference);
  if (result.status === "pending") return payment;

  if (result.status !== "success") {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: "pending" },
      data: { status: result.status === "abandoned" ? "abandoned" : "failed", providerData: (result.raw ?? undefined) as any },
    });
    return prisma.payment.findUnique({ where: { id: payment.id } });
  }

  // Never grant a plan for the wrong amount or currency.
  if (result.amountMinor !== Number(payment.amountMinor) || (result.currency && result.currency !== payment.currency)) {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: "pending" },
      data: { status: "failed", failureNote: `Amount mismatch: expected ${payment.amountMinor} ${payment.currency}, provider reported ${result.amountMinor} ${result.currency}` },
    });
    logger.error({ reference, expected: payment.amountMinor.toString(), got: result.amountMinor }, "payment amount mismatch");
    return prisma.payment.findUnique({ where: { id: payment.id } });
  }

  return prisma.$transaction(async (tx) => {
    // Lock the payment row: only one caller gets to apply it.
    const locked = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM payments WHERE id = ${payment.id}::uuid FOR UPDATE`;
    if (locked[0]?.status !== "pending") return tx.payment.findUniqueOrThrow({ where: { id: payment.id } });

    const now = new Date();
    const sub = await tx.subscription.findUnique({ where: { orgId: payment.orgId } });
    // Renewing the same plan early stacks onto the remaining time; switching plans starts today.
    const stillActive = sub && sub.status === "active" && sub.planCode === payment.planCode && sub.currentPeriodEnd && sub.currentPeriodEnd > now;
    const periodStart = stillActive ? sub!.currentPeriodEnd! : now;
    const periodEnd = addInterval(periodStart, payment.interval);

    await tx.subscription.upsert({
      where: { orgId: payment.orgId },
      create: { orgId: payment.orgId, planCode: payment.planCode, status: "active", interval: payment.interval, currentPeriodEnd: periodEnd },
      update: { planCode: payment.planCode, status: "active", interval: payment.interval, currentPeriodEnd: periodEnd, trialEndsAt: null, grantedById: null },
    });
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: { status: "success", paidAt: now, periodStart, periodEnd, channel: result.channel ?? null, providerRef: result.providerRef ?? payment.providerRef, providerData: (result.raw ?? undefined) as any },
    });
    await tx.auditLog.create({
      data: { orgId: payment.orgId, action: "billing.payment_success", entity: "payment", entityId: payment.id, after: { reference, source, planCode: payment.planCode, periodEnd } as any },
    });
    logger.info({ reference, orgId: payment.orgId, planCode: payment.planCode, source }, "payment applied");
    return updated;
  });
}
