/**
 * Payment provider adapters. Each one starts a hosted checkout and verifies a payment by our
 * reference. We never trust a callback on its own: every success is re-checked with verify().
 */
export interface CheckoutInput {
  reference: string;
  amountMinor: number;
  currency: string;
  email: string;
  description: string;
  returnUrl: string; // where the customer lands after paying
  cancelUrl: string;
  callbackUrl: string; // server-to-server notification
  metadata: Record<string, string>;
}

export interface CheckoutResult {
  checkoutUrl: string;
  providerRef?: string;
}

export interface VerifyResult {
  status: "success" | "failed" | "pending" | "abandoned";
  amountMinor?: number;
  currency?: string;
  channel?: string;
  providerRef?: string;
  raw?: unknown;
}

export interface Gateway {
  name: "paystack" | "hubtel" | "test";
  label: string;
  configured(): boolean;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  verify(reference: string): Promise<VerifyResult>;
}

export class GatewayError extends Error {
  constructor(message: string, public status?: number, public body?: unknown) {
    super(message);
  }
}

export async function fetchJson(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 15_000) });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  return { ok: res.ok, status: res.status, body };
}
