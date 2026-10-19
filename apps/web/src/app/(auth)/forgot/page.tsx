"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Button, Field, FormError, Input } from "@/components/ui";
import { api } from "@/lib/api";

function ForgotForm() {
  const router = useRouter();
  const [email, setEmail] = useState(useSearchParams().get("email") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/auth/forgot", { method: "POST", json: { email } });
      router.push(`/reset?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <FormError message={error} />
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button type="submit" loading={loading} className="w-full">
        Send reset code
      </Button>
    </form>
  );
}

export default function ForgotPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your account email and we'll send you a 6-digit code."
      footer={
        <Link href="/login" className="text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      <Suspense>
        <ForgotForm />
      </Suspense>
    </AuthShell>
  );
}
