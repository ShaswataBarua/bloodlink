"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProfileForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Update failed.");
        return;
      }
      setMessage("Name updated.");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
      <div>
        <label htmlFor="profile-name" className="block text-xs font-medium text-slate-600">Display name</label>
        <input
          id="profile-name" value={name} onChange={(event) => setName(event.target.value)}
          required minLength={2} maxLength={80}
          className="mt-1 rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-700"
        />
      </div>
      <button type="submit" disabled={pending}
        className="rounded bg-rose-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-900 disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
      <div aria-live="polite" role="status" className="text-sm">
        {message && <span className="text-emerald-800">{message}</span>}
        {error && <span className="text-rose-700">{error}</span>}
      </div>
    </form>
  );
}
