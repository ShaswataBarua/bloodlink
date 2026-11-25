import Link from "next/link";
import { notFound } from "next/navigation";
import { TransitionButtons, type AllowedAction } from "@/components/TransitionButtons";
import { Card, StatusBadge, TableWrap, Td, Th } from "@/components/ui";
import { daysUntil, fmtDate, fmtDateTime, groupLabel } from "@/lib/format";
import { requirePageActor } from "@/server/guard";
import { HttpError } from "@/server/http";
import { getRequestDetail } from "@/services/requests";

export const metadata = { title: "Request detail — BloodLink" };

const STEPS = ["PENDING", "APPROVED", "RESERVED", "FULFILLED"] as const;

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor(["ADMIN", "BANK_STAFF", "HOSPITAL"]);
  const { id } = await params;

  let detail;
  try {
    detail = await getRequestDetail(actor, id);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }

  const request = detail.request;
  const activeAllocations = detail.allocations.filter((a) => a.releasedAt === null);
  const open = ["PENDING", "APPROVED", "WAITLISTED"].includes(request.status);

  const actions: AllowedAction[] = [];
  const isStaff = actor.role === "ADMIN" || actor.role === "BANK_STAFF";
  if (isStaff) {
    if (request.status === "PENDING") actions.push("approve");
    if (open) actions.push("reserve", "reject");
    if (request.status === "RESERVED") actions.push("fulfil");
  }
  const ownsHospital = actor.role === "HOSPITAL" && request.hospitalId === actor.hospitalId;
  if ((ownsHospital || actor.role === "ADMIN") && ["PENDING", "APPROVED", "WAITLISTED", "RESERVED"].includes(request.status)) {
    actions.push("cancel");
  }

  const currentStep = STEPS.indexOf(request.status as (typeof STEPS)[number]);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/requests" className="text-sm text-slate-600 underline">← Back to requests</Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{request.patientRef}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {request.hospitalName} · requested by {request.requestedByName} · {fmtDateTime(request.createdAt)}
          </p>
        </div>
        <StatusBadge value={request.status} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Blood group</p>
          <p className="mt-1 text-lg font-semibold">{groupLabel(request.bloodGroup)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Units requested</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{request.unitsRequested}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Urgency</p>
          <p className="mt-1"><StatusBadge value={request.urgency} /></p>
        </div>
      </div>

      <Card title="Lifecycle">
        <ol className="flex flex-wrap items-center gap-2 text-sm">
          {STEPS.map((step, index) => {
            const done = currentStep >= index;
            return (
              <li key={step} className="flex items-center gap-2">
                <span className={`rounded px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                  done ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-slate-50 text-slate-500 ring-slate-200"
                }`}>
                  {step}
                </span>
                {index < STEPS.length - 1 && <span className="text-slate-300">→</span>}
              </li>
            );
          })}
        </ol>
        {request.statusReason && (
          <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {request.statusReason}
          </p>
        )}
      </Card>

      <Card title="Actions" description="Only transitions allowed by the state machine are shown.">
        <TransitionButtons requestId={request.id} actions={actions} />
      </Card>

      <Card title="Allocated units" description="A unit can have only one active allocation, enforced by a partial unique index.">
        {detail.allocations.length === 0 ? (
          <p className="text-sm text-slate-500">No units have been allocated yet.</p>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Unit</Th>
                <Th>Group</Th>
                <Th>Expires</Th>
                <Th>Unit status</Th>
                <Th>Allocated</Th>
                <Th>Released</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detail.allocations.map((allocation) => (
                <tr key={allocation.id} className={allocation.releasedAt ? "text-slate-400" : ""}>
                  <Td className="font-mono text-xs">{allocation.unitId.slice(0, 8)}</Td>
                  <Td className="font-medium">{groupLabel(allocation.bloodGroup)}</Td>
                  <Td>
                    {fmtDate(allocation.expiresAt)}
                    {allocation.releasedAt === null && (
                      <span className="ml-2 text-xs text-slate-500">{daysUntil(allocation.expiresAt)}d left</span>
                    )}
                  </Td>
                  <Td><StatusBadge value={allocation.unitStatus} /></Td>
                  <Td className="text-slate-500">{fmtDateTime(allocation.allocatedAt)}</Td>
                  <Td className="text-slate-500">{allocation.releasedAt ? fmtDateTime(allocation.releasedAt) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Active allocations: {activeAllocations.length} of {request.unitsRequested}.
        </p>
      </Card>
    </>
  );
}
