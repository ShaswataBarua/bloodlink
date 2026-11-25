import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { DAY_MS, SHELF_LIFE_DAYS } from "@/domain/blood";
import { checkDonorEligibility } from "@/domain/eligibility";
import type { donorSchema, donationSchema } from "@/domain/schemas";
import type { z } from "zod";
import { appendAudit, audit } from "@/server/audit";
import { authorize, denyAsNotFound } from "@/server/guard";
import { HttpError } from "@/server/http";
import { can } from "@/server/policy";
import type { Actor } from "@/server/session";
import { processWaitlist } from "./requests";

export type DonorRow = {
  id: string;
  fullName: string;
  bloodGroup: string;
  dob: Date;
  weightKg: number;
  phone: string;
  lastDonationAt: Date | null;
  eligible: boolean;
  ineligibleReasons: string[];
  donations: number;
};

export async function listDonors(
  actor: Actor,
  query: { q?: string; bloodGroup?: string; eligibility?: "eligible" | "ineligible"; page: number; pageSize: number },
): Promise<{ rows: DonorRow[]; total: number; page: number; pageSize: number }> {
  const conditions = [];
  // A donor only ever sees their own record, whatever the query says.
  if (actor.role === "DONOR") {
    conditions.push(eq(s.donors.id, actor.donorId ?? "00000000-0000-0000-0000-000000000000"));
  }
  if (query.q) {
    conditions.push(
      sql`(${s.donors.fullName} ilike ${`%${query.q}%`} or ${s.donors.phone} ilike ${`%${query.q}%`})`,
    );
  }
  if (query.bloodGroup) conditions.push(sql`${s.donors.bloodGroup}::text = ${query.bloodGroup}`);

  const where = conditions.length ? and(...conditions) : undefined;

  const [countRow] = await db.select({ n: sql<number>`count(*)::int` }).from(s.donors).where(where);

  const rows = await db
    .select({
      id: s.donors.id,
      fullName: s.donors.fullName,
      bloodGroup: sql<string>`${s.donors.bloodGroup}::text`,
      dob: s.donors.dob,
      weightKg: s.donors.weightKg,
      phone: s.donors.phone,
      lastDonationAt: s.donors.lastDonationAt,
      donations: sql<number>`(select count(*)::int from donations d where d.donor_id = ${s.donors.id})`,
    })
    .from(s.donors)
    .where(where)
    .orderBy(asc(s.donors.fullName))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const now = new Date();
  let mapped: DonorRow[] = rows.map((row) => {
    const eligibility = checkDonorEligibility(row, now);
    return { ...row, eligible: eligibility.eligible, ineligibleReasons: eligibility.reasons };
  });

  // Eligibility is computed from live data, so this filter is applied after evaluation.
  if (query.eligibility) {
    mapped = mapped.filter((d) => (query.eligibility === "eligible" ? d.eligible : !d.eligible));
  }

  return { rows: mapped, total: countRow.n, page: query.page, pageSize: query.pageSize };
}

export type DonorHistoryRow = {
  id: string;
  collectedAt: Date;
  volumeMl: number;
  status: string;
  bankName: string;
};

export async function getDonor(actor: Actor, donorId: string, ip?: string): Promise<DonorRow & { history: DonorHistoryRow[] }> {
  if (actor.role === "DONOR" && actor.donorId !== donorId) {
    await denyAsNotFound(actor, "donor:read", { donorId }, { ip, resourceType: "donor", resourceId: donorId });
  }

  const [row] = await db
    .select({
      id: s.donors.id,
      fullName: s.donors.fullName,
      bloodGroup: sql<string>`${s.donors.bloodGroup}::text`,
      dob: s.donors.dob,
      weightKg: s.donors.weightKg,
      phone: s.donors.phone,
      lastDonationAt: s.donors.lastDonationAt,
      donations: sql<number>`(select count(*)::int from donations d where d.donor_id = ${s.donors.id})`,
    })
    .from(s.donors)
    .where(eq(s.donors.id, donorId))
    .limit(1);

  if (!row) throw new HttpError(404, "Donor not found.", "NOT_FOUND");
  const eligibility = checkDonorEligibility(row, new Date());

  const history = await db
    .select({
      id: s.donations.id,
      collectedAt: s.donations.collectedAt,
      volumeMl: s.donations.volumeMl,
      status: sql<string>`${s.donations.status}::text`,
      bankName: s.bloodBanks.name,
    })
    .from(s.donations)
    .innerJoin(s.bloodBanks, eq(s.bloodBanks.id, s.donations.bankId))
    .where(eq(s.donations.donorId, donorId))
    .orderBy(desc(s.donations.collectedAt));

  await audit({
    actorId: actor.id, actorRole: actor.role, action: "donor:read",
    resourceType: "donor", resourceId: donorId, outcome: "ALLOWED", ip,
  });

  return {
    ...row,
    eligible: eligibility.eligible,
    ineligibleReasons: eligibility.reasons,
    history,
  };
}

