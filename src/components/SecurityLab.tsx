"use client";

import { useState } from "react";

type Scenario = "idor" | "privilege-escalation" | "admin-endpoint" | "tampered-session" | "replay-idempotency" | "audit-tamper";

type Result = {
  scenario: Scenario; title: string; attack: string; expected: string;
  status: number; blocked: boolean; detail: string;
  audit: { seq: number; action: string; outcome: string } | null;
};

const SCENARIOS: Array<{ id: Scenario; label: string; description: string }> = [
  { id: "idor", label: "Cross-tenant IDOR", description: "Hospital B reads hospital A's request." },
  { id: "privilege-escalation", label: "Role in profile update", description: "Mass-assignment attempt: {\"role\":\"ADMIN\"}." },
  { id: "admin-endpoint", label: "Donor calls admin API", description: "Donor requests GET /api/audit." },
  { id: "tampered-session", label: "Forged session cookie", description: "Random token presented as bl_session." },
  { id: "replay-idempotency", label: "Idempotency replay", description: "Same key, different payload." },
  { id: "audit-tamper", label: "Rewrite audit row", description: "Direct UPDATE against audit_logs." },
];

export function SecurityLab() {
  const [pending, setPending] = useState<Scenario | null>(null);
  const [results, setResults] = useState<Partial<Record<Scenario, Result>>>({});
  const [error, setError] = useState<string | null>(null);

  async function run(scenario: Scenario) {
    setPending(scenario);
    setError(null);
    try {
      const response = await fetch("/api/security/attack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      const data = (await response.json()) as Result & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Scenario failed to run.");
        return;
      }
      setResults((current) => ({ ...current, [scenario]: data }));
    } catch {
      setError("Network error while running the scenario.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <div aria-live="polite" role="status">
        {error && <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {SCENARIOS.map((scenario) => {
          const result = results[scenario.id];
          return (
            <div key={scenario.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{scenario.label}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">{scenario.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => run(scenario.id)}
                  disabled={pending !== null}
                  className="shrink-0 rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {pending === scenario.id ? "Running…" : "Run"}
                </button>
              </div>

              {result && (
                <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs">
                  <p>
                    <span className="font-medium">HTTP {result.status}</span>{" "}
                    <span className={result.blocked ? "text-emerald-800" : "text-rose-800"}>
                      {result.blocked ? "blocked as expected" : "not blocked"}
                    </span>
                  </p>
                  <p className="text-slate-700">{result.detail}</p>
                  <p className="text-slate-500">Expected: {result.expected}</p>
                  {result.audit && (
                    <p className="font-mono text-[11px] text-slate-500">
                      audit seq {result.audit.seq} · {result.audit.action} · {result.audit.outcome}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
