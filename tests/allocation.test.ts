import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Actor } from "../src/server/session";

let db: typeof import("../src/db").db;
let pool: typeof import("../src/db").pool;
let s: typeof import("../src/db").schema;
let requests: typeof import("../src/services/requests");

const DAY = 86_400_000;
const tag = Math.random().toString(36).slice(2, 8);
let counter = 0;

type World = {
  bankId: string;
  hospitalId: string;
  otherHospitalId: string;
  staff: Actor;
  hospital: Actor;
  otherHospital: Actor;
};

async function makeWorld(dailyUnitCap = 20): Promise<World> {
  const suffix = `${tag}-${++counter}`;
  const [bank] = await db.insert(s.bloodBanks).values({ name: `Bank ${suffix}`, city: "Dhaka" }).returning();
  const [hospital] = await db.insert(s.hospitals).values({ name: `Hosp ${suffix}`, city: "Dhaka", dailyUnitCap }).returning();
  const [otherHospital] = await db.insert(s.hospitals).values({ name: `Other ${suffix}`, city: "Dhaka" }).returning();
  const passwordHash = "x";

  const [staffUser] = await db.insert(s.users).values({
    email: `staff-${suffix}@test.local`, passwordHash, role: "BANK_STAFF", name: "Staff", bankId: bank.id,
  }).returning();
  const [hospitalUser] = await db.insert(s.users).values({
    email: `hosp-${suffix}@test.local`, passwordHash, role: "HOSPITAL", name: "Hosp", hospitalId: hospital.id,
  }).returning();
  const [otherUser] = await db.insert(s.users).values({
    email: `other-${suffix}@test.local`, passwordHash, role: "HOSPITAL", name: "Other", hospitalId: otherHospital.id,
  }).returning();

  return {
    bankId: bank.id,
    hospitalId: hospital.id,
    otherHospitalId: otherHospital.id,
    staff: { id: staffUser.id, email: staffUser.email, name: "Staff", role: "BANK_STAFF", hospitalId: null, bankId: bank.id, donorId: null },
    hospital: { id: hospitalUser.id, email: hospitalUser.email, name: "Hosp", role: "HOSPITAL", hospitalId: hospital.id, bankId: null, donorId: null },
    otherHospital: { id: otherUser.id, email: otherUser.email, name: "Other", role: "HOSPITAL", hospitalId: otherHospital.id, bankId: null, donorId: null },
  };
}

async function addUnit(bankId: string, bloodGroup: string, expiresInDays: number, status: "AVAILABLE" | "EXPIRED" = "AVAILABLE") {
  const collectedAt = new Date(Date.now() - Math.max(1, 35 - expiresInDays) * DAY);
  const [unit] = await db.insert(s.bloodUnits).values({
    bloodGroup: bloodGroup as never,
    bankId,
    collectedAt,
    expiresAt: new Date(Date.now() + expiresInDays * DAY),
    status,
  }).returning();
  return unit;
}

async function addRequest(world: World, bloodGroup: string, unitsRequested = 1, urgency: "CRITICAL" | "URGENT" | "ROUTINE" = "URGENT") {
  const [request] = await db.insert(s.bloodRequests).values({
    hospitalId: world.hospitalId,
    requestedById: world.hospital.id,
    patientRef: `T-${tag}-${++counter}`,
    bloodGroup: bloodGroup as never,
    unitsRequested,
    urgency,
    idempotencyKey: `key-${tag}-${counter}`,
  }).returning();
  return request;
}

beforeAll(async () => {
  ({ db, pool, schema: s } = await import("../src/db"));
  requests = await import("../src/services/requests");
});

// Each test starts from an empty stock/request slate, so cross-test leftovers cannot
// satisfy a request (allocation deliberately searches every bank, not just one).
beforeEach(async () => {
  await db.execute(sql`delete from allocations`);
  await db.execute(sql`delete from blood_units`);
  await db.execute(sql`delete from blood_requests`);
});
afterAll(async () => { await pool.end(); });

