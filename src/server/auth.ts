import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { DAY_MS } from "@/domain/blood";
import { checkDonorEligibility } from "@/domain/eligibility";
import { audit } from "./audit";
import { HttpError } from "./http";
import { rateLimit } from "./rate-limit";
import { createSession, type Actor, type Role } from "./session";

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
const GENERIC_LOGIN_ERROR = "Invalid email or password.";

const actorColumns = {
  id: s.users.id,
  email: s.users.email,
  name: s.users.name,
  role: s.users.role,
  hospitalId: s.users.hospitalId,
  bankId: s.users.bankId,
  donorId: s.users.donorId,
};

export async function login(
  email: string,
  password: string,
  meta: { ip: string; userAgent?: string | null },
): Promise<Actor> {
  // Two layers: a cheap per-IP window and a per-account window.
  const ipLimit = rateLimit(`login:ip:${meta.ip}`, 20, 5 * 60_000);
  const emailLimit = rateLimit(`login:email:${email}`, 10, 5 * 60_000);
  if (!ipLimit.ok || !emailLimit.ok) {
    await audit({
      action: "auth:login", resourceType: "session", resourceId: null, outcome: "DENIED", ip: meta.ip,
      after: { reason: "rate limited" },
    });
    throw new HttpError(
      429,
      `Too many login attempts. Try again in ${Math.max(ipLimit.retryAfterSec, emailLimit.retryAfterSec)} seconds.`,
      "RATE_LIMITED",
    );
  }

  const [user] = await db.select().from(s.users).where(eq(s.users.email, email)).limit(1);

  if (!user || !user.isActive) {
    await audit({
      actorId: user?.id ?? null, actorRole: user?.role ?? null,
      action: "auth:login", resourceType: "user", resourceId: user?.id ?? null,
      outcome: "DENIED", ip: meta.ip, after: { reason: user ? "inactive account" : "unknown email" },
    });
    throw new HttpError(401, GENERIC_LOGIN_ERROR, "INVALID_CREDENTIALS");
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    await audit({
      actorId: user.id, actorRole: user.role, action: "auth:login",
      resourceType: "user", resourceId: user.id, outcome: "DENIED", ip: meta.ip,
      after: { reason: "account locked", minutesRemaining: minutes },
    });
    throw new HttpError(423, `Account locked after repeated failures. Try again in ${minutes} minute(s).`, "LOCKED");
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);

  if (!passwordOk) {
    const failedLogins = user.failedLogins + 1;
    const shouldLock = failedLogins >= MAX_FAILED_LOGINS;
    await db
      .update(s.users)
      .set({
        failedLogins: shouldLock ? 0 : failedLogins,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MS) : null,
      })
      .where(eq(s.users.id, user.id));

    await audit({
      actorId: user.id, actorRole: user.role, action: "auth:login",
      resourceType: "user", resourceId: user.id, outcome: "DENIED", ip: meta.ip,
      after: { reason: "bad password", failedLogins, locked: shouldLock },
    });
    throw new HttpError(401, GENERIC_LOGIN_ERROR, "INVALID_CREDENTIALS");
  }

  await db
    .update(s.users)
    .set({ failedLogins: 0, lockedUntil: null })
    .where(eq(s.users.id, user.id));
  await createSession(user.id, meta.userAgent);

  await audit({
    actorId: user.id, actorRole: user.role, action: "auth:login",
    resourceType: "user", resourceId: user.id, outcome: "ALLOWED", ip: meta.ip,
  });

  return {
    id: user.id, email: user.email, name: user.name, role: user.role,
    hospitalId: user.hospitalId, bankId: user.bankId, donorId: user.donorId,
  };
}

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  bloodGroup: (typeof s.bloodGroupEnum.enumValues)[number];
  dob: Date;
  weightKg: number;
  phone: string;
};

/** Donor self-registration. Staff accounts are provisioned by an admin, never self-served. */
export async function registerDonor(input: RegisterInput, meta: { ip: string; userAgent?: string | null }): Promise<Actor> {
  const ipLimit = rateLimit(`register:ip:${meta.ip}`, 5, 60 * 60_000);
  if (!ipLimit.ok) throw new HttpError(429, "Too many registrations from this address.", "RATE_LIMITED");

  const [existingUser] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, input.email)).limit(1);
  if (existingUser) throw new HttpError(409, "An account with this email already exists.", "DUPLICATE_EMAIL");

  const eligibility = checkDonorEligibility({ dob: input.dob, weightKg: input.weightKg, lastDonationAt: null });
  if (!eligibility.eligible) {
    throw new HttpError(422, eligibility.reasons.join(" "), "DONOR_INELIGIBLE");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const actor = await db.transaction(async (tx) => {
    const [donor] = await tx
      .insert(s.donors)
      .values({
        fullName: input.name, bloodGroup: input.bloodGroup, dob: input.dob,
        weightKg: input.weightKg, phone: input.phone,
      })
      .returning();

    const [user] = await tx
      .insert(s.users)
      .values({
        email: input.email, passwordHash, role: "DONOR", name: input.name, donorId: donor.id,
      })
      .returning();

    return { user, donor };
  }).catch((error: unknown) => {
    // Unique phone/email raced with another registration.
    const message = (error as { cause?: { code?: string }; code?: string }).cause?.code ?? (error as { code?: string }).code;
    if (message === "23505") throw new HttpError(409, "A donor with this phone number already exists.", "DUPLICATE_PHONE");
    throw error;
  });

  await createSession(actor.user.id, meta.userAgent);
  await audit({
    actorId: actor.user.id, actorRole: "DONOR", action: "auth:register",
    resourceType: "user", resourceId: actor.user.id, outcome: "ALLOWED", ip: meta.ip,
  });

  return {
    id: actor.user.id, email: actor.user.email, name: actor.user.name, role: "DONOR",
    hospitalId: null, bankId: null, donorId: actor.donor.id,
  };
}

export function roleHome(role: Role): string {
  switch (role) {
    case "DONOR": return "/me";
    default: return "/";
  }
}

export const SESSION_DAYS = DAY_MS;
