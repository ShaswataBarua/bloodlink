import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool, schema as s } from "../src/db";
import { BLOOD_GROUPS, DAY_MS, SHELF_LIFE_DAYS, type BloodGroup } from "../src/domain/blood";

export const DEMO_PASSWORD = "Passw0rd!demo";

// Deterministic PRNG so the demo data is identical on every run.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261125);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)];
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const [bank1, bank2] = await db.insert(s.bloodBanks).values([
    { name: "Dhaka Central Blood Bank", city: "Dhaka" },
    { name: "Chattogram Regional Blood Bank", city: "Chattogram" },
  ]).returning();

  const [h1, h2, h3] = await db.insert(s.hospitals).values([
    { name: "Dhaka Medical College Hospital", city: "Dhaka", dailyUnitCap: 20 },
    { name: "Square Hospital", city: "Dhaka", dailyUnitCap: 12 },
    { name: "Chattogram Medical College Hospital", city: "Chattogram", dailyUnitCap: 15 },
  ]).returning();

  // ---- Donors (20). Several deliberately ineligible to demo the eligibility rules. ----
  const names = [
    "Rahim Uddin", "Nusrat Jahan", "Tanvir Hasan", "Farzana Akter", "Imran Hossain",
    "Sadia Islam", "Mahmudul Karim", "Tasnim Rahman", "Arif Chowdhury", "Mithila Das",
    "Rakib Sarker", "Jannatul Ferdous", "Shuvo Paul", "Nabila Khan", "Sabbir Ahmed",
    "Lamia Sultana", "Kawsar Mia", "Priya Barua", "Zahid Hasan", "Ayesha Siddika",
  ];
  const years = (n: number) => new Date(Date.now() - n * 365.25 * DAY_MS);
  const donorRows = names.map((fullName, i) => {
    let weightKg = 55 + Math.floor(rand() * 30);
    let dob = years(20 + Math.floor(rand() * 30));
    let lastDonationAt: Date | null = i % 3 === 0 ? null : daysAgo(100 + Math.floor(rand() * 200));
    if (i === 4) weightKg = 46;            // ineligible: underweight
    if (i === 5) lastDonationAt = daysAgo(30); // ineligible: donated 30 days ago
    if (i === 6) dob = years(62);          // ineligible: over 60
    return {
      fullName, bloodGroup: BLOOD_GROUPS[i % BLOOD_GROUPS.length] as BloodGroup, dob, weightKg,
      phone: `0171234${String(5601 + i)}`, lastDonationAt,
    };
  });
  const donors = await db.insert(s.donors).values(donorRows).returning();

  // ---- Users ----
  await db.insert(s.users).values([
    { email: "admin@bloodlink.test", passwordHash, role: "ADMIN", name: "System Admin" },
    { email: "staff.dhaka@bloodlink.test", passwordHash, role: "BANK_STAFF", name: "Dhaka Bank Staff", bankId: bank1.id },
    { email: "staff.ctg@bloodlink.test", passwordHash, role: "BANK_STAFF", name: "Chattogram Bank Staff", bankId: bank2.id },
    { email: "dmch@bloodlink.test", passwordHash, role: "HOSPITAL", name: "DMCH Blood Desk", hospitalId: h1.id },
    { email: "square@bloodlink.test", passwordHash, role: "HOSPITAL", name: "Square Blood Desk", hospitalId: h2.id },
    { email: "cmch@bloodlink.test", passwordHash, role: "HOSPITAL", name: "CMCH Blood Desk", hospitalId: h3.id },
    { email: "donor1@bloodlink.test", passwordHash, role: "DONOR", name: donors[0].fullName, donorId: donors[0].id },
    { email: "donor2@bloodlink.test", passwordHash, role: "DONOR", name: donors[1].fullName, donorId: donors[1].id },
  ]);
  const [hospitalUser1, hospitalUser2, hospitalUser3] = await Promise.all(
    ["dmch", "square", "cmch"].map((p) =>
      db.query.users.findFirst({ where: eq(s.users.email, `${p}@bloodlink.test`) }).then((u) => u!)),
  );

  // ---- Past donations for donors that have a lastDonationAt ----
  const donationRows = donors.filter((d) => d.lastDonationAt).map((d) => ({
    donorId: d.id, bankId: pick([bank1, bank2]).id, volumeMl: 450,
    collectedAt: d.lastDonationAt!, status: "COMPLETED" as const,
  }));
  const donationRecords = await db.insert(s.donations).values(donationRows).returning();

  // ---- ~120 units across all groups with varied expiry ----
  const counts: Record<BloodGroup, number> = {
    O_POS: 36, A_POS: 28, B_POS: 26, AB_POS: 10, O_NEG: 6, A_NEG: 6, B_NEG: 4, AB_NEG: 0,
  };
  type UnitIns = typeof s.bloodUnits.$inferInsert;
  const units: UnitIns[] = [];
  for (const g of BLOOD_GROUPS) {
    for (let i = 0; i < counts[g]; i++) {
      const age = Math.floor(rand() * 40); // 0..39 days old; >35 means already expired
      const collectedAt = daysAgo(age);
      const expiresAt = new Date(collectedAt.getTime() + SHELF_LIFE_DAYS * DAY_MS);
      units.push({
        bloodGroup: g, bankId: i % 3 === 0 ? bank2.id : bank1.id,
        donationId: i < donationRecords.length ? donationRecords[i % donationRecords.length].id : null,
        collectedAt, expiresAt, status: expiresAt < new Date() ? "EXPIRED" : "AVAILABLE",
      });
    }
  }
  // Race demo fixture: exactly ONE available AB- unit, plus one expired AB- unit that must never be allocated.
  units.push({
    bloodGroup: "AB_NEG", bankId: bank1.id, collectedAt: daysAgo(10),
    expiresAt: new Date(daysAgo(10).getTime() + SHELF_LIFE_DAYS * DAY_MS), status: "AVAILABLE",
  });
  units.push({
    bloodGroup: "AB_NEG", bankId: bank1.id, collectedAt: daysAgo(40),
    expiresAt: new Date(daysAgo(40).getTime() + SHELF_LIFE_DAYS * DAY_MS), status: "EXPIRED",
  });
  // Near-expiry units for FEFO / dashboard demo (expire within 1-3 days).
  for (const d of [1, 2, 3]) {
    units.push({
      bloodGroup: "O_POS", bankId: bank1.id, collectedAt: daysAgo(SHELF_LIFE_DAYS - d),
      expiresAt: new Date(Date.now() + d * DAY_MS), status: "AVAILABLE",
    });
  }
  const unitRecords = await db.insert(s.bloodUnits).values(units).returning();

  // ---- Requests in every state, with consistent allocations ----
  const take = (group: BloodGroup, n: number) => {
    const found = unitRecords.filter(
      (u) => u.bloodGroup === group && u.status === "AVAILABLE" && !used.has(u.id),
    ).sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime()).slice(0, n);
    found.forEach((u) => used.add(u.id));
    return found;
  };
  const used = new Set<string>();

  type Fixture = {
    key: string; hospital: typeof h1; user: typeof hospitalUser1; patient: string;
    group: BloodGroup; units: number; urgency: "CRITICAL" | "URGENT" | "ROUTINE";
    status: typeof s.bloodRequests.$inferInsert["status"]; reason?: string; allocate?: "RESERVED" | "ISSUED";
  };
  const fixtures: Fixture[] = [
    { key: "seed-1", hospital: h1, user: hospitalUser1, patient: "DMCH-PT-1001", group: "O_POS", units: 2, urgency: "ROUTINE", status: "PENDING" },
    { key: "seed-2", hospital: h2, user: hospitalUser2, patient: "SQ-PT-2001", group: "A_POS", units: 1, urgency: "URGENT", status: "APPROVED" },
    { key: "seed-3", hospital: h1, user: hospitalUser1, patient: "DMCH-PT-1002", group: "B_POS", units: 2, urgency: "CRITICAL", status: "RESERVED", allocate: "RESERVED" },
    { key: "seed-4", hospital: h3, user: hospitalUser3, patient: "CM-PT-3001", group: "O_POS", units: 3, urgency: "URGENT", status: "FULFILLED", allocate: "ISSUED" },
    { key: "seed-5", hospital: h2, user: hospitalUser2, patient: "SQ-PT-2002", group: "AB_POS", units: 2, urgency: "ROUTINE", status: "REJECTED", reason: "Hospital daily unit limit would be exceeded" },
    { key: "seed-6", hospital: h1, user: hospitalUser1, patient: "DMCH-PT-1003", group: "A_POS", units: 1, urgency: "ROUTINE", status: "CANCELLED", reason: "Cancelled by requester" },
    { key: "seed-7", hospital: h3, user: hospitalUser3, patient: "CM-PT-3002", group: "B_POS", units: 1, urgency: "ROUTINE", status: "EXPIRED", reason: "Not fulfilled within 48 hours" },
    { key: "seed-8", hospital: h1, user: hospitalUser1, patient: "DMCH-PT-1004", group: "B_NEG", units: 12, urgency: "CRITICAL", status: "WAITLISTED", reason: "Insufficient compatible stock" },
  ];
  for (const f of fixtures) {
    const [req] = await db.insert(s.bloodRequests).values({
      hospitalId: f.hospital.id, requestedById: f.user.id, patientRef: f.patient, bloodGroup: f.group,
      unitsRequested: f.units, urgency: f.urgency, status: f.status, statusReason: f.reason ?? null,
      idempotencyKey: f.key, createdAt: daysAgo(f.status === "FULFILLED" ? 3 : 0),
    }).returning();
    if (f.allocate) {
      for (const u of take(f.group, f.units)) {
        await db.insert(s.allocations).values({ requestId: req.id, unitId: u.id });
        await db.update(s.bloodUnits).set({ status: f.allocate }).where(eq(s.bloodUnits.id, u.id));
      }
    }
  }

  const [{ n }] = await db.select({ n: (await import("drizzle-orm")).sql<number>`count(*)::int` }).from(s.bloodUnits);
  console.log(`seeded: 2 banks, 3 hospitals, ${donors.length} donors, ${n} units, ${fixtures.length} requests`);
  console.log(`demo password for every account: ${DEMO_PASSWORD}`);
}

main().then(() => pool.end()).catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
