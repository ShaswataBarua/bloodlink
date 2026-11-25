"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-700";
const GROUPS = ["A_POS", "A_NEG", "B_POS", "B_NEG", "AB_POS", "AB_NEG", "O_POS", "O_NEG"];

export function NewRequestForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Generated once per form; a double submit reuses the same key so the server deduplicates it.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});
    const form = new FormData(event.currentTarget);
    const body = {
      patientRef: String(form.get("patientRef") ?? "").trim(),
      bloodGroup: String(form.get("bloodGroup") ?? ""),
      unitsRequested: Number(form.get("unitsRequested") ?? 0),
      urgency: String(form.get("urgency") ?? ""),
    };

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as {
        id?: string; error?: string; fields?: Array<{ path: string; message: string }>;
      };
      if (!response.ok) {
        setError(data.error ?? "Could not create the request.");
        if (data.fields) {
          setFieldErrors(Object.fromEntries(data.fields.map((f) => [f.path, f.message])));
        }
        setPending(false);
        return;
      }
      router.push(`/requests/${data.id}`);
      router.refresh();
    } catch {
      setError("Network error. The request was not created.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2" noValidate>
      <div className="sm:col-span-2">
        <label htmlFor="patientRef" className="block text-sm font-medium text-slate-700">Patient reference</label>
        <input id="patientRef" name="patientRef" required minLength={3} maxLength={40} className={inputClass}
          placeholder="DMCH-PT-1050" aria-describedby="patientRef-error" />
        {fieldErrors.patientRef && <p id="patientRef-error" className="mt-1 text-xs text-rose-700">{fieldErrors.patientRef}</p>}
      </div>

      <div>
        <label htmlFor="bloodGroup" className="block text-sm font-medium text-slate-700">Blood group</label>
        <select id="bloodGroup" name="bloodGroup" required defaultValue="" className={inputClass}>
          <option value="" disabled>Select group</option>
          {GROUPS.map((group) => (
            <option key={group} value={group}>{group.replace("_POS", "+").replace("_NEG", "\u2212")}</option>
          ))}
        </select>
        {fieldErrors.bloodGroup && <p className="mt-1 text-xs text-rose-700">{fieldErrors.bloodGroup}</p>}
      </div>

      <div>
        <label htmlFor="unitsRequested" className="block text-sm font-medium text-slate-700">Units (1-10)</label>
        <input id="unitsRequested" name="unitsRequested" type="number" min={1} max={10} defaultValue={1} required className={inputClass} />
        {fieldErrors.unitsRequested && <p className="mt-1 text-xs text-rose-700">{fieldErrors.unitsRequested}</p>}
      </div>

      <div>
        <label htmlFor="urgency" className="block text-sm font-medium text-slate-700">Urgency</label>
        <select id="urgency" name="urgency" required defaultValue="URGENT" className={inputClass}>
          <option value="CRITICAL">Critical</option>
          <option value="URGENT">Urgent</option>
          <option value="ROUTINE">Routine</option>
        </select>
        {fieldErrors.urgency && <p className="mt-1 text-xs text-rose-700">{fieldErrors.urgency}</p>}
      </div>

      <div className="sm:col-span-2" aria-live="polite" role="alert">
        {error && <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      </div>

      <div className="sm:col-span-2">
        <button type="submit" disabled={pending}
          className="rounded bg-rose-800 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-900 disabled:opacity-60">
          {pending ? "Submitting…" : "Submit request"}
        </button>
        <p className="mt-1 text-xs text-slate-500">
          Duplicate-safe: this form carries an Idempotency-Key, so a retry cannot create a second request.
        </p>
      </div>
    </form>
  );
}
