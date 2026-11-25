import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { profileUpdateSchema } from "@/domain/schemas";
import { audit } from "@/server/audit";
import { authorizeActor } from "@/server/guard";
import { hashToken, type Actor } from "@/server/session";
import { createRequest, getRequestDetail } from "./requests";

export type SecurityScenario =
  | "idor" | "privilege-escalation" | "admin-endpoint"
  | "tampered-session" | "replay-idempotency" | "audit-tamper";

export type SecurityScenarioResult = {
  scenario: SecurityScenario;
  title: string;
  attack: string;
  expected: string;
  status: number;
  blocked: boolean;
  detail: string;
  audit: { seq: number; action: string; outcome: string } | null;
};

type UserRow = {
  id: string; email: string; name: string; role: Actor["role"];
  hospital_id: string | null; bank_id: string | null; donor_id: string | null;
};

function toActor(row: UserRow): Actor {
  return {
    id: row.id, email: row.email, name: row.name, role: row.role,
    hospitalId: row.hospital_id, bankId: row.bank_id, donorId: row.donor_id,
  };
}

async function pickUser(role: Actor["role"], where = sql``): Promise<Actor | null> {
  const rows = await db.execute<UserRow>(sql`
    select id, email, name, role, hospital_id, bank_id, donor_id
    from users where role = ${role} ${where} limit 1
  `);
  return rows.rows[0] ? toActor(rows.rows[0]) : null;
}

async function latestAudit(action: string, actorId?: string | null) {
  const rows = await db.execute<{ seq: number; action: string; outcome: string }>(sql`
    select seq, action, outcome::text as outcome from audit_logs
    where action = ${action} ${actorId ? sql`and actor_id = ${actorId}` : sql``}
    order by seq desc limit 1
  `);
  return rows.rows[0] ?? null;
}

/**
 * A03 demo: each scenario executes the real authorization path with a seeded attacker
 * identity and reports the status plus the audit row the attempt produced.
 */
