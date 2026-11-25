import Link from "next/link";
import { NewRequestForm } from "@/components/NewRequestForm";
import { Card, EmptyState, PageHeader, Pagination, StatusBadge, TableWrap, Td, Th } from "@/components/ui";
import { fmtDateTime, groupLabel } from "@/lib/format";
import { listQuerySchema } from "@/domain/schemas";
import { requirePageActor } from "@/server/guard";
import { listRequests } from "@/services/requests";

export const metadata = { title: "Requests — BloodLink" };

const STATUSES = ["PENDING", "APPROVED", "RESERVED", "WAITLISTED", "FULFILLED", "REJECTED", "CANCELLED", "EXPIRED"];
const GROUPS = ["A_POS", "A_NEG", "B_POS", "B_NEG", "AB_POS", "AB_NEG", "O_POS", "O_NEG"];
const inputClass = "rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-700";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePageActor(["ADMIN", "BANK_STAFF", "HOSPITAL"]);
  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string" && value !== "") flat[key] = value;

  const query = listQuerySchema.parse(flat);
  const result = await listRequests(actor, {
    ...query,
    status: flat.status,
    bloodGroup: flat.bloodGroup,
  });

  return (
    <>
      <PageHeader
        title="Blood requests"
        description="Every request moves through one enforced state machine: PENDING → APPROVED → RESERVED → FULFILLED."
      />

      {actor.role === "HOSPITAL" && (
        <Card title="New request" description="Validation runs in the browser and again on the server.">
          <NewRequestForm />
        </Card>
      )}

      <Card>
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="q" className="block text-xs font-medium text-slate-600">Patient ref</label>
            <input id="q" name="q" defaultValue={flat.q ?? ""} className={inputClass} placeholder="PT-1001" />
          </div>
          <div>
            <label htmlFor="status" className="block text-xs font-medium text-slate-600">Status</label>
            <select id="status" name="status" defaultValue={flat.status ?? ""} className={inputClass}>
              <option value="">All</option>
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="bloodGroup" className="block text-xs font-medium text-slate-600">Group</label>
            <select id="bloodGroup" name="bloodGroup" defaultValue={flat.bloodGroup ?? ""} className={inputClass}>
              <option value="">All</option>
              {GROUPS.map((group) => <option key={group} value={group}>{groupLabel(group)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="sort" className="block text-xs font-medium text-slate-600">Sort</label>
            <select id="sort" name="sort" defaultValue={flat.sort ?? "created_desc"} className={inputClass}>
              <option value="created_desc">Newest</option>
              <option value="urgency">Urgency</option>
            </select>
          </div>
          <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">Apply</button>
          <Link href="/requests" className="px-2 py-2 text-sm text-slate-600 underline">Reset</Link>
        </form>

        {result.rows.length === 0 ? (
          <EmptyState>No requests match these filters.</EmptyState>
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
              {result.rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/requests/${row.id}`} className="font-medium text-rose-800 underline">{row.patientRef}</Link>
                  </Td>
                  <Td className="text-slate-600">{row.hospitalName}</Td>
                  <Td className="font-medium">{groupLabel(row.bloodGroup)}</Td>
                  <Td className="text-right tabular-nums">{row.allocated}/{row.unitsRequested}</Td>
                  <Td><StatusBadge value={row.urgency} /></Td>
                  <Td><StatusBadge value={row.status} /></Td>
                  <Td className="whitespace-nowrap text-slate-500">{fmtDateTime(row.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}

        <div className="mt-3">
          <Pagination page={result.page} pageSize={result.pageSize} total={result.total} basePath="/requests" params={flat} />
        </div>
      </Card>
    </>
  );
}
