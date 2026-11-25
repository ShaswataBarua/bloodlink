import { z } from "zod";
import { BLOOD_GROUPS } from "./blood";

export const bloodGroupSchema = z.enum(BLOOD_GROUPS);
export const urgencySchema = z.enum(["CRITICAL", "URGENT", "ROUTINE"]);

export const loginSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
});

/** Hospital creates a request. Strict: unknown fields (role, hospitalId, status…) are rejected. */
export const createRequestSchema = z.strictObject({
  patientRef: z.string().trim().min(3, "Patient reference is too short.").max(40),
  bloodGroup: bloodGroupSchema,
  unitsRequested: z.number().int().min(1, "Request at least 1 unit.").max(10, "At most 10 units per request."),
  urgency: urgencySchema,
});

export const transitionSchema = z.strictObject({
  action: z.enum(["approve", "reject", "reserve", "fulfil", "cancel"]),
  reason: z.string().trim().max(300).optional(),
});

export const donationSchema = z.strictObject({
  donorId: z.string().uuid("Select a donor."),
  volumeMl: z.number().int().min(300, "Volume must be 300-550 ml.").max(550, "Volume must be 300-550 ml."),
  collectedAt: z.coerce.date().optional(),
  bankId: z.string().uuid().optional(),
});

export const donorSchema = z.strictObject({
  fullName: z.string().trim().min(2).max(80),
  bloodGroup: bloodGroupSchema,
  dob: z.coerce.date(),
  weightKg: z.number().min(30).max(300),
  phone: z.string().trim().regex(/^[0-9+\-\s]{6,20}$/, "Enter a valid phone number."),
});

/** Profile self-service: name only. Role, email and ownership fields are not accepted at all. */
export const profileUpdateSchema = z.strictObject({
  name: z.string().trim().min(2, "Name is too short.").max(80),
});

export const unitStatusSchema = z.strictObject({
  status: z.enum(["AVAILABLE", "DISCARDED"]),
  reason: z.string().trim().max(200).optional(),
});

export const raceSchema = z.strictObject({
  n: z.number().int().min(2).max(50).default(10),
});

export const securityScenarioSchema = z.strictObject({
  scenario: z.enum([
    "idor",
    "privilege-escalation",
    "admin-endpoint",
    "tampered-session",
    "replay-idempotency",
    "audit-tamper",
  ]),
});

export const listQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  status: z.string().optional(),
  bloodGroup: z.string().optional(),
  bankId: z.string().uuid().optional(),
  hospitalId: z.string().uuid().optional(),
  expiringWithinDays: z.coerce.number().int().min(0).max(365).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.enum(["expiry_asc", "expiry_desc", "collected_desc", "created_desc", "urgency"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