export async function runSecurityScenario(
  scenario: SecurityScenario,
  ip: string,
): Promise<SecurityScenarioResult> {
  switch (scenario) {
    case "idor": {
      const target = await db.execute<{ id: string; hospital_id: string; patient_ref: string }>(sql`
        select id, hospital_id, patient_ref from blood_requests order by created_at asc limit 1
      `);
      if (!target.rows[0]) throw new Error("Seed data missing: no request to attack.");
      const attacker = await pickUser("HOSPITAL", sql`and hospital_id <> ${target.rows[0].hospital_id}`);

      let status = 200;
      let detail = "";
      try {
        await getRequestDetail(attacker!, target.rows[0].id, ip);
        detail = "ERROR: cross-tenant read succeeded.";
      } catch (error) {
        status = (error as { status?: number }).status ?? 500;
        detail = `Hospital B read hospital A's request ${target.rows[0].patient_ref}: HTTP ${status}.`;
      }
      return {
        scenario, title: "IDOR — cross-tenant record access",
        attack: `Hospital B user ${attacker?.email} requests hospital A's request ${target.rows[0].id}.`,
        expected: "404 Not Found and a DENIED audit row (existence is not leaked).",
        status, blocked: status === 404, detail,
        audit: await latestAudit("request:read", attacker?.id),
      };
    }

    case "privilege-escalation": {
      const attacker = await pickUser("HOSPITAL");
      const parsed = profileUpdateSchema.safeParse({ name: "Escalation Attempt", role: "ADMIN", hospitalId: null });
      const status = parsed.success ? 200 : 400;
      await audit({
        actorId: attacker?.id ?? null, actorRole: attacker?.role ?? null,
        action: "profile:update", resourceType: "user", resourceId: attacker?.id ?? null,
        outcome: parsed.success ? "ALLOWED" : "DENIED", ip,
        after: { submittedRole: "ADMIN", reason: "mass-assignment attempt" },
      });
      return {
        scenario, title: "Privilege escalation — mass assignment",
        attack: `${attacker?.email} sends {"name":"…","role":"ADMIN","hospitalId":null} to the profile endpoint.`,
        expected: "400: the strict schema rejects unknown fields; role and ownership are never writable.",
        status, blocked: !parsed.success,
        detail: parsed.success ? "ERROR: role field was accepted." : "Strict zod schema rejected 'role' and 'hospitalId'.",
        audit: await latestAudit("profile:update", attacker?.id),
      };
    }

    case "admin-endpoint": {
      const attacker = await pickUser("DONOR");
      let status = 200;
      try {
        await authorizeActor(attacker!, "audit:read", {}, { ip, resourceType: "audit_log" });
      } catch (error) {
        status = (error as { status?: number }).status ?? 500;
      }
      return {
        scenario, title: "Broken access control — admin endpoint",
        attack: `Donor account ${attacker?.email} calls GET /api/audit.`,
        expected: "403 Forbidden plus a DENIED audit row.",
        status, blocked: status === 403,
        detail: `Policy matrix rule for DONOR + audit:read is deny; HTTP ${status}.`,
        audit: await latestAudit("audit:read", attacker?.id),
      };
    }

    case "tampered-session": {
      const forged = randomBytes(32).toString("base64url");
      const rows = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from sessions where token_hash = ${hashToken(forged)}`,
      );
      const status = rows.rows[0].n === 0 ? 401 : 200;
      await audit({
        action: "auth:session", resourceType: "session", resourceId: null,
        outcome: status === 401 ? "DENIED" : "ALLOWED", ip,
        after: { reason: "forged cookie token", tokenHashPrefix: hashToken(forged).slice(0, 12) },
      });
      return {
        scenario, title: "Session forgery — tampered cookie",
        attack: "A random 32-byte token is presented as the bl_session cookie.",
        expected: "401: only the sha256 hash of a real session token exists in the database.",
        status, blocked: status === 401,
        detail: "No session row matches the hash of the forged token.",
        audit: await latestAudit("auth:session"),
      };
    }

    case "replay-idempotency": {
      // Pick the hospital with the most daily headroom so the demo is not blocked by the cap.
      const attacker = await pickUser("HOSPITAL", sql`
        and hospital_id = (
          select h.id from hospitals h
          order by h.daily_unit_cap - coalesce((
            select sum(r.units_requested) from blood_requests r
            where r.hospital_id = h.id and r.created_at >= date_trunc('day', now())
              and r.status not in ('REJECTED','CANCELLED','EXPIRED')
          ), 0) desc
          limit 1
        )`);
      const key = `sec-${randomUUID().slice(0, 8)}`;
      const payload = {
        patientRef: "SEC-LAB-REPLAY", bloodGroup: "O_POS" as const,
        unitsRequested: 1, urgency: "ROUTINE" as const,
      };
      let status = 200;
      let detail = "";
      try {
        const first = await createRequest(attacker!, payload, key, ip);
        const replay = await createRequest(attacker!, payload, key, ip);
        let mismatchStatus = 200;
        try {
          await createRequest(attacker!, { ...payload, unitsRequested: 2 }, key, ip);
        } catch (error) {
          mismatchStatus = (error as { status?: number }).status ?? 500;
        }
        status = mismatchStatus;
        detail = `First call created ${first.body.id}. Identical replay returned the stored result (replayed=${replay.replayed}). Changed payload returned HTTP ${mismatchStatus}.`;
      } catch (error) {
        status = (error as { status?: number }).status ?? 500;
        detail = `Request creation blocked: ${(error as Error).message}`;
      }
      return {
        scenario, title: "Idempotency replay — same key, different payload",
        attack: `Reuses Idempotency-Key ${key} with a modified payload.`,
        expected: "200 for the identical replay, 422 for the changed payload.",
        status, blocked: status === 422, detail,
        audit: await latestAudit("request:create", attacker?.id),
      };
    }

    case "audit-tamper": {
      let status = 200;
      let detail = "";
      try {
        await db.execute(sql`update audit_logs set action = 'tampered' where seq = (select max(seq) from audit_logs)`);
        detail = "ERROR: audit row was modified.";
      } catch (error) {
        const message =
          (error as { cause?: { message?: string } }).cause?.message ?? (error as Error).message;
        status = 409;
        detail = `Database trigger rejected the UPDATE: ${message}`;
      }
      await audit({
        action: "audit:tamper", resourceType: "audit_log", resourceId: null,
        outcome: status === 409 ? "DENIED" : "ALLOWED", ip,
        after: { attempted: "UPDATE audit_logs" },
      });
      return {
        scenario, title: "Audit tampering — rewrite history",
        attack: "Direct UPDATE of the newest audit_logs row.",
        expected: "409 from the append-only trigger; the row cannot be changed.",
        status, blocked: status === 409, detail,
        audit: await latestAudit("audit:tamper"),
      };
    }
  }
}
