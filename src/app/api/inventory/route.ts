import { authorize } from "@/server/guard";
import { errorResponse } from "@/server/http";
import { listQueryFromUrl } from "@/server/query";
import { listUnits } from "@/services/inventory";

export async function GET(req: Request) {
  try {
    const actor = await authorize("inventory:read");
    const query = listQueryFromUrl(req.url);
    const result = await listUnits(actor, query);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
