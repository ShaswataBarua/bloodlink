"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UnitStatusButton({ unitId, status }: { unitId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "AVAILABLE" && status !== "DISCARDED") {
    return <span className="text-xs text-slate-400">—</span>;
  }

  const next = status === "AVAILABLE" ? "DISCARDED" : "AVAILABLE";

  async function run() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/inventory/${unitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, reason: next === "DISCARDED" ? "Manual discard" : "Returned to stock" }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Update failed.");
        setPending(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={`rounded border px-2 py-1 text-xs font-medium disabled:opacity-60 ${
          next === "DISCARDED"
            ? "border-rose-300 text-rose-800 hover:bg-rose-50"
            : "border-emerald-300 text-emerald-800 hover:bg-emerald-50"
        }`}
      >
        {pending ? "Saving…" : next === "DISCARDED" ? "Discard" : "Restore"}
      </button>
      {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
