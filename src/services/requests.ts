import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, schema as s, type Tx } from "@/db";
import { candidateGroups } from "@/domain/compatibility";
import { canTransition, illegalTransitionMessage, type RequestStatus } from "@/domain/request-state";
import type { createRequestSchema, ListQuery, transitionSchema } from "@/domain/schemas";
import type { z } from "zod";
import { appendAudit, audit, stableStringify } from "@/server/audit";
import { denyAsNotFound } from "@/server/guard";
import { HttpError } from "@/server/http";
import { can } from "@/server/policy";
import { withTxRetry } from "@/server/retry";
import type { Actor } from "@/server/session";

type BloodRequestRow = typeof s.bloodRequests.$inferSelect;

export type ReserveResult = {
  requestId: string;
  status: RequestStatus;
  reserved: number;
  requested: number;
  unitIds: string[];
  message: string;
};

const OPEN_STATUSES: RequestStatus[] = ["PENDING", "APPROVED", "WAITLISTED"];

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type RequestListRow = {
  id: string;
  patientRef: string;
  bloodGroup: string;
  unitsRequested: number;
  urgency: string;
  status: string;
  statusReason: string | null;
  createdAt: Date;
  hospitalName: string;
  hospitalId: string;
  allocated: number;
};

export async function listRequests(
  actor: Actor,
  query: ListQuery & { status?: string; bloodGroup?: string; hospitalId?: string },
): Promise<{ rows: RequestListRow[]; total: number; page: number; pageSize: number }> {
  const conditions = [];
  if (actor.role === "HOSPITAL") conditions.push(eq(s.bloodRequests.hospitalId, actor.hospitalId!));
  else if (query.hospitalId) conditions.push(eq(s.bloodRequests.hospitalId, query.hospitalId));

  if (query.status) conditions.push(eq(s.bloodRequests.status, query.status as RequestStatus));
  if (query.bloodGroup) conditions.push(sql`${s.bloodRequests.bloodGroup}::text = ${query.bloodGroup}`);
  if (query.q) conditions.push(sql`${s.bloodRequests.patientRef} ilike ${`%${query.q}%`}`);
  if (query.from) conditions.push(gte(s.bloodRequests.createdAt, new Date(query.from)));
  if (query.to) conditions.push(lte(s.bloodRequests.createdAt, new Date(`${query.to}T23:59:59.999Z`)));

  const where = conditions.length ? and(...conditions) : undefined;

  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.bloodRequests)
    .where(where);

  const orderBy =
    query.sort === "urgency"
      ? sql`case ${s.bloodRequests.urgency} when 'CRITICAL' then 0 when 'URGENT' then 1 else 2 end asc, ${s.bloodRequests.createdAt} desc`
      : desc(s.bloodRequests.createdAt);

  const rows = await db
    .select({
      id: s.bloodRequests.id,
      patientRef: s.bloodRequests.patientRef,
      bloodGroup: sql<string>`${s.bloodRequests.bloodGroup}::text`,
      unitsRequested: s.bloodRequests.unitsRequested,
      urgency: sql<string>`${s.bloodRequests.urgency}::text`,
      status: sql<string>`${s.bloodRequests.status}::text`,
      statusReason: s.bloodRequests.statusReason,
      createdAt: s.bloodRequests.createdAt,
      hospitalId: s.bloodRequests.hospitalId,
      hospitalName: s.hospitals.name,
      allocated: sql<number>`(
        select count(*)::int from allocations a
        where a.request_id = ${s.bloodRequests.id} and a.released_at is null
      )`,
    })
    .from(s.bloodRequests)
    .innerJoin(s.hospitals, eq(s.hospitals.id, s.bloodRequests.hospitalId))
    .where(where)
    .orderBy(orderBy)
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  return { rows, total: countRow.n, page: query.page, pageSize: query.pageSize };
}

export type RequestDetail = {
  request: BloodRequestRow & { hospitalName: string; requestedByName: string };
  allocations: Array<{
    id: string;
    unitId: string;
    bloodGroup: string;
    expiresAt: Date;
    unitStatus: string;
    allocatedAt: Date;
    releasedAt: Date | null;
  }>;
};

