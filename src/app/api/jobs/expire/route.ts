import { authorize } from "@/server/guard";
import { assertSameOrigin, clientIp, errorResponse } from "@/server/http";
import { expireUnits } from "@/services/inventory";

/** Expiry job. Idempotent, so it is safe to call from the dashboard or a cron. */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await authorize("inventory:write", {}, { ip: clientIp(req), resourceType: "blood_unit" });
    const result = await expireUnits();
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
