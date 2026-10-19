"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { AuthShell } from "@/components/auth-shell";
import { Button, Field, FormError, Input } from "@/components/ui";
import { api, ApiError, fetcher } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const { data: platform } = useSWR("/public/settings", fetcher);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    setLoading(true);
    try {
      await api("/auth/register", { method: "POST", json: { ...form, phone: form.phone || undefined } });
      router.push(`/verify?email=${encodeURIComponent(form.email.trim().toLowerCase())}`);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setFields(err.fields);
      else setError(err instanceof Error ? err.message : "Couldn't create your account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Takes a minute. We'll email you a code to confirm it's you."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {platform && !platform.signupsOpen ? (
        <p className="rounded-md border border-warn/30 bg-warn-soft px-3 py-3 text-sm text-warn">
          New sign-ups are paused right now. Please check back soon{platform.supportEmail ? `, or contact ${platform.supportEmail}` : ""}.
        </p>
      ) : (
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <FormError message={error} />
        <Field label="Full name" htmlFor="fullName" error={fields.fullName?.[0]}>
          <Input id="fullName" autoComplete="name" value={form.fullName} onChange={set("fullName")} />
        </Field>
        <Field label="Email" htmlFor="email" error={fields.email?.[0]}>
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Phone (optional)" htmlFor="phone" hint="We'll also text your code to this number if SMS is set up, e.g. 024 000 0000." error={fields.phone?.[0]}>
          <Input id="phone" type="tel" autoComplete="tel" placeholder="+233 24 000 0000" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters, with a letter and a number." error={fields.password?.[0]}>
          <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
        </Field>
        <Button type="submit" loading={loading} className="w-full">
          Create account
        </Button>
      </form>
      )}
    </AuthShell>
  );
}
