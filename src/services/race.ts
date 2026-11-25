import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { DAY_MS, SHELF_LIFE_DAYS } from "@/domain/blood";
import { audit } from "@/server/audit";
import { HttpError } from "@/server/http";
import type { Actor } from "@/server/session";
import { reserveForRace } from "./requests";

export type RaceRow = {
  index: number;
  requestId: string;
  outcome: "WINNER" | "WAITLISTED" | "ERROR";
  status: string;
  reserved: number;
  message: string;
};

export type RaceResult = {
  n: number;
  winners: number;
  waitlisted: number;
  errors: number;
  doubleAllocations: number;
  elapsedMs: number;
  before: { availableAbNeg: number };
  after: { availableAbNeg: number; reservedAbNeg: number };
  rows: RaceRow[];
};

/**
 * Restores the demo fixture: releases every earlier race reservation and guarantees
 * exactly one AVAILABLE AB- unit, so the run is reproducible.
 */
async function prepareFixture(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      update blood_units set status = 'AVAILABLE', version = version + 1
      where status = 'RESERVED' and id in (
        select a.unit_id from allocations a
        join blood_requests r on r.id = a.request_id
        where a.released_at is null and r.patient_ref like 'RACE-%'
      )
    `);
    await tx.execute(sql`
      update allocations set released_at = now()
      where released_at is null and request_id in (
        select id from blood_requests where patient_ref like 'RACE-%'
      )
    `);
    await tx.execute(sql`
      update blood_requests set status = 'CANCELLED', status_reason = 'Race fixture reset',
        updated_at = now()
      where patient_ref like 'RACE-%' and status in ('PENDING','APPROVED','WAITLISTED','RESERVED')
    `);

    const available = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from blood_units
      where blood_group = 'AB_NEG' and status = 'AVAILABLE' and expires_at > now()
    `);
    if (available.rows[0].n === 0) {
      const [bank] = await tx.select().from(s.bloodBanks).limit(1);
      if (!bank) throw new HttpError(409, "No blood bank exists. Run the seed script.", "NO_SEED");
      await tx.insert(s.bloodUnits).values({
        bloodGroup: "AB_NEG",
        componentType: "RED_CELLS",
        bankId: bank.id,
        collectedAt: new Date(Date.now() - 5 * DAY_MS),
        expiresAt: new Date(Date.now() + (SHELF_LIFE_DAYS - 5) * DAY_MS),
        status: "AVAILABLE",
      });
    }
  });
}

/**
 * A05 demo: creates N one-unit AB- requests, fires all reservations at the same time,
 * and reports what the database actually did.
 */
export async function runRace(actor: Actor, n: number, ip?: string): Promise<RaceResult> {
  await prepareFixture();

  const beforeRows = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from blood_units
    where blood_group = 'AB_NEG' and status = 'AVAILABLE' and expires_at > now()
  `);
  const before = beforeRows.rows[0].n;

  const hospitals = await db.select().from(s.hospitals).limit(3);
  if (hospitals.length === 0) throw new HttpError(409, "No hospitals exist. Run the seed script.", "NO_SEED");

  const runId = randomUUID().slice(0, 8);
  const requestIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const hospital = hospitals[i % hospitals.length];
    const hospitalUser = await db.execute<{ id: string }>(
      sql`select id from users where hospital_id = ${hospital.id} and role = 'HOSPITAL' limit 1`,
    );
    if (!hospitalUser.rows[0]) throw new HttpError(409, "Hospital user missing. Run the seed script.", "NO_SEED");

    const [request] = await db
      .insert(s.bloodRequests)
      .values({
        hospitalId: hospital.id,
        requestedById: hospitalUser.rows[0].id,
        patientRef: `RACE-${runId}-${String(i + 1).padStart(2, "0")}`,
        bloodGroup: "AB_NEG",
        unitsRequested: 1,
        urgency: "CRITICAL",
        idempotencyKey: `race-${runId}-${i}`,
        // Fixtures must not consume a hospital's real daily cap.
        createdAt: new Date(Date.now() - DAY_MS),
      })
      .returning();
    requestIds.push(request.id);
  }

  // Every call opens its own transaction and pool connection: genuinely concurrent.
  const startedAt = Date.now();
  const settled = await Promise.allSettled(requestIds.map((id) => reserveForRace(id, actor)));
  const elapsedMs = Date.now() - startedAt;

  const rows: RaceRow[] = settled.map((result, index) => {
    if (result.status === "rejected") {
      const error = result.reason as { message?: string };
      return {
        index: index + 1, requestId: requestIds[index], outcome: "ERROR", status: "ERROR",
        reserved: 0, message: error?.message ?? "Unknown error",
      };
    }
    const value = result.value;
    return {
      index: index + 1, requestId: requestIds[index],
      outcome: value.reserved > 0 ? "WINNER" : "WAITLISTED",
      status: value.status, reserved: value.reserved, message: value.message,
    };
  });

  const double = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from (
      select unit_id from allocations where released_at is null
      group by unit_id having count(*) > 1
    ) d
  `);
  const afterRows = await db.execute<{ available: number; reserved: number }>(sql`
    select
      count(*) filter (where status = 'AVAILABLE')::int as available,
      count(*) filter (where status = 'RESERVED')::int as reserved
    from blood_units where blood_group = 'AB_NEG'
  `);

  const result: RaceResult = {
    n,
    winners: rows.filter((r) => r.outcome === "WINNER").length,
    waitlisted: rows.filter((r) => r.outcome === "WAITLISTED").length,
    errors: rows.filter((r) => r.outcome === "ERROR").length,
    doubleAllocations: double.rows[0].n,
    elapsedMs,
    before: { availableAbNeg: before },
    after: { availableAbNeg: afterRows.rows[0].available, reservedAbNeg: afterRows.rows[0].reserved },
    rows,
  };

  await audit({
    actorId: actor.id, actorRole: actor.role, action: "race:run",
    resourceType: "concurrency_demo", resourceId: null, outcome: "ALLOWED", ip,
    after: {
      n, winners: result.winners, waitlisted: result.waitlisted,
      doubleAllocations: result.doubleAllocations, elapsedMs,
    },
  });

  return result;
}
