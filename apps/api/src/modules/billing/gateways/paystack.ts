import crypto from "crypto";
import { config } from "../../../config";
import { fetchJson, Gateway, GatewayError } from "./index";

/**
 * Paystack (Ghana): mobile money (MTN, Telecel, AirtelTigo) and cards in GHS.
 *   POST https://api.paystack.co/transaction/initialize  → data.authorization_url
 *   GET  https://api.paystack.co/transaction/verify/:reference
 *   Webhook: header x-paystack-signature = HMAC-SHA512(secret key, raw body)
 * Amounts are in the currency's subunit (pesewas), which is what we store.
 */
const BASE = "https://api.paystack.co";
const auth = () => ({ Authorization: `Bearer ${config.payments.paystack.secretKey}`, "Content-Type": "application/json" });

export const paystack: Gateway = {
  name: "paystack",
  label: "Paystack (mobile money or card)",
  configured: () => !!config.payments.paystack.secretKey,

  async createCheckout(i) {
    const { ok, status, body } = await fetchJson(`${BASE}/transaction/initialize`, {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({
        email: i.email,
        amount: i.amountMinor,
        currency: i.currency,
        reference: i.reference,
        callback_url: i.returnUrl,
        channels: ["mobile_money", "card"],
        metadata: { ...i.metadata, cancel_action: i.cancelUrl },
      }),
    });
    if (!ok || !body?.status) throw new GatewayError(body?.message ?? `Paystack responded ${status}`, status, body);
    return { checkoutUrl: body.data.authorization_url, providerRef: body.data.access_code };
  },

  async verify(reference) {
    const { ok, status, body } = await fetchJson(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, { headers: auth() });
    if (status === 404 || (body && body.status === false && /not found/i.test(body.message ?? ""))) return { status: "pending" };
    if (!ok || !body?.data) throw new GatewayError(body?.message ?? `Paystack responded ${status}`, status, body);
    const d = body.data;
    const map: Record<string, "success" | "failed" | "pending" | "abandoned"> = {
      success: "success", failed: "failed", reversed: "failed", abandoned: "abandoned", ongoing: "pending", pending: "pending", processing: "pending", queued: "pending",
    };
    return { status: map[d.status] ?? "pending", amountMinor: Number(d.amount), currency: d.currency, channel: d.channel, providerRef: String(d.id), raw: d };
  },
};

/** True when the webhook body really came from Paystack. */
export function verifyPaystackSignature(rawBody: Buffer, signature: string | undefined) {
  if (!signature || !config.payments.paystack.secretKey) return false;
  const expected = crypto.createHmac("sha512", config.payments.paystack.secretKey).update(rawBody).digest("hex");
  return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
