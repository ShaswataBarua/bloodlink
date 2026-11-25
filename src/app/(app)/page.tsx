import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, EmptyState, PageHeader, Stat, StatusBadge, Td, Th, TableWrap } from "@/components/ui";
import { daysUntil, fmtDate, fmtDateTime, groupLabel } from "@/lib/format";
import { requirePageActor } from "@/server/guard";
import { getDashboard } from "@/services/dashboard";
import { expireUnitsSafe } from "@/services/inventory";

export const metadata = { title: "Dashboard — BloodLink" };

export default async function DashboardPage() {
  const actor = await requirePageActor();
  if (actor.role === "DONOR") redirect("/me");

  await expireUnitsSafe();
  const data = await getDashboard(actor);

  return (
    <>
      <PageHeader
        title="Operations dashboard"
        description={
          actor.role === "HOSPITAL"
            ? "Your hospital's request activity and current blood bank stock."
            : "Live stock, request pipeline and allocation health."
        }
        actions={
          actor.role === "HOSPITAL" ? (
            <Link href="/requests" className="rounded bg-rose-800 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-900">
              New blood request
            </Link>
          ) : (
            <Link href="/race-lab" className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Open Race Lab
            </Link>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Available units" value={data.totals.available} hint={`${data.totals.reserved} reserved`} />
        <Stat label="Expiring in 7 days" value={data.totals.expiring7d} hint="First-expiry-first-out priority" />
        <Stat label="Open requests" value={data.requests.open} hint={`${data.requests.waitlisted} waitlisted`} />
        <Stat
          label="Fulfilment rate"
          value={`${data.requests.fulfilmentRate}%`}
          hint={data.requests.avgFulfilmentMinutes === null ? "No completed requests yet" : `Avg ${data.requests.avgFulfilmentMinutes} min to fulfil`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title="Stock by blood group" description="Available units and those expiring within 7 days.">
            {data.stock.length === 0 ? (
              <EmptyState>No units in stock. Record a donation to add stock.</EmptyState>
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Group</Th>
                    <Th className="text-right">Available</Th>
                    <Th className="text-right">Reserved</Th>
                    <Th className="text-right">Expiring &le; 7d</Th>
                    <Th>Level</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.stock.map((row) => (
                    <tr key={row.bloodGroup}>
                      <Td><span className="font-semibold">{groupLabel(row.bloodGroup)}</span></Td>
                      <Td className="text-right tabular-nums">{row.available}</Td>
                      <Td className="text-right tabular-nums">{row.reserved}</Td>
                      <Td className="text-right tabular-nums">{row.expiringSoon}</Td>
                      <Td>
                        {row.available === 0 ? <Badge tone="danger">Out of stock</Badge>
                          : row.available < 5 ? <Badge tone="warning">Low</Badge>
                          : <Badge tone="success">Healthy</Badge>}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </div>

        <Card title="Expiring soon" description="Units that must be used first (FEFO).">
          {data.expiringUnits.length === 0 ? (
            <EmptyState>Nothing expires in the next 7 days.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.expiringUnits.map((unit) => {
                const days = daysUntil(unit.expiresAt);
                return (
                  <li key={unit.id} className="flex items-center justify-between gap-2 py-2">
                    <div>
                      <p className="font-medium">{groupLabel(unit.bloodGroup)} · {unit.bankName}</p>
                      <p className="text-xs text-slate-500">Expires {fmtDate(unit.expiresAt)}</p>
                    </div>
                    <Badge tone={days <= 2 ? "danger" : "warning"}>{days <= 0 ? "expired" : `${days}d`}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="Recent requests"
        description={actor.role === "HOSPITAL" ? "Latest requests from your hospital." : "Newest requests across all hospitals."}
        actions={<Link href="/requests" className="text-sm font-medium text-rose-800 underline">View all</Link>}
      >
        {data.recentRequests.length === 0 ? (
          <EmptyState>No requests yet.</EmptyState>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Patient ref</Th>
                <Th>Hospital</Th>
                <Th>Group</Th>
                <Th className="text-right">Units</Th>
                <Th>Urgency</Th>
                <Th>Status</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.recentRequests.map((request) => (
                <tr key={request.id}>
                  <Td>
                    <Link href={`/requests/${request.id}`} className="font-medium text-rose-800 underline">
                      {request.patientRef}
                    </Link>
                  </Td>
                  <Td className="text-slate-600">{request.hospitalName}</Td>
                  <Td className="font-medium">{groupLabel(request.bloodGroup)}</Td>
                  <Td className="text-right tabular-nums">{request.unitsRequested}</Td>
                  <Td><StatusBadge value={request.urgency} /></Td>
                  <Td><StatusBadge value={request.status} /></Td>
                  <Td className="whitespace-nowrap text-slate-500">{fmtDateTime(request.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
