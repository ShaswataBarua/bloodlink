import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

// next/headers is only available inside a Next.js request. A tiny in-memory cookie
// store lets the real session code run unchanged.
const { cookieStore } = vi.hoisted(() => ({ cookieStore: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => { cookieStore.set(name, value); },
    delete: (name: string) => { cookieStore.delete(name); },
  }),
}));

let db: typeof import("../src/db").db;
let pool: typeof import("../src/db").pool;
let s: typeof import("../src/db").schema;
let auth: typeof import("../src/server/auth");
let session: typeof import("../src/server/session");
let rateLimit: typeof import("../src/server/rate-limit");

const PASSWORD = "CorrectHorse1";
const tag = Math.random().toString(36).slice(2, 8);

async function makeUser(email: string, overrides: Partial<typeof s.users.$inferInsert> = {}) {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const [user] = await db.insert(s.users).values({
    email, passwordHash, role: "HOSPITAL", name: `User ${email}`, ...overrides,
  }).returning();
  return user;
}

beforeAll(async () => {
  ({ db, pool, schema: s } = await import("../src/db"));
  auth = await import("../src/server/auth");
  session = await import("../src/server/session");
  rateLimit = await import("../src/server/rate-limit");
});
beforeEach(() => {
  cookieStore.clear();
  rateLimit.resetRateLimits();
});
afterAll(async () => { await pool.end(); });

describe("M03 authentication and sessions", () => {
  it("signs in, stores only the token hash, and resolves the actor", async () => {
    const user = await makeUser(`login-${tag}@test.local`);
    const actor = await auth.login(user.email, PASSWORD, { ip: "10.0.0.1" });
    expect(actor.id).toBe(user.id);

    const token = cookieStore.get("bl_session");
    expect(token).toBeTruthy();

    const sessions = await db.select().from(s.sessions);
    const stored = sessions.find((sessionRow) => sessionRow.userId === user.id);
    expect(stored).toBeDefined();
    expect(stored!.tokenHash).not.toBe(token);
    expect(stored!.tokenHash).toBe(session.hashToken(token!));

    const resolved = await session.getActor();
    expect(resolved?.id).toBe(user.id);
  });

  it("returns a generic error for a wrong password and counts the failure", async () => {
    const user = await makeUser(`wrong-${tag}@test.local`);
    await expect(auth.login(user.email, "WrongPassword1", { ip: "10.0.0.2" }))
      .rejects.toMatchObject({ status: 401, message: "Invalid email or password." });

    const [updated] = await db.select().from(s.users).where(eq(s.users.id, user.id));
    expect(updated.failedLogins).toBe(1);
  });

  it("locks the account after five failures", async () => {
    const user = await makeUser(`lock-${tag}@test.local`);
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(auth.login(user.email, "WrongPassword1", { ip: "10.0.0.3" })).rejects.toBeTruthy();
    }
    await expect(auth.login(user.email, PASSWORD, { ip: "10.0.0.3" }))
      .rejects.toMatchObject({ status: 423 });

    const [updated] = await db.select().from(s.users).where(eq(s.users.id, user.id));
    expect(updated.lockedUntil).not.toBeNull();
  });

  it("refuses inactive accounts without revealing why", async () => {
    const user = await makeUser(`inactive-${tag}@test.local`, { isActive: false });
    await expect(auth.login(user.email, PASSWORD, { ip: "10.0.0.4" }))
      .rejects.toMatchObject({ status: 401, message: "Invalid email or password." });
  });

  it("revokes the session on logout", async () => {
    const user = await makeUser(`logout-${tag}@test.local`);
    await auth.login(user.email, PASSWORD, { ip: "10.0.0.5" });
    expect(await session.getActor()).not.toBeNull();

    await session.destroySession();
    expect(await session.getActor()).toBeNull();

    const remaining = await db.select().from(s.sessions).where(eq(s.sessions.userId, user.id));
    expect(remaining).toHaveLength(0);
  });

  it("rate-limits repeated login attempts from one address", async () => {
    const user = await makeUser(`rate-${tag}@test.local`);
    for (let attempt = 0; attempt < 20; attempt++) {
      rateLimit.rateLimit(`login:ip:10.0.0.9`, 20, 60_000);
    }
    await expect(auth.login(user.email, PASSWORD, { ip: "10.0.0.9" }))
      .rejects.toMatchObject({ status: 429 });
  });
});
