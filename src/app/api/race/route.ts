import { raceSchema } from "@/domain/schemas";
import { authorize } from "@/server/guard";
import { assertSameOrigin, clientIp, errorResponse, readJson } from "@/server/http";
import { runRace } from "@/services/race";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const actor = await authorize("race:run", {}, { ip: clientIp(req), resourceType: "concurrency_demo" });
    const input = await readJson(req, raceSchema);
    const result = await runRace(actor, input.n, clientIp(req));
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
