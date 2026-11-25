"use client";

import { useState } from "react";

type RaceRow = {
  index: number; requestId: string; outcome: "WINNER" | "WAITLISTED" | "ERROR";
  status: string; reserved: number; message: string;
};
type RaceResult = {
  n: number; winners: number; waitlisted: number; errors: number; doubleAllocations: number;
  elapsedMs: number; before: { availableAbNeg: number };
  after: { availableAbNeg: number; reservedAbNeg: number };
  rows: RaceRow[];
};

export function RaceLab() {
  const [n, setN] = useState(10);
  const [result, setResult] = useState<RaceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/race", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n }),
      });
      const data = (await response.json()) as RaceResult & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Race failed.");
        return;
      }
      setResult(data);
    } catch {
      setError("Network error while running the race.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="n" className="block text-xs font-medium text-slate-600">Concurrent requests</label>
          <input
            id="n" type="number" min={2} max={50} value={n}
            onChange={(event) => setN(Number(event.target.value))}
            className="mt-1 w-28 rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-700"
          />
        </div>
        <button
          type="button" onClick={run} disabled={pending}
          className="rounded bg-rose-800 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-900 disabled:opacity-60"
        >
          {pending ? "Firing concurrent reservations…" : "Run race"}
        </button>
        <p className="text-xs text-slate-500">
          Resets the AB− fixture to exactly 1 available unit, then fires N real reservations in parallel.
        </p>
      </div>

      <div aria-live="polite" role="status">
        {error && <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Summary label="Winners" value={result.winners} tone="text-emerald-800" />
            <Summary label="Clean waitlists" value={result.waitlisted} tone="text-slate-800" />
            <Summary label="Errors" value={result.errors} tone={result.errors ? "text-rose-800" : "text-slate-800"} />
            <Summary label="Double allocations" value={result.doubleAllocations} tone={result.doubleAllocations ? "text-rose-800" : "text-emerald-800"} />
            <Summary label="Elapsed" value={`${result.elapsedMs} ms`} tone="text-slate-800" />
          </div>

          <p className="text-sm text-slate-700">
            AB− available before: <strong>{result.before.availableAbNeg}</strong> · after:{" "}
            <strong>{result.after.availableAbNeg}</strong> available, <strong>{result.after.reservedAbNeg}</strong> reserved.
          </p>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead>
                <tr>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">#</th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Request</th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Outcome</th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.rows.map((row) => (
                  <tr key={row.requestId}>
                    <td className="px-3 py-1.5 tabular-nums text-slate-500">{row.index}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{row.requestId.slice(0, 8)}</td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        row.outcome === "WINNER"
                          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                          : row.outcome === "ERROR"
                            ? "bg-rose-50 text-rose-800 ring-rose-200"
                            : "bg-slate-100 text-slate-700 ring-slate-200"
                      }`}>
                        {row.outcome}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-xs">{row.status}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-600">{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Summary({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
