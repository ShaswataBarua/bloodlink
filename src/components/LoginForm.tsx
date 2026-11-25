"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const DEMO_ACCOUNTS = [
  { label: "Admin", email: "admin@bloodlink.test" },
  { label: "Bank staff", email: "staff.dhaka@bloodlink.test" },
  { label: "Hospital", email: "dmch@bloodlink.test" },
  { label: "Donor", email: "donor1@bloodlink.test" },
];

const inputClass =
  "mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-700";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json()) as { error?: string; redirectTo?: string };
      if (!response.ok) {
        setError(data.error ?? "Sign in failed.");
        setPending(false);
        return;
      }
      router.push(data.redirectTo ?? "/");
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email</label>
        <input
          id="email" name="email" type="email" autoComplete="username" required
          value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass}
          placeholder="name@hospital.org"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">Password</label>
        <input
          id="password" name="password" type="password" autoComplete="current-password" required minLength={8}
          value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass}
          placeholder="At least 8 characters"
        />
      </div>

      <div aria-live="polite" role="alert" className="min-h-5 text-sm text-rose-700">
        {error}
      </div>

      <button
        type="submit" disabled={pending}
        className="w-full rounded bg-rose-800 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-900 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <div className="border-t border-slate-200 pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Demo accounts (password Passw0rd!demo)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email} type="button"
              onClick={() => { setEmail(account.email); setPassword("Passw0rd!demo"); }}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {account.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-center text-sm text-slate-600">
        New donor? <Link href="/register" className="font-medium text-rose-800 underline">Register as a donor</Link>
      </p>
    </form>
  );
}
