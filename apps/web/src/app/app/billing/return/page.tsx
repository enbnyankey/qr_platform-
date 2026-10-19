"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { mutate } from "swr";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { ButtonLink, Card, Spinner } from "@/components/ui";
import { api, formatMoney } from "@/lib/api";
import { useSession } from "@/lib/session";

/** Where the payment provider sends people back. We confirm with the provider before showing success. */
function ReturnInner() {
  const params = useSearchParams();
  const reference = params.get("reference") ?? params.get("trxref") ?? "";
  const { org } = useSession();
  const [payment, setPayment] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!reference) return;
    let stop = false;
    api(`/orgs/${org.id}/billing/payments/${encodeURIComponent(reference)}`)
      .then(async (res) => {
        if (stop) return;
        setPayment(res.payment);
        if (res.payment.status === "success") await mutate(`/orgs/${org.id}/billing`);
        // Mobile money approvals can take a moment: check again a few times.
        if (res.payment.status === "pending" && tries < 10 && !params.get("cancelled")) setTimeout(() => !stop && setTries((t) => t + 1), 3000);
      })
      .catch((err) => !stop && setError(err instanceof Error ? err.message : "Couldn't check the payment."));
    return () => {
      stop = true;
    };
  }, [reference, org.id, tries, params]);

  const status: string = error ? "error" : !payment ? "loading" : params.get("cancelled") && payment.status === "pending" ? "cancelled" : payment.status;

  return (
    <div className="mx-auto grid max-w-md gap-4 pt-6">
      <Card className="grid justify-items-center gap-3 p-8 text-center">
        {status === "loading" && (
          <>
            <Spinner className="size-8" />
            <h1 className="text-xl font-semibold">Confirming your payment…</h1>
          </>
        )}
        {status === "pending" && (
          <>
            <Clock className="size-10 text-warn" />
            <h1 className="text-xl font-semibold">Waiting for confirmation</h1>
            <p className="text-sm text-muted">If you paid with mobile money, approve the prompt on your phone. This page updates by itself.</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="size-10 text-good" />
            <h1 className="text-xl font-semibold">Payment received</h1>
            <p className="text-sm text-muted">
              {formatMoney(payment.amountMinor, payment.currency)} for {payment.planName}. Your plan is active until{" "}
              {new Date(payment.periodEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
            </p>
          </>
        )}
        {(status === "failed" || status === "abandoned" || status === "cancelled") && (
          <>
            <XCircle className="size-10 text-bad" />
            <h1 className="text-xl font-semibold">{status === "failed" ? "Payment didn't go through" : "Payment cancelled"}</h1>
            <p className="text-sm text-muted">You haven&apos;t been charged for this attempt. You can try again from the billing page.</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="size-10 text-bad" />
            <h1 className="text-xl font-semibold">We couldn&apos;t check this payment</h1>
            <p className="text-sm text-muted">{error}</p>
          </>
        )}
        <p className="font-mono text-xs text-faint">Ref {reference}</p>
        <ButtonLink href="/app/billing" variant={status === "success" ? "primary" : "secondary"}>
          Back to billing
        </ButtonLink>
      </Card>
    </div>
  );
}

export default function BillingReturnPage() {
  return (
    <Suspense>
      <ReturnInner />
    </Suspense>
  );
}
