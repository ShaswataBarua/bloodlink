import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: typeof import("../src/db").db;
let pool: typeof import("../src/db").pool;
let s: typeof import("../src/db").schema;
let appendAudit: typeof import("../src/server/audit").appendAudit;
let verifyAuditChain: typeof import("../src/server/audit").verifyAuditChain;
let verifyChainRows: typeof import("../src/server/audit").verifyChainRows;

beforeAll(async () => {
  ({ db, pool, schema: s } = await import("../src/db"));
  ({ appendAudit, verifyAuditChain, verifyChainRows } = await import("../src/server/audit"));
});
afterAll(async () => { await pool.end(); });

describe("A03 hash-chained audit log", () => {
  it("links each row to the previous hash and verifies the whole chain", async () => {
    await db.transaction((tx) =>
      appendAudit(tx, { action: "test:first", resourceType: "test", resourceId: "1", outcome: "ALLOWED" }),
    );
    await db.transaction((tx) =>
      appendAudit(tx, { action: "test:second", resourceType: "test", resourceId: "2", outcome: "DENIED", after: { note: "x" } }),
    );

    const rows = await db.select().from(s.auditLogs).orderBy(s.auditLogs.seq);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[rows.length - 1].prevHash).toBe(rows[rows.length - 2].hash);

    const result = await verifyAuditChain();
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(rows.length);
  });

  it("detects a row whose contents no longer match its hash", async () => {
    const rows = await db.select().from(s.auditLogs).orderBy(s.auditLogs.seq);
    const last = rows[rows.length - 1];
    const tampered = [...rows.slice(0, -1), { ...last, action: "tampered:action" }];
    const result = verifyChainRows(tampered);
    expect(result.ok).toBe(false);
    expect(result.brokenAtSeq).toBe(last.seq);
  });

  it("detects a broken prev_hash link", async () => {
    const rows = await db.select().from(s.auditLogs).orderBy(s.auditLogs.seq);
    const last = rows[rows.length - 1];
    const tampered = [...rows.slice(0, -1), { ...last, prevHash: "not-the-previous-hash" }];
    const result = verifyChainRows(tampered);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("prev_hash");
  });

  it("serialises concurrent appends without forking the chain", async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        db.transaction((tx) =>
          appendAudit(tx, { action: "test:concurrent", resourceType: "test", resourceId: String(index), outcome: "ALLOWED" }),
        ),
      ),
    );
    const result = await verifyAuditChain();
    expect(result.ok).toBe(true);
  });
});
