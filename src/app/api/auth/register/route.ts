import { z } from "zod";
import { bloodGroupSchema } from "@/domain/schemas";
import { registerDonor } from "@/server/auth";
import { assertSameOrigin, clientIp, errorResponse, readJson } from "@/server/http";

const registerSchema = z.strictObject({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  bloodGroup: bloodGroupSchema,
  dob: z.coerce.date(),
  weightKg: z.number().min(30).max(300),
  phone: z.string().trim().regex(/^[0-9+\-\s]{6,20}$/, "Enter a valid phone number."),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const input = await readJson(req, registerSchema);
    const actor = await registerDonor(input, {
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
    return Response.json({ user: actor, redirectTo: "/me" }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
