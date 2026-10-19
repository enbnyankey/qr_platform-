import { config } from "../../../config";
import { prisma } from "../../../db";
import { Gateway } from "./index";

/**
 * Test checkout for development and demos: no real money moves. The checkout page lives in the
 * web app (/pay/test/:reference) and records the outcome you click, which verify() then reads.
 * Disabled in production unless PAYMENTS_TEST_MODE=true.
 */
export const testGateway: Gateway = {
  name: "test",
  label: "Test checkout (no real money)",
  configured: () => config.payments.testMode,

  async createCheckout(i) {
    return { checkoutUrl: `${config.webBaseUrl}/pay/test/${encodeURIComponent(i.reference)}` };
  },

  async verify(reference) {
    const p = await prisma.payment.findUnique({ where: { reference } });
    const outcome = (p?.providerData as any)?.testOutcome as string | undefined;
    if (!p || !outcome) return { status: "pending" };
    return {
      status: outcome === "success" ? "success" : outcome === "cancel" ? "abandoned" : "failed",
      amountMinor: Number(p.amountMinor),
      currency: p.currency,
      channel: (p.providerData as any)?.testChannel ?? "mobile_money",
      providerRef: `test_${reference}`,
    };
  },
};
