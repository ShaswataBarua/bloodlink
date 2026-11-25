import { authorize } from "@/server/guard";
import { clientIp, errorResponse } from "@/server/http";
import { getRequestDetail } from "@/services/requests";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await authorize("request:read", {}, { ip: clientIp(req), resourceType: "blood_request" });
    const { id } = await params;
    const detail = await getRequestDetail(actor, id, clientIp(req));
    return Response.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}
