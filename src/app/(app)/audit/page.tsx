import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { VerifyChain } from "@/components/VerifyChain";
import { Card, EmptyState, PageHeader, Pagination, StatusBadge, TableWrap, Td, Th } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { requirePageActor } from "@/server/guard";

export const metadata = { title: "Audit log — BloodLink" };

const inputClass = "rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-700";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageActor(["ADMIN"]);
  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string" && value !== "") flat[key] = value;

  const page = Math.max(1, Number(flat.page ?? 1) || 1);
  const pageSize = 25;

  const conditions = [];
  if (flat.action) conditions.push(eq(s.auditLogs.action, flat.action));
  if (flat.outcome === "ALLOWED" || flat.outcome === "DENIED") conditions.push(eq(s.auditLogs.outcome, flat.outcome));
  if (flat.resourceType) conditions.push(eq(s.auditLogs.resourceType, flat.resourceType));
  const where = conditions.length ? and(...conditions) : undefined;

  const [countRow] = await db.select({ n: sql<number>`count(*)::int` }).from(s.auditLogs).where(where);
  const rows = await db
    .select({
      id: s.auditLogs.id,
      seq: s.auditLogs.seq,
      actorName: s.users.name,
      actorRole: sql<string>`${s.auditLogs.actorRole}::text`,
      action: s.auditLogs.action,
      resourceType: s.auditLogs.resourceType,
      resourceId: s.auditLogs.resourceId,
      outcome: sql<string>`${s.auditLogs.outcome}::text`,
      before: s.auditLogs.before,
      after: s.auditLogs.after,
      ip: s.auditLogs.ip,
      createdAt: s.auditLogs.createdAt,
      prevHash: s.auditLogs.prevHash,
      hash: s.auditLogs.hash,
    })
    .from(s.auditLogs)
    .leftJoin(s.users, eq(s.users.id, s.auditLogs.actorId))
    .where(where)
    .orderBy(desc(s.auditLogs.seq))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Append-only and hash-chained. Every ALLOWED and DENIED action is recorded; the database rejects UPDATE, DELETE and TRUNCATE."
      />

      <Card title="Integrity check" description="Recomputes SHA-256(prev_hash + row) for every row.">
        <VerifyChain />
      </Card>

      <Card>
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="action" className="block text-xs font-medium text-slate-600">Action</label>
            <input id="action" name="action" defaultValue={flat.action ?? ""} className={inputClass} placeholder="request:read" />
          </div>
          <div>
            <label htmlFor="outcome" className="block text-xs font-medium text-slate-600">Outcome</label>
            <select id="outcome" name="outcome" defaultValue={flat.outcome ?? ""} className={inputClass}>
              <option value="">All</option>
              <option value="ALLOWED">Allowed</option>
              <option value="DENIED">Denied</option>
            </select>
          </div>
          <div>
            <label htmlFor="resourceType" className="block text-xs font-medium text-slate-600">Resource type</label>
            <input id="resourceType" name="resourceType" defaultValue={flat.resourceType ?? ""} className={inputClass} placeholder="blood_request" />
          </div>
          <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">Apply</button>
          <Link href="/audit" className="px-2 py-2 text-sm text-slate-600 underline">Reset</Link>
        </form>

        {rows.length === 0 ? (
          <EmptyState>No audit entries match these filters.</EmptyState>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Seq</Th>
                <Th>Time</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Resource</Th>
                <Th>Outcome</Th>
                <Th>Hash</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-slate-50">
                  <Td className="tabular-nums text-slate-500">{row.seq}</Td>
                  <Td className="whitespace-nowrap text-slate-600">{fmtDateTime(row.createdAt)}</Td>
                  <Td>
                    <span className="font-medium">{row.actorName ?? "system"}</span>
                    <span className="block text-xs text-slate-500">{row.actorRole ?? "—"}</span>
                  </Td>
                  <Td className="font-mono text-xs">{row.action}</Td>
                  <Td>
                    <span className="font-mono text-xs">{row.resourceType}</span>
                    {row.resourceId && <span className="block font-mono text-xs text-slate-500">{row.resourceId.slice(0, 8)}</span>}
                    {(row.before !== null || row.after !== null) && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-rose-800">payload</summary>
                        <pre className="mt-1 max-w-md overflow-x-auto rounded bg-slate-50 p-2 text-[11px] leading-snug text-slate-700">
{JSON.stringify({ before: row.before, after: row.after }, null, 2)}
                        </pre>
                      </details>
                    )}
                  </Td>
                  <Td><StatusBadge value={row.outcome} /></Td>
                  <Td className="font-mono text-[11px] text-slate-500" title={`prev ${row.prevHash}\nhash ${row.hash}`}>
                    {row.hash.slice(0, 12)}…
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}

        <div className="mt-3">
          <Pagination page={page} pageSize={pageSize} total={countRow.n} basePath="/audit" params={flat} />
        </div>
      </Card>
    </>
  );
}
