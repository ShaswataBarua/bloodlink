import { unitStatusSchema } from "@/domain/schemas";
import { authorize } from "@/server/guard";
import { assertSameOrigin, clientIp, errorResponse, readJson } from "@/server/http";
import { setUnitStatus } from "@/services/inventory";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const actor = await authorize("inventory:write", {}, { ip: clientIp(req), resourceType: "blood_unit" });
    const { id } = await params;
    const input = await readJson(req, unitStatusSchema);
    const result = await setUnitStatus(actor, id, input.status, input.reason, clientIp(req));
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