export async function getRequestDetail(actor: Actor, id: string, ip?: string): Promise<RequestDetail> {
  const rows = await db
    .select({
      request: s.bloodRequests,
      hospitalName: s.hospitals.name,
      requestedByName: s.users.name,
    })
    .from(s.bloodRequests)
    .innerJoin(s.hospitals, eq(s.hospitals.id, s.bloodRequests.hospitalId))
    .innerJoin(s.users, eq(s.users.id, s.bloodRequests.requestedById))
    .where(eq(s.bloodRequests.id, id))
    .limit(1);

  const found = rows[0];
  if (!found) throw new HttpError(404, "Request not found.", "NOT_FOUND");

  if (!can(actor, "request:read", { hospitalId: found.request.hospitalId })) {
    await denyAsNotFound(actor, "request:read", { hospitalId: found.request.hospitalId }, {
      ip, resourceType: "blood_request", resourceId: id,
    });
  }

  const allocations = await db
    .select({
      id: s.allocations.id,
      unitId: s.allocations.unitId,
      bloodGroup: sql<string>`${s.bloodUnits.bloodGroup}::text`,
      expiresAt: s.bloodUnits.expiresAt,
      unitStatus: sql<string>`${s.bloodUnits.status}::text`,
      allocatedAt: s.allocations.allocatedAt,
      releasedAt: s.allocations.releasedAt,
    })
    .from(s.allocations)
    .innerJoin(s.bloodUnits, eq(s.bloodUnits.id, s.allocations.unitId))
    .where(eq(s.allocations.requestId, id))
    .orderBy(asc(s.allocations.allocatedAt));

  return {
    request: { ...found.request, hospitalName: found.hospitalName, requestedByName: found.requestedByName },
    allocations,
  };
}

// ---------------------------------------------------------------------------
// Create (idempotent)
// ---------------------------------------------------------------------------

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export type CreateRequestResponse = {
  id: string;
  status: RequestStatus;
  patientRef: string;
  unitsRequested: number;
  createdAt: string;
};

export async function createRequest(
  actor: Actor,
  input: CreateRequestInput,
  idempotencyKey: string | undefined,
  ip?: string,
): Promise<{ body: CreateRequestResponse; replayed: boolean }> {
  if (!can(actor, "request:create")) {
    throw new HttpError(403, "Only hospital accounts can create blood requests.", "FORBIDDEN");
  }
  const hospitalId = actor.hospitalId;
  if (!hospitalId) throw new HttpError(403, "Your account is not linked to a hospital.", "NO_TENANT");

  const key = idempotencyKey?.trim() || `auto-${randomUUID()}`;
  const scope = "request:create";
  const scopedKey = `${hospitalId}:${key}`;
  const requestHash = createHash("sha256").update(stableStringify(input)).digest("hex");

  return withTxRetry(() =>
    db.transaction(async (tx) => {
      // Serialise concurrent retries of the same key.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${scopedKey}))`);

      const existing = await tx
        .select()
        .from(s.idempotencyRecords)
        .where(and(eq(s.idempotencyRecords.scope, scope), eq(s.idempotencyRecords.key, scopedKey)))
        .limit(1);

      if (existing[0]) {
        if (existing[0].requestHash !== requestHash) {
          await appendAudit(tx, {
            actorId: actor.id, actorRole: actor.role, action: "request:create",
            resourceType: "blood_request", resourceId: null, outcome: "DENIED", ip,
            after: { reason: "idempotency key reused with a different payload" },
          });
          throw new HttpError(
            422,
            "This Idempotency-Key was already used with a different request payload.",
            "IDEMPOTENCY_MISMATCH",
          );
        }
        return { body: existing[0].responseJson as CreateRequestResponse, replayed: true };
      }

      // Multi-condition business rule: the hospital's daily cap counts live requests only.
      const cap = await tx.execute<{ cap: number; used: number }>(sql`
        select h.daily_unit_cap as cap,
          coalesce((
            select sum(r.units_requested) from blood_requests r
            where r.hospital_id = ${hospitalId}
              and r.created_at >= date_trunc('day', now())
              and r.status not in ('REJECTED','CANCELLED','EXPIRED')
          ), 0)::int as used
        from hospitals h where h.id = ${hospitalId}
      `);
      const limits = cap.rows[0];
      if (!limits) throw new HttpError(404, "Hospital not found.", "NOT_FOUND");
      if (limits.used + input.unitsRequested > limits.cap) {
        await appendAudit(tx, {
          actorId: actor.id, actorRole: actor.role, action: "request:create",
          resourceType: "blood_request", resourceId: null, outcome: "DENIED", ip,
          after: { reason: "daily cap exceeded", cap: limits.cap, used: limits.used },
        });
        throw new HttpError(
          422,
          `Daily limit exceeded: this hospital may request ${limits.cap} units per day and ${limits.used} are already committed.`,
          "DAILY_CAP",
        );
      }

      const [created] = await tx
        .insert(s.bloodRequests)
        .values({
          hospitalId,
          requestedById: actor.id,
          patientRef: input.patientRef,
          bloodGroup: input.bloodGroup,
          unitsRequested: input.unitsRequested,
          urgency: input.urgency,
          idempotencyKey: key,
        })
        .returning();

      const body: CreateRequestResponse = {
        id: created.id,
        status: created.status,
        patientRef: created.patientRef,
        unitsRequested: created.unitsRequested,
        createdAt: created.createdAt.toISOString(),
      };

      await tx.insert(s.idempotencyRecords).values({
        scope, key: scopedKey, requestHash, responseJson: body as never, statusCode: 201,
      });

      await appendAudit(tx, {
        actorId: actor.id, actorRole: actor.role, action: "request:create",
        resourceType: "blood_request", resourceId: created.id, outcome: "ALLOWED", ip,
        after: body,
      });

      return { body, replayed: false };
    }),
  );
}

