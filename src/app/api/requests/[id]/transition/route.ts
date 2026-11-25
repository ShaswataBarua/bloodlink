import { transitionSchema } from "@/domain/schemas";
import { authorize, authorizeOwn } from "@/server/guard";
import { assertSameOrigin, clientIp, errorResponse, readJson } from "@/server/http";
import { transitionRequest } from "@/services/requests";

const ACTION_PERMISSION = {
  approve: "request:approve",
  reject: "request:reject",
  reserve: "request:allocate",
  fulfil: "request:fulfil",
} as const;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const input = await readJson(req, transitionSchema);
    const meta = { ip: clientIp(req), resourceType: "blood_request" };
    // Cancel is ownership-scoped; the service re-checks the target request's hospital.
    const actor =
      input.action === "cancel"
        ? await authorizeOwn("request:cancel", meta)
        : await authorize(ACTION_PERMISSION[input.action], {}, meta);

    const { id } = await params;
    const result = await transitionRequest(actor, id, input, clientIp(req));
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
