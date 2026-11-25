"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-700";
const GROUPS = ["A_POS", "A_NEG", "B_POS", "B_NEG", "AB_POS", "AB_NEG", "O_POS", "O_NEG"];

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const body = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      phone: String(form.get("phone") ?? ""),
      bloodGroup: String(form.get("bloodGroup") ?? ""),
      dob: String(form.get("dob") ?? ""),
      weightKg: Number(form.get("weightKg") ?? 0),
    };
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Registration failed.");
        setPending(false);
        return;
      }
      router.push("/me");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="name" className="block text-sm font-medium text-slate-700">Full name</label>
          <input id="name" name="name" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email</label>
          <input id="email" name="email" type="email" required autoComplete="username" className={inputClass} />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">Password</label>
          <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" className={inputClass} />
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-slate-700">Phone</label>
          <input id="phone" name="phone" required className={inputClass} placeholder="01712345678" />
        </div>
        <div>
          <label htmlFor="bloodGroup" className="block text-sm font-medium text-slate-700">Blood group</label>
          <select id="bloodGroup" name="bloodGroup" required className={inputClass} defaultValue="">
            <option value="" disabled>Select group</option>
            {GROUPS.map((group) => (
              <option key={group} value={group}>{group.replace("_POS", "+").replace("_NEG", "\u2212")}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dob" className="block text-sm font-medium text-slate-700">Date of birth</label>
          <input id="dob" name="dob" type="date" required className={inputClass} />
        </div>
        <div>
          <label htmlFor="weightKg" className="block text-sm font-medium text-slate-700">Weight (kg)</label>
          <input id="weightKg" name="weightKg" type="number" min={30} max={300} step="0.1" required className={inputClass} />
        </div>
      </div>

      <div aria-live="polite" role="alert" className="min-h-5 text-sm text-rose-700">{error}</div>

      <button type="submit" disabled={pending}
        className="w-full rounded bg-rose-800 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-900 disabled:opacity-60">
        {pending ? "Creating account…" : "Create donor account"}
      </button>
    </form>
  );
}
