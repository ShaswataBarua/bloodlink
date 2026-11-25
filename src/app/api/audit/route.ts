import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { authorize } from "@/server/guard";
import { errorResponse } from "@/server/http";
import { pageParams } from "@/server/query";

export async function GET(req: Request) {
  try {
    await authorize("audit:read");
    const url = new URL(req.url);
    const { page, pageSize } = pageParams(req.url, 25);
    const action = url.searchParams.get("action");
    const outcome = url.searchParams.get("outcome");
    const resourceType = url.searchParams.get("resourceType");

    const conditions = [];
    if (action) conditions.push(eq(s.auditLogs.action, action));
    if (outcome === "ALLOWED" || outcome === "DENIED") conditions.push(eq(s.auditLogs.outcome, outcome));
    if (resourceType) conditions.push(eq(s.auditLogs.resourceType, resourceType));
    const where = conditions.length ? and(...conditions) : undefined;

    const [countRow] = await db.select({ n: sql<number>`count(*)::int` }).from(s.auditLogs).where(where);
    const rows = await db
      .select({
        id: s.auditLogs.id,
        seq: s.auditLogs.seq,
        actorId: s.auditLogs.actorId,
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

    return Response.json({ rows, total: countRow.n, page, pageSize });
  } catch (error) {
    return errorResponse(error);
  }
}
