import { loginSchema } from "@/domain/schemas";
import { login } from "@/server/auth";
import { assertSameOrigin, clientIp, errorResponse, readJson } from "@/server/http";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const input = await readJson(req, loginSchema);
    const actor = await login(input.email, input.password, {
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    return Response.json({
      user: actor,
      redirectTo: actor.role === "DONOR" ? "/me" : "/",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
