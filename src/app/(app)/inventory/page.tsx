import Link from "next/link";
import { UnitStatusButton } from "@/components/UnitStatusButton";
import { Badge, Card, EmptyState, PageHeader, Pagination, StatusBadge, TableWrap, Td, Th } from "@/components/ui";
import { daysUntil, fmtDate, groupLabel } from "@/lib/format";
import { listQuerySchema } from "@/domain/schemas";
import { requirePageActor } from "@/server/guard";
import { listUnits } from "@/services/inventory";

export const metadata = { title: "Inventory — BloodLink" };

const STATUSES = ["AVAILABLE", "RESERVED", "ISSUED", "EXPIRED", "DISCARDED"];
const GROUPS = ["A_POS", "A_NEG", "B_POS", "B_NEG", "AB_POS", "AB_NEG", "O_POS", "O_NEG"];
const inputClass = "rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-700";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePageActor(["ADMIN", "BANK_STAFF", "HOSPITAL"]);
  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string" && value !== "") flat[key] = value;

  const query = listQuerySchema.parse(flat);
  const result = await listUnits(actor, query);
  const canWrite = actor.role === "ADMIN" || actor.role === "BANK_STAFF";

  return (
    <>
      <PageHeader
        title="Blood unit inventory"
        description={
          actor.role === "BANK_STAFF"
            ? "Only your bank's units are shown."
            : "Search, filter and sort every unit. FEFO is the default order."
        }
      />

      <Card>
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="q" className="block text-xs font-medium text-slate-600">Unit ID prefix</label>
            <input id="q" name="q" defaultValue={flat.q ?? ""} className={inputClass} placeholder="a1b2c3" />
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
            <label htmlFor="expiringWithinDays" className="block text-xs font-medium text-slate-600">Expiring within (days)</label>
            <input id="expiringWithinDays" name="expiringWithinDays" type="number" min={0} max={365}
              defaultValue={flat.expiringWithinDays ?? ""} className={`${inputClass} w-24`} placeholder="7" />
          </div>
          <div>
            <label htmlFor="sort" className="block text-xs font-medium text-slate-600">Sort</label>
            <select id="sort" name="sort" defaultValue={flat.sort ?? "expiry_asc"} className={inputClass}>
              <option value="expiry_asc">Expiry (soonest)</option>
              <option value="expiry_desc">Expiry (latest)</option>
              <option value="collected_desc">Collected (newest)</option>
            </select>
          </div>
          <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">Apply</button>
          <Link href="/inventory" className="px-2 py-2 text-sm text-slate-600 underline">Reset</Link>
        </form>

        {result.rows.length === 0 ? (
          <EmptyState>No units match these filters.</EmptyState>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Unit</Th>
                <Th>Group</Th>
                <Th>Bank</Th>
                <Th>Status</Th>
                <Th>Collected</Th>
                <Th>Expires</Th>
                <Th>Shelf life</Th>
                {canWrite && <Th>Action</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.rows.map((unit) => {
                const days = daysUntil(unit.expiresAt);
                return (
                  <tr key={unit.id} className="hover:bg-slate-50">
                    <Td className="font-mono text-xs">{unit.id.slice(0, 8)}</Td>
                    <Td className="font-semibold">{groupLabel(unit.bloodGroup)}</Td>
                    <Td className="text-slate-600">{unit.bankName}</Td>
                    <Td><StatusBadge value={unit.status} /></Td>
                    <Td className="whitespace-nowrap text-slate-600">{fmtDate(unit.collectedAt)}</Td>
                    <Td className="whitespace-nowrap text-slate-600">{fmtDate(unit.expiresAt)}</Td>
                    <Td>
                      {unit.status === "EXPIRED" || days <= 0
                        ? <Badge tone="danger">expired</Badge>
                        : <Badge tone={days <= 3 ? "warning" : "neutral"}>{days}d left</Badge>}
                    </Td>
                    {canWrite && <Td><UnitStatusButton unitId={unit.id} status={unit.status} /></Td>}
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}

        <div className="mt-3">
          <Pagination page={result.page} pageSize={result.pageSize} total={result.total} basePath="/inventory" params={flat} />
        </div>
      </Card>
    </>
  );
}
