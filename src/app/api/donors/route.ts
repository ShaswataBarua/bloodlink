import { donorSchema } from "@/domain/schemas";
import { authorize, authorizeOwn } from "@/server/guard";
import { assertSameOrigin, clientIp, errorResponse, readJson } from "@/server/http";
import { pageParams } from "@/server/query";
import { createDonor, listDonors } from "@/services/donations";

export async function GET(req: Request) {
  try {
    const actor = await authorizeOwn("donor:read", { ip: clientIp(req), resourceType: "donor" });
    const url = new URL(req.url);
    const { page, pageSize } = pageParams(req.url);
    const eligibility = url.searchParams.get("eligibility");
    const result = await listDonors(actor, {
      q: url.searchParams.get("q") ?? undefined,
      bloodGroup: url.searchParams.get("bloodGroup") ?? undefined,
      eligibility: eligibility === "eligible" || eligibility === "ineligible" ? eligibility : undefined,
      page,
      pageSize,
    });
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const actor = await authorize("donor:write", {}, { ip: clientIp(req), resourceType: "donor" });
    const input = await readJson(req, donorSchema);
    const result = await createDonor(actor, input, clientIp(req));
    return Response.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
