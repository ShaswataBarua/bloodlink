import { sql } from "drizzle-orm";
import {
  boolean, doublePrecision, index, integer, jsonb, pgEnum, pgTable, serial,
  text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------
export const roleEnum = pgEnum("role", ["ADMIN", "BANK_STAFF", "HOSPITAL", "DONOR"]);
export const bloodGroupEnum = pgEnum("blood_group", [
  "A_POS", "A_NEG", "B_POS", "B_NEG", "AB_POS", "AB_NEG", "O_POS", "O_NEG",
]);
export const componentEnum = pgEnum("component_type", ["WHOLE_BLOOD", "RED_CELLS"]);
export const donationStatusEnum = pgEnum("donation_status", ["COMPLETED", "REJECTED"]);
export const unitStatusEnum = pgEnum("unit_status", [
  "AVAILABLE", "RESERVED", "ISSUED", "EXPIRED", "DISCARDED",
]);
export const urgencyEnum = pgEnum("urgency", ["CRITICAL", "URGENT", "ROUTINE"]);
export const requestStatusEnum = pgEnum("request_status", [
  "PENDING", "APPROVED", "RESERVED", "FULFILLED", "REJECTED", "CANCELLED", "EXPIRED", "WAITLISTED",
]);
export const auditOutcomeEnum = pgEnum("audit_outcome", ["ALLOWED", "DENIED"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------- Organisations ----------
export const hospitals = pgTable("hospitals", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  city: text("city").notNull(),
  dailyUnitCap: integer("daily_unit_cap").notNull().default(20),
  createdAt: createdAt(),
});

export const bloodBanks = pgTable("blood_banks", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  city: text("city").notNull(),
  createdAt: createdAt(),
});

// ---------- People ----------
export const donors = pgTable(
  "donors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    bloodGroup: bloodGroupEnum("blood_group").notNull(),
    dob: timestamp("dob", { withTimezone: true, mode: "date" }).notNull(),
    weightKg: doublePrecision("weight_kg").notNull(),
    phone: text("phone").notNull().unique(),
    lastDonationAt: timestamp("last_donation_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("donors_blood_group_idx").on(t.bloodGroup)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    hospitalId: uuid("hospital_id").references(() => hospitals.id),
    bankId: uuid("bank_id").references(() => bloodBanks.id),
    donorId: uuid("donor_id").unique().references(() => donors.id),
    createdAt: createdAt(),
  },
  (t) => [index("users_role_idx").on(t.role)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

// ---------- Donations and stock ----------
export const donations = pgTable(
  "donations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    donorId: uuid("donor_id").notNull().references(() => donors.id),
    bankId: uuid("bank_id").notNull().references(() => bloodBanks.id),
    volumeMl: integer("volume_ml").notNull(),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
    status: donationStatusEnum("status").notNull().default("COMPLETED"),
    rejectReason: text("reject_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("donations_donor_collected_idx").on(t.donorId, t.collectedAt),
    index("donations_bank_idx").on(t.bankId),
  ],
);

export const bloodUnits = pgTable(
  "blood_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bloodGroup: bloodGroupEnum("blood_group").notNull(),
    componentType: componentEnum("component_type").notNull().default("RED_CELLS"),
    bankId: uuid("bank_id").notNull().references(() => bloodBanks.id),
    donationId: uuid("donation_id").references(() => donations.id),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: unitStatusEnum("status").notNull().default("AVAILABLE"),
    version: integer("version").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("units_group_status_expiry_idx").on(t.bloodGroup, t.status, t.expiresAt),
    index("units_bank_status_idx").on(t.bankId, t.status),
  ],
);

// ---------- Requests and allocation ----------
export const bloodRequests = pgTable(
  "blood_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hospitalId: uuid("hospital_id").notNull().references(() => hospitals.id),
    requestedById: uuid("requested_by_id").notNull().references(() => users.id),
    patientRef: text("patient_ref").notNull(),
    bloodGroup: bloodGroupEnum("blood_group").notNull(),
    unitsRequested: integer("units_requested").notNull(),
    urgency: urgencyEnum("urgency").notNull(),
    status: requestStatusEnum("status").notNull().default("PENDING"),
    statusReason: text("status_reason"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("requests_hospital_idem_key").on(t.hospitalId, t.idempotencyKey),
    index("requests_status_urgency_created_idx").on(t.status, t.urgency, t.createdAt),
    index("requests_hospital_created_idx").on(t.hospitalId, t.createdAt),
  ],
);

export const allocations = pgTable(
  "allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull().references(() => bloodRequests.id),
    unitId: uuid("unit_id").notNull().references(() => bloodUnits.id),
    allocatedAt: timestamp("allocated_at", { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (t) => [
    // A05: last line of defence. Even if app logic fails, one unit can have only ONE active allocation.
    uniqueIndex("allocations_unit_active_key").on(t.unitId).where(sql`${t.releasedAt} is null`),
    index("allocations_request_idx").on(t.requestId),
  ],
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseJson: jsonb("response_json").notNull(),
    statusCode: integer("status_code").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("idempotency_scope_key").on(t.scope, t.key)],
);

// ---------- Audit (append-only, hash-chained) ----------
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: serial("seq").notNull().unique(),
    actorId: uuid("actor_id"),
    actorRole: roleEnum("actor_role"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    outcome: auditOutcomeEnum("outcome").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    createdAt: createdAt(),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
  },
  (t) => [
    index("audit_actor_idx").on(t.actorId),
    index("audit_resource_idx").on(t.resourceType, t.resourceId),
    index("audit_outcome_created_idx").on(t.outcome, t.createdAt),
  ],
);