// ---------------------------------------------------------------------------
// A05 core: reserve units inside one transaction
// ---------------------------------------------------------------------------

type LockedRequest = {
  id: string;
  status: RequestStatus;
  blood_group: string;
  units_requested: number;
  hospital_id: string;
};

async function reserveCore(
  tx: Tx,
  requestId: string,
  opts: { exactOnly?: boolean; actor?: Actor | null; ip?: string | null; action?: string } = {},
): Promise<ReserveResult> {
  const locked = await tx.execute<LockedRequest>(
    sql`select id, status, blood_group, units_requested, hospital_id
        from blood_requests where id = ${requestId} for update`,
  );
  const request = locked.rows[0];
  if (!request) throw new HttpError(404, "Request not found.", "NOT_FOUND");

  const already = await tx.execute<{ n: number }>(
    sql`select count(*)::int as n from allocations where request_id = ${requestId} and released_at is null`,
  );
  const allocated = already.rows[0].n;

  if (request.status === "RESERVED" || request.status === "FULFILLED") {
    const ids = await tx.execute<{ unit_id: string }>(
      sql`select unit_id from allocations where request_id = ${requestId} and released_at is null`,
    );
    return {
      requestId, status: request.status, reserved: allocated, requested: request.units_requested,
      unitIds: ids.rows.map((r) => r.unit_id), message: `Request is already ${request.status}.`,
    };
  }

  if (!OPEN_STATUSES.includes(request.status)) {
    throw new HttpError(
      409,
      `Cannot reserve units for a request in status ${request.status}.`,
      "INVALID_STATE",
    );
  }

  const remaining = request.units_requested - allocated;
  const groups = candidateGroups(request.blood_group as never, opts.exactOnly);

  const groupList = sql.join(groups.map((g) => sql`${g}::blood_group`), sql`, `);
  const groupOrder = sql.join(
    groups.map((g, index) => sql`when ${g}::blood_group then ${index}`),
    sql` `,
  );

  // Exact group first, then compatible groups; FEFO inside each group.
  // SKIP LOCKED lets concurrent reservations take different rows instead of queueing.
  const candidates = await tx.execute<{ id: string }>(sql`
    select id from blood_units
    where status = 'AVAILABLE'
      and expires_at > now()
      and blood_group in (${groupList})
    order by case blood_group ${groupOrder} else 99 end asc, expires_at asc
    limit ${remaining}
    for update skip locked
  `);
  const unitIds = candidates.rows.map((r) => r.id);

  if (unitIds.length > 0) {
    await tx
      .update(s.bloodUnits)
      .set({ status: "RESERVED", version: sql`${s.bloodUnits.version} + 1` })
      .where(and(inArray(s.bloodUnits.id, unitIds), eq(s.bloodUnits.status, "AVAILABLE")));

    await tx.insert(s.allocations).values(unitIds.map((unitId) => ({ requestId, unitId })));
  }

  const newStatus: RequestStatus =
    unitIds.length === 0 ? "WAITLISTED" : "RESERVED";
  const totalReserved = allocated + unitIds.length;
  const reason =
    unitIds.length === 0
      ? "No compatible, unexpired units are currently available; added to the waitlist."
      : totalReserved < request.units_requested
        ? `Partially reserved: ${totalReserved} of ${request.units_requested} units; remainder is waitlisted.`
        : null;

  if (!canTransition(request.status, newStatus)) {
    throw new HttpError(409, illegalTransitionMessage(request.status, newStatus), "INVALID_STATE");
  }

  await tx
    .update(s.bloodRequests)
    .set({ status: newStatus, statusReason: reason, updatedAt: new Date() })
    .where(eq(s.bloodRequests.id, requestId));

  await appendAudit(tx, {
    actorId: opts.actor?.id ?? null,
    actorRole: opts.actor?.role ?? null,
    action: opts.action ?? "request:reserve",
    resourceType: "blood_request",
    resourceId: requestId,
    outcome: "ALLOWED",
    ip: opts.ip ?? null,
    before: { status: request.status, reserved: allocated },
    after: { status: newStatus, reserved: totalReserved, unitIds },
  });

  return {
    requestId,
    status: newStatus,
    reserved: totalReserved,
    requested: request.units_requested,
    unitIds,
    message: reason ?? `Reserved ${totalReserved} unit(s).`,
  };
}