describe("M04/A05 reservation and allocation", () => {
  it("reserves the requested units and writes one allocation per unit", async () => {
    const world = await makeWorld();
    await addUnit(world.bankId, "O_POS", 20);
    await addUnit(world.bankId, "O_POS", 25);
    const request = await addRequest(world, "O_POS", 2);

    const result = await requests.reserveRequest(world.staff, request.id);
    expect(result.status).toBe("RESERVED");
    expect(result.reserved).toBe(2);

    const allocations = await db.select().from(s.allocations).where(eq(s.allocations.requestId, request.id));
    expect(allocations).toHaveLength(2);

    const units = await db.select().from(s.bloodUnits).where(sql`${s.bloodUnits.id} in (
      select unit_id from allocations where request_id = ${request.id}
    )`);
    expect(units.every((unit) => unit.status === "RESERVED")).toBe(true);
  });

  it("uses FEFO inside the exact group", async () => {
    const world = await makeWorld();
    const later = await addUnit(world.bankId, "O_POS", 30);
    const sooner = await addUnit(world.bankId, "O_POS", 4);
    const request = await addRequest(world, "O_POS", 1);

    const result = await requests.reserveRequest(world.staff, request.id);
    expect(result.unitIds).toEqual([sooner.id]);
    expect(result.unitIds).not.toContain(later.id);
  });

  it("prefers the exact group over a compatible group", async () => {
    const world = await makeWorld();
    const compatible = await addUnit(world.bankId, "O_NEG", 2);
    const exact = await addUnit(world.bankId, "A_POS", 20);
    const request = await addRequest(world, "A_POS", 1);

    const result = await requests.reserveRequest(world.staff, request.id);
    expect(result.unitIds).toEqual([exact.id]);
    expect(result.unitIds).not.toContain(compatible.id);
  });

  it("falls back to a compatible group when the exact group is empty", async () => {
    const world = await makeWorld();
    await addUnit(world.bankId, "B_POS", 20); // incompatible with A_POS
    const compatible = await addUnit(world.bankId, "O_NEG", 20);
    const request = await addRequest(world, "A_POS", 1);

    const result = await requests.reserveRequest(world.staff, request.id);
    expect(result.unitIds).toEqual([compatible.id]);
  });

  it("never allocates an expired unit and waitlists instead", async () => {
    const world = await makeWorld();
    await addUnit(world.bankId, "B_NEG", -1, "AVAILABLE"); // past expiry, still marked available
    const request = await addRequest(world, "B_NEG", 1);

    const result = await requests.reserveRequest(world.staff, request.id);
    expect(result.status).toBe("WAITLISTED");
    expect(result.unitIds).toHaveLength(0);
  });

  it("marks units ISSUED and fulfils a reserved request", async () => {
    const world = await makeWorld();
    await addUnit(world.bankId, "A_NEG", 20);
    const request = await addRequest(world, "A_NEG", 1);
    await requests.reserveRequest(world.staff, request.id);

    const fulfilled = await requests.transitionRequest(world.staff, request.id, { action: "fulfil" });
    expect(fulfilled.status).toBe("FULFILLED");

    const allocations = await db.select().from(s.allocations).where(eq(s.allocations.requestId, request.id));
    const [unit] = await db.select().from(s.bloodUnits).where(eq(s.bloodUnits.id, allocations[0].unitId));
    expect(unit.status).toBe("ISSUED");
  });

  it("rejects an illegal transition with a clear error", async () => {
    const world = await makeWorld();
    await addUnit(world.bankId, "A_NEG", 20);
    const request = await addRequest(world, "A_NEG", 1);
    await requests.reserveRequest(world.staff, request.id);
    await requests.transitionRequest(world.staff, request.id, { action: "fulfil" });

    await expect(requests.transitionRequest(world.staff, request.id, { action: "approve" }))
      .rejects.toMatchObject({ status: 409, code: "INVALID_STATE" });
  });

  it("releases units when a request is cancelled", async () => {
    const world = await makeWorld();
    const unit = await addUnit(world.bankId, "A_NEG", 20);
    const request = await addRequest(world, "A_NEG", 1);
    await requests.reserveRequest(world.staff, request.id);

    await requests.transitionRequest(world.hospital, request.id, { action: "cancel", reason: "Patient transferred" });

    const [after] = await db.select().from(s.bloodUnits).where(eq(s.bloodUnits.id, unit.id));
    expect(after.status).toBe("AVAILABLE");
    const active = await db.select().from(s.allocations).where(eq(s.allocations.requestId, request.id));
    expect(active[0].releasedAt).not.toBeNull();
  });

  it("processes the waitlist when stock arrives", async () => {
    const world = await makeWorld();
    const request = await addRequest(world, "AB_NEG", 1, "CRITICAL");
    const first = await requests.reserveRequest(world.staff, request.id);
    expect(first.status).toBe("WAITLISTED");

    await addUnit(world.bankId, "AB_NEG", 20);
    await requests.processWaitlist();

    const [after] = await db.select().from(s.bloodRequests).where(eq(s.bloodRequests.id, request.id));
    expect(after.status).toBe("RESERVED");
  });
});

