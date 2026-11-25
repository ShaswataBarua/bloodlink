import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, schema as s, type Db, type Tx } from "@/db";
import type { Role } from "./session";

export type AuditOutcome = "ALLOWED" | "DENIED";

export type AuditInput = {
  actorId?: string | null;
  actorRole?: Role | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: AuditOutcome;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
};

type Executor = Db | Tx;

/** JSON with sorted keys, so the hash survives Postgres jsonb key reordering. */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function computeAuditHash(input: AuditInput & { createdAt: Date }, prevHash: string): string {
  const payload = stableStringify([
    input.actorId ?? null,
    input.actorRole ?? null,
    input.action,
    input.resourceType,
    input.resourceId ?? null,
    input.outcome,
    input.before ?? null,
    input.after ?? null,
    input.ip ?? null,
    input.createdAt.toISOString(),
  ]);
  return createHash("sha256").update(`${prevHash}|${payload}`).digest("hex");
}

const CHAIN_LOCK_ID = 918_273_645;

/**
 * Appends one audit row inside the caller's transaction.
 * The advisory lock serialises appends so two concurrent writers cannot fork the chain.
 * The table itself rejects UPDATE/DELETE/TRUNCATE (see migration 0001).
 */
export async function appendAudit(exec: Executor, input: AuditInput): Promise<string> {
  await exec.execute(sql`select pg_advisory_xact_lock(${CHAIN_LOCK_ID})`);

  const last = await exec.execute<{ hash: string }>(
    sql`select hash from audit_logs order by seq desc limit 1`,
  );
  const prevHash = last.rows[0]?.hash ?? "GENESIS";
  const createdAt = new Date();
  const hash = computeAuditHash({ ...input, createdAt }, prevHash);

  await exec.insert(s.auditLogs).values({
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    outcome: input.outcome,
    before: (input.before ?? null) as never,
    after: (input.after ?? null) as never,
    ip: input.ip ?? null,
    createdAt,
    prevHash,
    hash,
  });

  return hash;
}

/** Standalone audit write (own transaction) for cases outside a business transaction. */
export async function audit(input: AuditInput): Promise<void> {
  await db.transaction((tx) => appendAudit(tx, input));
}

export type ChainVerification = {
  ok: boolean;
  checked: number;
  brokenAtSeq: number | null;
  reason: string | null;
};

/** Recomputes the whole chain and reports the first row that does not match. */
export function verifyChainRows(rows: Array<typeof s.auditLogs.$inferSelect>): ChainVerification {
  let prevHash = "GENESIS";

  for (const row of rows) {
    if (row.prevHash !== prevHash) {
      return { ok: false, checked: rows.length, brokenAtSeq: row.seq, reason: "prev_hash does not match the previous row" };
    }
    const expected = computeAuditHash(
      {
        actorId: row.actorId,
        actorRole: row.actorRole,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        outcome: row.outcome,
        before: row.before,
        after: row.after,
        ip: row.ip,
        createdAt: row.createdAt,
      },
      prevHash,
    );
    if (expected !== row.hash) {
      return { ok: false, checked: rows.length, brokenAtSeq: row.seq, reason: "row hash does not match its contents" };
    }
    prevHash = row.hash;
  }

  return { ok: true, checked: rows.length, brokenAtSeq: null, reason: null };
}

export async function verifyAuditChain(): Promise<ChainVerification> {
  const rows = await db.select().from(s.auditLogs).orderBy(s.auditLogs.seq);
  return verifyChainRows(rows);
}
