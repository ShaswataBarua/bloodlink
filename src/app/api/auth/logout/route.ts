import { audit } from "@/server/audit";
import { assertSameOrigin, clientIp, errorResponse } from "@/server/http";
import { destroySession, getActor } from "@/server/session";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const actor = await getActor();
    await destroySession();
    if (actor) {
      await audit({
        actorId: actor.id, actorRole: actor.role, action: "auth:logout",
        resourceType: "session", resourceId: null, outcome: "ALLOWED", ip: clientIp(req),
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
