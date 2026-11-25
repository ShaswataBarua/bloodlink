"use client";

import { useState } from "react";

type Verification = { ok: boolean; checked: number; brokenAtSeq: number | null; reason: string | null };

export function VerifyChain() {
  const [result, setResult] = useState<Verification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/audit/verify", { method: "POST" });
      const data = (await response.json()) as Verification & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Verification failed.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error while verifying the chain.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
      >
        {pending ? "Recomputing hashes…" : "Verify hash chain"}
      </button>

      <div aria-live="polite" role="status" className="text-sm">
        {error && <p className="text-rose-700">{error}</p>}
        {result && (
          <p className={result.ok ? "text-emerald-800" : "text-rose-800"}>
            {result.ok
              ? `Chain intact: ${result.checked} rows verified (prev_hash + SHA-256 recomputed).`
              : `Chain broken at seq ${result.brokenAtSeq}: ${result.reason}`}
          </p>
        )}
      </div>
    </div>
  );
}
