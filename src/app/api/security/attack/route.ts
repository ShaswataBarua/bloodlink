import { securityScenarioSchema } from "@/domain/schemas";
import { authorize } from "@/server/guard";
import { assertSameOrigin, clientIp, errorResponse, readJson } from "@/server/http";
import { runSecurityScenario } from "@/services/security";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await authorize("security:run", {}, { ip: clientIp(req), resourceType: "security_lab" });
    const input = await readJson(req, securityScenarioSchema);
    const result = await runSecurityScenario(input.scenario, clientIp(req));
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
