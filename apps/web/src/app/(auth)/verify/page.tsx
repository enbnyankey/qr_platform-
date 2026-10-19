"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { mutate } from "swr";
import { AuthShell } from "@/components/auth-shell";
import { Button, Field, FormError, Input } from "@/components/ui";
import { api } from "@/lib/api";

function VerifyForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/auth/verify", { method: "POST", json: { email, code } });
      await mutate("/auth/me", undefined, { revalidate: false });
      router.replace("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't verify.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setResending(true);
    setError(null);
    try {
      await api("/auth/resend", { method: "POST", json: { email } });
      setInfo("We've sent a new code. Check your inbox and spam folder.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resend.");
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <FormError message={error} />
      {info && <p className="rounded-md bg-accent-soft px-3 py-2 text-sm text-accent">{info}</p>}
      {!params.get("email") && (
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      )}
      <Field label="6-digit code" htmlFor="code">
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          className="h-12 text-center font-mono text-xl tracking-[0.4em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          autoFocus
        />
      </Field>
      <Button type="submit" loading={loading} disabled={code.length !== 6} className="w-full">
        Verify and continue
      </Button>
      <Button type="button" variant="ghost" onClick={resend} loading={resending} disabled={!email}>
        Send a new code
      </Button>
    </form>
  );
}

function Subtitle() {
  const email = useSearchParams().get("email");
  return <>We sent a code to {email ? <strong className="text-ink">{email}</strong> : "your email"}. It expires in 10 minutes.</>;
}

export default function VerifyPage() {
  return (
    <AuthShell
      title="Check your email"
      subtitle={
        <Suspense>
          <Subtitle />
        </Suspense>
      }
    >
      <Suspense>
        <VerifyForm />
      </Suspense>
    </AuthShell>
  );
}
