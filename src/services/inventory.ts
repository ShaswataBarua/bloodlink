import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema as s, type Tx } from "@/db";
import type { ListQuery } from "@/domain/schemas";
import { appendAudit, audit } from "@/server/audit";
import { authorize } from "@/server/guard";
import { HttpError } from "@/server/http";
import { can } from "@/server/policy";
import type { Actor } from "@/server/session";

export type UnitRow = {
  id: string;
  bloodGroup: string;
  componentType: string;
  status: string;
  bankName: string;
  bankId: string;
  collectedAt: Date;
  expiresAt: Date;
  version: number;
};

export async function listUnits(
  actor: Actor,
  query: ListQuery,
): Promise<{ rows: UnitRow[]; total: number; page: number; pageSize: number }> {
  const conditions = [];
  const bankId = actor.role === "BANK_STAFF" ? actor.bankId : query.bankId;
  if (bankId) conditions.push(eq(s.bloodUnits.bankId, bankId));
  if (query.status) conditions.push(sql`${s.bloodUnits.status}::text = ${query.status}`);
  if (query.bloodGroup) conditions.push(sql`${s.bloodUnits.bloodGroup}::text = ${query.bloodGroup}`);
  if (query.q) conditions.push(sql`${s.bloodUnits.id}::text ilike ${`${query.q}%`}`);
  if (query.expiringWithinDays !== undefined) {
    conditions.push(sql`${s.bloodUnits.expiresAt} <= now() + ${`${query.expiringWithinDays} days`}::interval`);
  }
  if (query.from) conditions.push(gte(s.bloodUnits.collectedAt, new Date(query.from)));
  if (query.to) conditions.push(lte(s.bloodUnits.collectedAt, new Date(`${query.to}T23:59:59.999Z`)));

  const where = conditions.length ? and(...conditions) : undefined;

  const [countRow] = await db.select({ n: sql<number>`count(*)::int` }).from(s.bloodUnits).where(where);

  const orderBy =
    query.sort === "expiry_desc" ? desc(s.bloodUnits.expiresAt)
    : query.sort === "collected_desc" ? desc(s.bloodUnits.collectedAt)
    : asc(s.bloodUnits.expiresAt);

  const rows = await db
    .select({
      id: s.bloodUnits.id,
      bloodGroup: sql<string>`${s.bloodUnits.bloodGroup}::text`,
      componentType: sql<string>`${s.bloodUnits.componentType}::text`,
      status: sql<string>`${s.bloodUnits.status}::text`,
      bankName: s.bloodBanks.name,
      bankId: s.bloodUnits.bankId,
      collectedAt: s.bloodUnits.collectedAt,
      expiresAt: s.bloodUnits.expiresAt,
      version: s.bloodUnits.version,
    })
    .from(s.bloodUnits)
    .innerJoin(s.bloodBanks, eq(s.bloodBanks.id, s.bloodUnits.bankId))
    .where(where)
    .orderBy(orderBy)
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return { rows, total: countRow.n, page: query.page, pageSize: query.pageSize };
}

/** AVAILABLE <-> DISCARDED only; reserved or issued units are controlled by allocation. */
export async function setUnitStatus(
  actor: Actor,
  unitId: string,
  status: "AVAILABLE" | "DISCARDED",
  reason: string | undefined,
  ip?: string,
): Promise<{ id: string; status: string }> {
  const [unit] = await db.select().from(s.bloodUnits).where(eq(s.bloodUnits.id, unitId)).limit(1);
  if (!unit) throw new HttpError(404, "Unit not found.", "NOT_FOUND");
  if (!can(actor, "inventory:write", { bankId: unit.bankId })) {
    throw new HttpError(403, "You can only change stock at your own blood bank.", "FORBIDDEN");
  }
  if (unit.status !== "AVAILABLE" && unit.status !== "DISCARDED") {
    throw new HttpError(409, `A ${unit.status} unit cannot be manually changed.`, "INVALID_STATE");
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from blood_units where id = ${unitId} for update`);
    await tx
      .update(s.bloodUnits)
      .set({ status, version: sql`${s.bloodUnits.version} + 1` })
      .where(eq(s.bloodUnits.id, unitId));
    await appendAudit(tx, {
      actorId: actor.id, actorRole: actor.role, action: "inventory:write",
      resourceType: "blood_unit", resourceId: unitId, outcome: "ALLOWED", ip,
      before: { status: unit.status }, after: { status, reason: reason ?? null },
    });
  });

  return { id: unitId, status };
}

/**
 * Auto-expiry: units past expiresAt leave the available pool, their reservations are
 * released, and a request that loses all its units goes back to the waitlist.
 */
export async function expireUnits(): Promise<{ expired: number; releasedRequests: number }> {
  return db.transaction(async (tx) => {
    const expiredRows = await tx.execute<{ id: string; request_id: string | null }>(sql`
      with expired as (
        update blood_units set status = 'EXPIRED', version = version + 1
        where status in ('AVAILABLE','RESERVED') and expires_at <= now()
        returning id
      )
      select e.id, a.request_id
      from expired e
      left join allocations a on a.unit_id = e.id and a.released_at is null
    `);

    if (expiredRows.rows.length === 0) return { expired: 0, releasedRequests: 0 };

    const requestIds = [...new Set(expiredRows.rows.map((r) => r.request_id).filter((v): v is string => !!v))];

    if (requestIds.length > 0) {
      await tx.execute(sql`
        update allocations set released_at = now()
        where released_at is null and unit_id in (
          select id from blood_units where status = 'EXPIRED'
        )
      `);

      for (const requestId of requestIds) {
        const left = await tx.execute<{ n: number }>(
          sql`select count(*)::int as n from allocations where request_id = ${requestId} and released_at is null`,
        );
        if (left.rows[0].n === 0) {
          await tx.execute(sql`
            update blood_requests
            set status = 'WAITLISTED',
                status_reason = 'Reserved units expired before issue; returned to waitlist.',
                updated_at = now()
            where id = ${requestId} and status = 'RESERVED'
          `);
        }
      }
    }

    await appendAudit(tx, {
      action: "inventory:expire", resourceType: "blood_unit", resourceId: null, outcome: "ALLOWED",
      after: { expired: expiredRows.rows.length, affectedRequests: requestIds.length },
    });

    return { expired: expiredRows.rows.length, releasedRequests: requestIds.length };
  });
}

export async function expireUnitsSafe(): Promise<void> {
  try {
    const result = await expireUnits();
    if (result.expired > 0) {
      await audit({
        action: "inventory:expire.cron", resourceType: "blood_unit", resourceId: null,
        outcome: "ALLOWED", after: result,
      });
    }
  } catch (error) {
    console.error("[expiry] failed", error);
  }
}

export type InventorySummary = {
  byGroup: Array<{ bloodGroup: string; available: number; reserved: number; expiringSoon: number }>;
};

export async function inventorySummary(tx: Tx | typeof db = db): Promise<InventorySummary> {
  const result = await tx.execute<{ blood_group: string; available: number; reserved: number; expiring_soon: number }>(sql`
    select blood_group::text as blood_group,
      count(*) filter (where status = 'AVAILABLE')::int as available,
      count(*) filter (where status = 'RESERVED')::int as reserved,
      count(*) filter (where status = 'AVAILABLE' and expires_at <= now() + interval '7 days')::int as expiring_soon
    from blood_units
    group by blood_group
    order by blood_group::text
  `);
  return {
    byGroup: result.rows.map((r) => ({
      bloodGroup: r.blood_group,
      available: r.available,
      reserved: r.reserved,
      expiringSoon: r.expiring_soon,
    })),
  };
}