export type DonationInput = z.infer<typeof donationSchema>;

export async function recordDonation(
  actor: Actor,
  input: DonationInput,
  ip?: string,
): Promise<{ donationId: string; unitId: string; waitlistReserved: number }> {
  const bankId = actor.role === "ADMIN" ? input.bankId : actor.bankId;
  if (!bankId) throw new HttpError(400, "Select the blood bank that collected the donation.", "BANK_REQUIRED");
  if (!can(actor, "donation:create", { bankId })) {
    throw new HttpError(403, "You can only record donations for your own blood bank.", "FORBIDDEN");
  }

  const collectedAt = input.collectedAt ?? new Date();
  if (collectedAt.getTime() > Date.now() + 60_000) {
    throw new HttpError(400, "Collection time cannot be in the future.", "FUTURE_DATE");
  }

  const created = await db.transaction(async (tx) => {
    // Lock the donor: serialises same-donor donations so the 90-day rule cannot be raced.
    const donorRows = await tx.execute<{
      id: string; dob: Date; weight_kg: number; last_donation_at: Date | null; blood_group: string;
    }>(sql`select id, dob, weight_kg, last_donation_at, blood_group from donors where id = ${input.donorId} for update`);
    const donor = donorRows.rows[0];
    if (!donor) throw new HttpError(404, "Donor not found.", "NOT_FOUND");

    const sameDay = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from donations
      where donor_id = ${input.donorId}
        and collected_at >= date_trunc('day', ${collectedAt}::timestamptz)
        and collected_at < date_trunc('day', ${collectedAt}::timestamptz) + interval '1 day'
    `);

    const eligibility = checkDonorEligibility(
      { dob: donor.dob, weightKg: donor.weight_kg, lastDonationAt: donor.last_donation_at },
      collectedAt,
      { donatedToday: sameDay.rows[0].n > 0 },
    );

    if (!eligibility.eligible) {
      await appendAudit(tx, {
        actorId: actor.id, actorRole: actor.role, action: "donation:create",
        resourceType: "donor", resourceId: input.donorId, outcome: "DENIED", ip,
        after: { reasons: eligibility.reasons },
      });
      throw new HttpError(422, eligibility.reasons.join(" "), "DONOR_INELIGIBLE");
    }

    const [donation] = await tx
      .insert(s.donations)
      .values({
        donorId: input.donorId,
        bankId,
        volumeMl: input.volumeMl,
        collectedAt,
        status: "COMPLETED",
      })
      .returning();

    const [unit] = await tx
      .insert(s.bloodUnits)
      .values({
        bloodGroup: donor.blood_group as never,
        componentType: "RED_CELLS",
        bankId,
        donationId: donation.id,
        collectedAt,
        expiresAt: new Date(collectedAt.getTime() + SHELF_LIFE_DAYS * DAY_MS),
        status: "AVAILABLE",
      })
      .returning();

    await tx.update(s.donors).set({ lastDonationAt: collectedAt }).where(eq(s.donors.id, input.donorId));

    await appendAudit(tx, {
      actorId: actor.id, actorRole: actor.role, action: "donation:create",
      resourceType: "donation", resourceId: donation.id, outcome: "ALLOWED", ip,
      after: { donorId: input.donorId, bankId, unitId: unit.id, volumeMl: input.volumeMl },
    });

    return { donationId: donation.id, unitId: unit.id };
  });

  // New stock may satisfy someone on the waitlist.
  const waitlist = await processWaitlist();
  return { ...created, waitlistReserved: waitlist.reserved };
}

export type DonorInput = z.infer<typeof donorSchema>;

export async function createDonor(actor: Actor, input: DonorInput, ip?: string): Promise<{ id: string }> {
  await authorize("donor:write", {}, { ip, resourceType: "donor" });
  const eligibility = checkDonorEligibility(
    { dob: input.dob, weightKg: input.weightKg, lastDonationAt: null },
    new Date(),
  );

  const [donor] = await db
    .insert(s.donors)
    .values({
      fullName: input.fullName,
      bloodGroup: input.bloodGroup,
      dob: input.dob,
      weightKg: input.weightKg,
      phone: input.phone,
    })
    .returning();

  await appendAudit(db, {
    actorId: actor.id, actorRole: actor.role, action: "donor:write",
    resourceType: "donor", resourceId: donor.id, outcome: "ALLOWED", ip,
    after: { fullName: donor.fullName, bloodGroup: donor.bloodGroup, eligibleAtCreation: eligibility.eligible },
  });

  return { id: donor.id };
}
