import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

let db: typeof import("../src/db").db;
let pool: typeof import("../src/db").pool;
let s: typeof import("../src/db").schema;
/** Drizzle wraps driver errors; the real Postgres message lives in error.cause. */
async function pgError(p: Promise<unknown>): Promise<string> {
  try { await p; } catch (e) {
    const err = e as { message: string; cause?: { message?: string } };
    return err.cause?.message ?? err.message;
  }
  return "NO_ERROR";
}
let unitId: string, reqA: string, reqB: string;

beforeAll(async () => {
  ({ db, pool, schema: s } = await import("../src/db"));
  const [bank] = await db.insert(s.bloodBanks).values({ name: "T Bank", city: "Dhaka" }).returning();
  const [hosp] = await db.insert(s.hospitals).values({ name: "T Hospital", city: "Dhaka" }).returning();
  const [user] = await db.insert(s.users).values({
    email: "t@x.test", passwordHash: "x", role: "HOSPITAL", name: "T", hospitalId: hosp.id,
  }).returning();
  const now = new Date();
  const [unit] = await db.insert(s.bloodUnits).values({
    bloodGroup: "O_POS", bankId: bank.id, collectedAt: now, expiresAt: new Date(now.getTime() + 864e5 * 30),
  }).returning();
  unitId = unit.id;
  const mk = (k: string) => db.insert(s.bloodRequests).values({
    hospitalId: hosp.id, requestedById: user.id, patientRef: "P", bloodGroup: "O_POS",
    unitsRequested: 1, urgency: "URGENT", idempotencyKey: k,
  }).returning();
  reqA = (await mk("a"))[0].id;
  reqB = (await mk("b"))[0].id;
});
afterAll(async () => { await pool.end(); });

describe("A05: database prevents double allocation", () => {
  it("rejects a second ACTIVE allocation for the same unit", async () => {
    await db.insert(s.allocations).values({ requestId: reqA, unitId });
    await expect(db.insert(s.allocations).values({ requestId: reqB, unitId })).rejects.toThrow();
  });

  it("allows re-allocation once the first allocation is released", async () => {
    await db.update(s.allocations).set({ releasedAt: new Date() }).where(sql`unit_id = ${unitId}`);
    await expect(db.insert(s.allocations).values({ requestId: reqB, unitId })).resolves.toBeDefined();
  });
});

describe("A03: audit log is append-only at the database level", () => {
  it("accepts INSERT", async () => {
    const { appendAudit } = await import("../src/server/audit");
    await expect(
      db.transaction((tx) => appendAudit(tx, { action: "TEST", resourceType: "test", outcome: "ALLOWED" })),
    ).resolves.toBeTruthy();
  });
  it("rejects UPDATE", async () => {
    expect(await pgError(db.execute(sql`update audit_logs set action = 'tampered'`))).toMatch(/append-only/);
  });
  it("rejects DELETE", async () => {
    expect(await pgError(db.execute(sql`delete from audit_logs`))).toMatch(/append-only/);
  });
  it("rejects TRUNCATE", async () => {
    expect(await pgError(db.execute(sql`truncate audit_logs`))).toMatch(/append-only/);
  });
});

describe("M06: CHECK constraints reject invalid data", () => {
  it("rejects 0 units requested", async () => {
    await expect(db.execute(sql`update blood_requests set units_requested = 0`)).rejects.toThrow();
  });
  it("rejects a unit that expires before collection", async () => {
    await expect(db.execute(sql`update blood_units set expires_at = collected_at - interval '1 day'`)).rejects.toThrow();
  });
  it("rejects a duplicate idempotency key for the same hospital", async () => {
    await expect(db.execute(sql`update blood_requests set idempotency_key = 'a' where idempotency_key = 'b'`)).rejects.toThrow();
  });
});
