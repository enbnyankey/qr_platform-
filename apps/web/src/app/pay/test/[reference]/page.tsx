"use client";

import { use, useEffect, useState } from "react";
import { CreditCard, FlaskConical, Smartphone } from "lucide-react";
import { Button, cx, FormError, LoadingBlock } from "@/components/ui";
import { api, formatMoney } from "@/lib/api";

/**
 * Practice checkout used while the platform is in test mode. It stands in for the Paystack or
 * Hubtel payment page so the whole upgrade flow can be tried without real money.
 */
export default function TestCheckoutPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = use(params);
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<"mobile_money" | "card">("mobile_money");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api(`/public/test-payments/${encodeURIComponent(reference)}`)
      .then(setInfo)
      .catch((e) => setError(e instanceof Error ? e.message : "Payment not found."));
  }, [reference]);

  async function finish(outcome: "success" | "fail" | "cancel") {
    setBusy(outcome);
    try {
      const { returnUrl } = await api(`/public/test-payments/${encodeURIComponent(reference)}`, { method: "POST", json: { outcome, channel } });
      window.location.href = returnUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(null);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-[#eef1f5] px-4 py-10">
      <div className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-lg">
        <div className="flex items-center gap-2 bg-[#1f2a44] px-5 py-3 text-sm text-white">
          <FlaskConical className="size-4" /> Test checkout: no real money moves
        </div>
        {!info && !error && <LoadingBlock />}
        {error && (
          <div className="p-5">
            <FormError message={error} />
          </div>
        )}
        {info && (
          <div className="grid gap-5 p-5">
            <div>
              <p className="text-sm text-muted">{info.businessName}</p>
              <p className="tabular font-display text-3xl font-semibold">{formatMoney(info.amountMinor, info.currency)}</p>
              <p className="text-sm text-muted">
                {info.planName} plan · 1 {info.interval}
              </p>
            </div>
            {info.status !== "pending" ? (
              <p className="text-sm text-muted">This payment is already {info.status}.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment method">
                  {([
                    ["mobile_money", "Mobile money", Smartphone],
                    ["card", "Card", CreditCard],
                  ] as const).map(([v, label, Icon]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={channel === v}
                      onClick={() => setChannel(v)}
                      className={cx("flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm", channel === v ? "border-[#1f2a44] bg-[#1f2a44]/5 font-medium" : "border-line")}
                    >
                      <Icon className="size-4" /> {label}
                    </button>
                  ))}
                </div>
                <div className="grid gap-2">
                  <Button onClick={() => finish("success")} loading={busy === "success"} className="w-full border-[#1f2a44] bg-[#1f2a44] hover:bg-[#2c3a5c]">
                    Pay {formatMoney(info.amountMinor, info.currency)}
                  </Button>
                  <Button variant="secondary" onClick={() => finish("fail")} loading={busy === "fail"} className="w-full">
                    Simulate a failed payment
                  </Button>
                  <Button variant="ghost" onClick={() => finish("cancel")} loading={busy === "cancel"} className="w-full">
                    Cancel
                  </Button>
                </div>
              </>
            )}
            <p className="font-mono text-[11px] text-faint">Ref {reference}</p>
          </div>
        )}
      </div>
    </div>
  );
}
