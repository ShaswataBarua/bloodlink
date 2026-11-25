import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { and, eq, gt } from "drizzle-orm";
import { db, schema as s } from "@/db";

export const SESSION_COOKIE = "bl_session";
/** Sessions are short-lived and DB-backed so they can be revoked instantly. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type Role = (typeof s.roleEnum.enumValues)[number];

export type Actor = {
  id: string;
  email: string;
  name: string;
  role: Role;
  hospitalId: string | null;
  bankId: string | null;
  donorId: string | null;
};

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates a session row and sets the httpOnly cookie. Route-handler/action context only. */
export async function createSession(userId: string, userAgent?: string | null): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(s.sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    userAgent: userAgent?.slice(0, 300) ?? null,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(s.sessions).where(eq(s.sessions.tokenHash, hashToken(token)));
  store.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await db.delete(s.sessions).where(eq(s.sessions.userId, userId));
}

/**
 * Resolves the signed-in user from the session cookie.
 * Cached per request so a page that reads it in several components hits the DB once.
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      id: s.users.id,
      email: s.users.email,
      name: s.users.name,
      role: s.users.role,
      hospitalId: s.users.hospitalId,
      bankId: s.users.bankId,
      donorId: s.users.donorId,
    })
    .from(s.sessions)
    .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
    .where(
      and(
        eq(s.sessions.tokenHash, hashToken(token)),
        gt(s.sessions.expiresAt, new Date()),
        eq(s.users.isActive, true),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
});
