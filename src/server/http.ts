import { ZodError, type ZodType } from "zod";

/** Errors that are safe to show a user. Anything else becomes a generic 500. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "ERROR",
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: "Validation failed.",
        code: "VALIDATION",
        fields: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }
  // Never leak stack traces or SQL to the browser.
  console.error("[api] unhandled error", error);
  return Response.json(
    { error: "Something went wrong. Please try again.", code: "INTERNAL" },
    { status: 500 },
  );
}

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.", "BAD_JSON");
  }
  return schema.parse(body);
}

/**
 * CSRF defence for cookie-authenticated mutations: a browser always sends Origin on
 * cross-site POST/PATCH/DELETE, so a mismatch means the request came from another site.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser client (curl, tests); cookies are not auto-sent there
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "Blocked: invalid Origin header.", "CSRF");
  }
  if (!host || originHost !== host) {
    throw new HttpError(403, "Blocked: cross-origin request.", "CSRF");
  }
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
}

export function requireMethod(req: Request, method: string): void {
  if (req.method !== method) throw new HttpError(405, `Use ${method} for this endpoint.`, "METHOD");
}
