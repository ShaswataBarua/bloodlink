"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DonorOption = { id: string; fullName: string; bloodGroup: string; eligible: boolean; reasons: string[] };

export function DonationForm({ donors }: { donors: DonorOption[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [donorId, setDonorId] = useState("");

  const selected = donors.find((donor) => donor.id === donorId);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          donorId: String(form.get("donorId") ?? ""),
          volumeMl: Number(form.get("volumeMl") ?? 450),
        }),
      });
      const data = (await response.json()) as { unitId?: string; waitlistReserved?: number; error?: string };
      if (!response.ok) {
        setError(data.error ?? "Donation was not recorded.");
        setPending(false);
        return;
      }
      setSuccess(
        `Recorded. New unit ${data.unitId?.slice(0, 8)} added to stock` +
          (data.waitlistReserved ? `, and ${data.waitlistReserved} waitlisted request(s) were reserved.` : "."),
      );
      setPending(false);
      router.refresh();
    } catch {
      setError("Network error. Nothing was saved.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3" noValidate>
      <div className="sm:col-span-2">
        <label htmlFor="donorId" className="block text-sm font-medium text-slate-700">Donor</label>
        <select
          id="donorId" name="donorId" required value={donorId}
          onChange={(event) => setDonorId(event.target.value)}
          className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-700"
        >
          <option value="" disabled>Select a donor</option>
          {donors.map((donor) => (
            <option key={donor.id} value={donor.id}>
              {donor.fullName} · {donor.bloodGroup.replace("_POS", "+").replace("_NEG", "\u2212")}
              {donor.eligible ? "" : " · ineligible"}
            </option>
          ))}
        </select>
        {selected && !selected.eligible && (
          <p className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
            This donor is currently ineligible: {selected.reasons.join(" ")}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="volumeMl" className="block text-sm font-medium text-slate-700">Volume (ml)</label>
        <input id="volumeMl" name="volumeMl" type="number" min={300} max={550} step={10} defaultValue={450} required
          className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-700" />
      </div>

      <div className="sm:col-span-3" aria-live="polite" role="status">
        {error && <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        {success && <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</p>}
      </div>

      <div className="sm:col-span-3">
        <button type="submit" disabled={pending || !donorId}
          className="rounded bg-rose-800 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-900 disabled:opacity-60">
          {pending ? "Recording…" : "Record donation"}
        </button>
        <p className="mt-1 text-xs text-slate-500">
          Eligibility (age, weight, 90-day interval, one donation per day) is re-checked on the server.
        </p>
      </div>
    </form>
  );
}
