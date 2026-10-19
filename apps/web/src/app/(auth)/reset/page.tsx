"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Button, Field, FormError, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    setLoading(true);
    try {
      await api("/auth/reset", { method: "POST", json: { email, code, password } });
      router.replace(`/login?email=${encodeURIComponent(email)}`);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      else setError(err instanceof Error ? err.message : "Couldn't reset your password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <FormError message={error} />
      {!params.get("email") && (
        <Field label="Email" htmlFor="email" error={fields.email?.[0]}>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      )}
      <Field label="6-digit code" htmlFor="code" error={fields.code?.[0]}>
        <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="font-mono tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      </Field>
      <Field label="New password" htmlFor="password" hint="At least 8 characters, with a letter and a number." error={fields.password?.[0]}>
        <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" loading={loading} className="w-full">
        Set new password
      </Button>
    </form>
  );
}

export default function ResetPage() {
  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Enter the code from your email and your new password."
      footer={
        <Link href="/forgot" className="text-accent hover:underline">
          Didn&apos;t get a code? Send another
        </Link>
      }
    >
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
