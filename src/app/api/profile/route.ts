import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { profileUpdateSchema } from "@/domain/schemas";
import { audit } from "@/server/audit";
import { authorizeOwn } from "@/server/guard";
import { assertSameOrigin, clientIp, errorResponse, readJson } from "@/server/http";

export async function PATCH(req: Request) {
  try {
    assertSameOrigin(req);
    const actor = await authorizeOwn("profile:update", { ip: clientIp(req), resourceType: "user", resourceId: null });
    // Strict schema: role, email, hospitalId, bankId and donorId are rejected, not silently dropped.
    const input = await readJson(req, profileUpdateSchema);

    await db.update(s.users).set({ name: input.name }).where(eq(s.users.id, actor.id));
    await audit({
      actorId: actor.id, actorRole: actor.role, action: "profile:update",
      resourceType: "user", resourceId: actor.id, outcome: "ALLOWED", ip: clientIp(req),
      before: { name: actor.name }, after: { name: input.name },
    });

    return Response.json({ id: actor.id, name: input.name });
  } catch (error) {
    return errorResponse(error);
  }
}
