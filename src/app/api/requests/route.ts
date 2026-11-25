import { createRequestSchema } from "@/domain/schemas";
import { authorize } from "@/server/guard";
import { assertSameOrigin, clientIp, errorResponse, readJson } from "@/server/http";
import { listQueryFromUrl } from "@/server/query";
import { createRequest, listRequests } from "@/services/requests";

export async function GET(req: Request) {
  try {
    const actor = await authorize("request:read");
    const query = listQueryFromUrl(req.url);
    const result = await listRequests(actor, query);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const actor = await authorize("request:create", {}, { ip: clientIp(req), resourceType: "blood_request" });
    const input = await readJson(req, createRequestSchema);
    const result = await createRequest(actor, input, req.headers.get("idempotency-key") ?? undefined, clientIp(req));
    return Response.json(result.body, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
