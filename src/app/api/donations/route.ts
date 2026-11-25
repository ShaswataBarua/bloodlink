import { donationSchema } from "@/domain/schemas";
import { authorize } from "@/server/guard";
import { assertSameOrigin, clientIp, errorResponse, readJson } from "@/server/http";
import { recordDonation } from "@/services/donations";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const actor = await authorize("donation:create", {}, { ip: clientIp(req), resourceType: "donation" });
    const input = await readJson(req, donationSchema);
    const result = await recordDonation(actor, input, clientIp(req));
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
