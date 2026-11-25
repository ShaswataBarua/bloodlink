import { audit, verifyAuditChain } from "@/server/audit";
import { authorize } from "@/server/guard";
import { assertSameOrigin, clientIp, errorResponse } from "@/server/http";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const actor = await authorize("audit:verify", {}, { ip: clientIp(req), resourceType: "audit_log" });
    const result = await verifyAuditChain();
    await audit({
      actorId: actor.id, actorRole: actor.role, action: "audit:verify",
      resourceType: "audit_log", resourceId: null, outcome: "ALLOWED", ip: clientIp(req),
      after: { ok: result.ok, checked: result.checked, brokenAtSeq: result.brokenAtSeq },
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
