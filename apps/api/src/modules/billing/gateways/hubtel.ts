import { config } from "../../../config";
import { fetchJson, Gateway, GatewayError } from "./index";

/**
 * Hubtel Online Checkout (Ghana): mobile money, cards and bank in GHS.
 *   POST https://payproxyapi.hubtel.com/items/initiate                          → data.checkoutUrl
 *   GET  https://api-txnstatus.hubtel.com/transactions/{merchant}/status?clientReference=…
 * Auth is HTTP Basic with the API ID and key. Amounts are in cedis (2 decimals).
 * Hubtel's callback isn't signed, so callbacks only trigger a status check; they're never trusted alone.
 * Check these endpoints against the API docs Hubtel gives you with your merchant account.
 */
const auth = () => {
  const { apiId, apiKey } = config.payments.hubtel;
  return { Authorization: `Basic ${Buffer.from(`${apiId}:${apiKey}`).toString("base64")}`, "Content-Type": "application/json" };
};

export const hubtel: Gateway = {
  name: "hubtel",
  label: "Hubtel (mobile money, card or bank)",
  configured: () => {
    const { apiId, apiKey, merchantAccount } = config.payments.hubtel;
    return !!(apiId && apiKey && merchantAccount);
  },

  async createCheckout(i) {
    const { ok, status, body } = await fetchJson("https://payproxyapi.hubtel.com/items/initiate", {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        totalAmount: Number((i.amountMinor / 100).toFixed(2)),
        description: i.description,
        callbackUrl: i.callbackUrl,
        returnUrl: i.returnUrl,
        cancellationUrl: i.cancelUrl,
        merchantAccountNumber: config.payments.hubtel.merchantAccount,
        clientReference: i.reference,
      }),
    });
    if (!ok || body?.responseCode !== "0000" || !body?.data?.checkoutUrl) {
      throw new GatewayError(body?.message ?? body?.status ?? `Hubtel responded ${status}`, status, body);
    }
    return { checkoutUrl: body.data.checkoutUrl, providerRef: body.data.checkoutId };
  },

  async verify(reference) {
    const url = `https://api-txnstatus.hubtel.com/transactions/${encodeURIComponent(config.payments.hubtel.merchantAccount)}/status?clientReference=${encodeURIComponent(reference)}`;
    const { ok, status, body } = await fetchJson(url, { headers: auth() });
    if (status === 404) return { status: "pending" };
    if (!ok || !body?.data) throw new GatewayError(body?.message ?? `Hubtel responded ${status}`, status, body);
    const d = body.data;
    const s = String(d.status ?? "").toLowerCase();
    return {
      status: s === "paid" ? "success" : s === "unpaid" ? "pending" : s === "refunded" ? "failed" : "pending",
      amountMinor: d.amount !== undefined ? Math.round(Number(d.amount) * 100) : undefined,
      currency: d.currencyCode ?? "GHS",
      channel: d.paymentMethod,
      providerRef: d.transactionId ?? d.externalTransactionId,
      raw: d,
    };
  },
};