describe("M06 idempotency and validation", () => {
  it("returns the stored result for the same key and payload", async () => {
    const world = await makeWorld();
    const payload = { patientRef: "IDEM-1", bloodGroup: "O_POS" as const, unitsRequested: 1, urgency: "ROUTINE" as const };
    const first = await requests.createRequest(world.hospital, payload, "idem-key-1");
    const replay = await requests.createRequest(world.hospital, payload, "idem-key-1");
    expect(replay.replayed).toBe(true);
    expect(replay.body.id).toBe(first.body.id);
  });

  it("rejects the same key with a different payload", async () => {
    const world = await makeWorld();
    const payload = { patientRef: "IDEM-2", bloodGroup: "O_POS" as const, unitsRequested: 1, urgency: "ROUTINE" as const };
    await requests.createRequest(world.hospital, payload, "idem-key-2");
    await expect(requests.createRequest(world.hospital, { ...payload, unitsRequested: 2 }, "idem-key-2"))
      .rejects.toMatchObject({ status: 422, code: "IDEMPOTENCY_MISMATCH" });
  });

  it("rejects a request that would exceed the hospital's daily cap", async () => {
    const world = await makeWorld(2);
    const base = { bloodGroup: "O_POS" as const, unitsRequested: 2, urgency: "ROUTINE" as const };
    await requests.createRequest(world.hospital, { ...base, patientRef: "CAP-1" }, "cap-1");
    await expect(requests.createRequest(world.hospital, { ...base, patientRef: "CAP-2" }, "cap-2"))
      .rejects.toMatchObject({ status: 422, code: "DAILY_CAP" });
  });
});

describe("A03 tenant isolation", () => {
  it("returns 404 for another hospital's request and writes a DENIED audit row", async () => {
    const world = await makeWorld();
    const request = await addRequest(world, "O_POS", 1);

    await expect(requests.getRequestDetail(world.otherHospital, request.id))
      .rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });

    const denied = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from audit_logs
      where action = 'request:read' and outcome = 'DENIED' and actor_id = ${world.otherHospital.id}
    `);
    expect(denied.rows[0].n).toBe(1);
  });

  it("lets the owning hospital read its own request", async () => {
    const world = await makeWorld();
    const request = await addRequest(world, "O_POS", 1);
    const detail = await requests.getRequestDetail(world.hospital, request.id);
    expect(detail.request.id).toBe(request.id);
  });
});

describe("A05 concurrency: exactly one winner", () => {
  it("allocates the last unit exactly once across 10 concurrent reservations", async () => {
    const world = await makeWorld();
    await addUnit(world.bankId, "AB_POS", 20);
    const requestIds: string[] = [];
    for (let index = 0; index < 10; index++) {
      const request = await addRequest(world, "AB_POS", 1, "CRITICAL");
      requestIds.push(request.id);
    }

    const results = await Promise.allSettled(requestIds.map((id) => requests.reserveForRace(id, world.staff)));
    const winners = results.filter(
      (result) => result.status === "fulfilled" && result.value.reserved > 0,
    );
    expect(winners).toHaveLength(1);

    const double = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from (
        select unit_id from allocations where released_at is null group by unit_id having count(*) > 1
      ) d
    `);
    expect(double.rows[0].n).toBe(0);

    const reservedUnits = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from blood_units where blood_group = 'AB_POS' and status = 'RESERVED'
    `);
    expect(reservedUnits.rows[0].n).toBe(1);
  });

  it("never leaves two active allocations for one unit in the database", async () => {
    const world = await makeWorld();
    const unit = await addUnit(world.bankId, "O_NEG", 20);
    const first = await addRequest(world, "O_NEG", 1);
    const second = await addRequest(world, "O_NEG", 1);
    await requests.reserveForRace(first.id, world.staff);

    await expect(
      db.insert(s.allocations).values({ requestId: second.id, unitId: unit.id }),
    ).rejects.toThrow();
  });
});