export async function reserveRequest(
  actor: Actor,
  requestId: string,
  ip?: string,
  opts: { exactOnly?: boolean } = {},
): Promise<ReserveResult> {
  // Reservation is a staff operation; the route already authenticated the caller.
  if (!can(actor, "request:allocate")) {
    await audit({
      actorId: actor.id, actorRole: actor.role, action: "request:allocate",
      resourceType: "blood_request", resourceId: requestId, outcome: "DENIED", ip,
    });
    throw new HttpError(403, "Only blood bank staff can reserve units.", "FORBIDDEN");
  }
  return withTxRetry(() =>
    db.transaction((tx) => reserveCore(tx, requestId, { ...opts, actor, ip })),
  );
}

/** Used by the Race Lab and tests: no actor check, still one real transaction per call. */
export async function reserveForRace(requestId: string, actor: Actor): Promise<ReserveResult> {
  return withTxRetry(() =>
    db.transaction((tx) => reserveCore(tx, requestId, { exactOnly: true, actor, action: "race:reserve" })),
  );
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

type TransitionInput = z.infer<typeof transitionSchema>;

const TARGET: Record<TransitionInput["action"], RequestStatus> = {
  approve: "APPROVED",
  reject: "REJECTED",
  reserve: "RESERVED",
  fulfil: "FULFILLED",
  cancel: "CANCELLED",
};

export async function transitionRequest(
  actor: Actor,
  requestId: string,
  input: TransitionInput,
  ip?: string,
): Promise<{ id: string; status: RequestStatus; message: string }> {
  if (input.action === "reserve") {
    const result = await reserveRequest(actor, requestId, ip);
    return { id: requestId, status: result.status, message: result.message };
  }

  const action = input.action === "cancel" ? "request:cancel"
    : input.action === "fulfil" ? "request:fulfil"
    : input.action === "reject" ? "request:reject"
    : "request:approve";

  const before = await loadRequest(actor, requestId, ip);
  const target = TARGET[input.action];

  if (!can(actor, action, { hospitalId: before.hospitalId })) {
    await denyAsNotFound(actor, action, { hospitalId: before.hospitalId }, {
      ip, resourceType: "blood_request", resourceId: requestId,
    });
  }

  if (input.action === "reject" && !input.reason?.trim()) {
    throw new HttpError(400, "A reason is required when rejecting a request.", "REASON_REQUIRED");
  }
  if (!canTransition(before.status, target)) {
    throw new HttpError(409, illegalTransitionMessage(before.status, target), "INVALID_STATE");
  }

  return withTxRetry(() =>
    db.transaction(async (tx) => {
      const locked = await tx.execute<{ status: RequestStatus }>(
        sql`select status from blood_requests where id = ${requestId} for update`,
      );
      const current = locked.rows[0];
      if (!current) throw new HttpError(404, "Request not found.", "NOT_FOUND");
      if (!canTransition(current.status, target)) {
        throw new HttpError(409, illegalTransitionMessage(current.status, target), "INVALID_STATE");
      }

      if (input.action === "fulfil") {
        const expired = await tx.execute<{ n: number }>(sql`
          select count(*)::int as n from allocations a
          join blood_units u on u.id = a.unit_id
          where a.request_id = ${requestId} and a.released_at is null and u.expires_at <= now()
        `);
        if (expired.rows[0].n > 0) {
          throw new HttpError(
            409,
            "A reserved unit has expired. Cancel or re-reserve before fulfilling.",
            "UNIT_EXPIRED",
          );
        }
        await tx.execute(sql`
          update blood_units set status = 'ISSUED', version = version + 1
          where id in (select unit_id from allocations where request_id = ${requestId} and released_at is null)
        `);
      }

      if (input.action === "reject" || input.action === "cancel") {
        await releaseAllocations(tx, requestId);
      }

      await tx
        .update(s.bloodRequests)
        .set({ status: target, statusReason: input.reason?.trim() || null, updatedAt: new Date() })
        .where(eq(s.bloodRequests.id, requestId));

      await appendAudit(tx, {
        actorId: actor.id, actorRole: actor.role, action,
        resourceType: "blood_request", resourceId: requestId, outcome: "ALLOWED", ip,
        before: { status: current.status },
        after: { status: target, reason: input.reason ?? null },
      });

      return { id: requestId, status: target, message: `Request is now ${target}.` };
    }),
  );
}

async function releaseAllocations(tx: Tx, requestId: string): Promise<void> {
  await tx.execute(sql`
    update blood_units set status = 'AVAILABLE', version = version + 1
    where status = 'RESERVED'
      and id in (select unit_id from allocations where request_id = ${requestId} and released_at is null)
  `);
  await tx
    .update(s.allocations)
    .set({ releasedAt: new Date() })
    .where(and(eq(s.allocations.requestId, requestId), sql`${s.allocations.releasedAt} is null`));
}

async function loadRequest(actor: Actor, requestId: string, ip?: string): Promise<BloodRequestRow> {
  const [row] = await db.select().from(s.bloodRequests).where(eq(s.bloodRequests.id, requestId)).limit(1);
  if (!row) throw new HttpError(404, "Request not found.", "NOT_FOUND");
  if (!can(actor, "request:read", { hospitalId: row.hospitalId })) {
    await denyAsNotFound(actor, "request:read", { hospitalId: row.hospitalId }, {
      ip, resourceType: "blood_request", resourceId: requestId,
    });
  }
  return row;
}

// ---------------------------------------------------------------------------
// Waitlist and expiry
// ---------------------------------------------------------------------------

/** Called after new stock arrives: priority first, then oldest request. */
export async function processWaitlist(): Promise<{ processed: number; reserved: number }> {
  const waiting = await db.execute<{ id: string }>(sql`
    select id from blood_requests
    where status = 'WAITLISTED'
    order by case urgency when 'CRITICAL' then 0 when 'URGENT' then 1 else 2 end asc, created_at asc
  `);

  let reserved = 0;
  for (const row of waiting.rows) {
    const result = await withTxRetry(() =>
      db.transaction((tx) =>
        reserveCore(tx, row.id, { action: "request:reserve.waitlist", exactOnly: false }),
      ),
    );
    if (result.reserved > 0) reserved += 1;
  }
  return { processed: waiting.rows.length, reserved };
}

export async function expireStaleRequests(): Promise<number> {
  const result = await db.execute<{ id: string }>(sql`
    update blood_requests set status = 'EXPIRED',
      status_reason = 'Not fulfilled within 48 hours', updated_at = now()
    where status in ('PENDING','APPROVED','WAITLISTED')
      and created_at < now() - interval '48 hours'
    returning id
  `);
  if (result.rows.length > 0) {
    await audit({
      action: "request:expire", resourceType: "blood_request", resourceId: null,
      outcome: "ALLOWED", after: { expired: result.rows.length },
    });
  }
  return result.rows.length;
}

export { reserveCore };
