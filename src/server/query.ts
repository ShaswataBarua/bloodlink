import { listQuerySchema } from "@/domain/schemas";
import { HttpError } from "./http";

/** Reads list filters from the URL, dropping empty values so defaults apply. */
export function listQueryFromUrl(url: string) {
  const params = new URL(url).searchParams;
  const raw: Record<string, string> = {};
  for (const [key, value] of params) if (value !== "") raw[key] = value;
  return listQuerySchema.parse(raw);
}

export function pageParams(url: string, defaultSize = 20): { page: number; pageSize: number } {
  const params = new URL(url).searchParams;
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(params.get("pageSize") ?? defaultSize) || defaultSize));
  return { page, pageSize };
}

export function requireId(value: string | undefined): string {
  if (!value) throw new HttpError(400, "Missing identifier.", "BAD_REQUEST");
  return value;
}
