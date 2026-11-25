"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AllowedAction = "approve" | "reject" | "reserve" | "fulfil" | "cancel";

const LABEL: Record<AllowedAction, string> = {
  approve: "Approve",
  reject: "Reject",
  reserve: "Reserve units",
  fulfil: "Mark fulfilled",
  cancel: "Cancel request",
};

const STYLE: Record<AllowedAction, string> = {
  approve: "border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
  reject: "border-rose-300 bg-white text-rose-800 hover:bg-rose-50",
  reserve: "border-transparent bg-rose-800 text-white hover:bg-rose-900",
  fulfil: "border-transparent bg-emerald-700 text-white hover:bg-emerald-800",
  cancel: "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
};

export function TransitionButtons({ requestId, actions }: { requestId: string; actions: AllowedAction[] }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<AllowedAction | null>(null);

  if (actions.length === 0) return <p className="text-sm text-slate-500">No actions available in this state.</p>;

  async function run(action: AllowedAction) {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/requests/${requestId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() || undefined }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Action failed.");
        setPending(null);
        return;
      }
      setReason("");
      setPending(null);
      router.refresh();
    } catch {
      setError("Network error. Nothing was changed.");
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            disabled={pending !== null}
            onClick={() => run(action)}
            className={`rounded border px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${STYLE[action]}`}
          >
            {pending === action ? "Working…" : LABEL[action]}
          </button>
        ))}
      </div>

      {(actions.includes("reject") || actions.includes("cancel")) && (
        <div>
          <label htmlFor="transition-reason" className="block text-xs font-medium text-slate-600">
            Reason (required for reject)
          </label>
          <input
            id="transition-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-700"
            placeholder="Clinical or stock reason"
          />
        </div>
      )}

      <div aria-live="polite" role="alert">
        {error && <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      </div>
    </div>
  );
}
