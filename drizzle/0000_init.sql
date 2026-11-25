CREATE TYPE "public"."audit_outcome" AS ENUM('ALLOWED', 'DENIED');--> statement-breakpoint
CREATE TYPE "public"."blood_group" AS ENUM('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG');--> statement-breakpoint
CREATE TYPE "public"."component_type" AS ENUM('WHOLE_BLOOD', 'RED_CELLS');--> statement-breakpoint
CREATE TYPE "public"."donation_status" AS ENUM('COMPLETED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('PENDING', 'APPROVED', 'RESERVED', 'FULFILLED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'WAITLISTED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'BANK_STAFF', 'HOSPITAL', 'DONOR');--> statement-breakpoint
CREATE TYPE "public"."unit_status" AS ENUM('AVAILABLE', 'RESERVED', 'ISSUED', 'EXPIRED', 'DISCARDED');--> statement-breakpoint
CREATE TYPE "public"."urgency" AS ENUM('CRITICAL', 'URGENT', 'ROUTINE');--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" serial NOT NULL,
	"actor_id" uuid,
	"actor_role" "role",
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"outcome" "audit_outcome" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "audit_logs_seq_unique" UNIQUE("seq")
);
--> statement-breakpoint
CREATE TABLE "blood_banks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blood_banks_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "blood_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hospital_id" uuid NOT NULL,
	"requested_by_id" uuid NOT NULL,
	"patient_ref" text NOT NULL,
	"blood_group" "blood_group" NOT NULL,
	"units_requested" integer NOT NULL,
	"urgency" "urgency" NOT NULL,
	"status" "request_status" DEFAULT 'PENDING' NOT NULL,
	"status_reason" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blood_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blood_group" "blood_group" NOT NULL,
	"component_type" "component_type" DEFAULT 'RED_CELLS' NOT NULL,
	"bank_id" uuid NOT NULL,
	"donation_id" uuid,
	"collected_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "unit_status" DEFAULT 'AVAILABLE' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"donor_id" uuid NOT NULL,
	"bank_id" uuid NOT NULL,
	"volume_ml" integer NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"status" "donation_status" DEFAULT 'COMPLETED' NOT NULL,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "donors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"blood_group" "blood_group" NOT NULL,
	"dob" timestamp with time zone NOT NULL,
	"weight_kg" double precision NOT NULL,
	"phone" text NOT NULL,
	"last_donation_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "donors_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "hospitals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"daily_unit_cap" integer DEFAULT 20 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hospitals_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_json" jsonb NOT NULL,
	"status_code" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"hospital_id" uuid,
	"bank_id" uuid,
	"donor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_donor_id_unique" UNIQUE("donor_id")
);
--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_request_id_blood_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."blood_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_unit_id_blood_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."blood_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_requests" ADD CONSTRAINT "blood_requests_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_requests" ADD CONSTRAINT "blood_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_units" ADD CONSTRAINT "blood_units_bank_id_blood_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."blood_banks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_units" ADD CONSTRAINT "blood_units_donation_id_donations_id_fk" FOREIGN KEY ("donation_id") REFERENCES "public"."donations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donations" ADD CONSTRAINT "donations_bank_id_blood_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."blood_banks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_hospital_id_hospitals_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_bank_id_blood_banks_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."blood_banks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "allocations_unit_active_key" ON "allocations" USING btree ("unit_id") WHERE "allocations"."released_at" is null;--> statement-breakpoint
CREATE INDEX "allocations_request_idx" ON "allocations" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_outcome_created_idx" ON "audit_logs" USING btree ("outcome","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "requests_hospital_idem_key" ON "blood_requests" USING btree ("hospital_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "requests_status_urgency_created_idx" ON "blood_requests" USING btree ("status","urgency","created_at");--> statement-breakpoint
CREATE INDEX "requests_hospital_created_idx" ON "blood_requests" USING btree ("hospital_id","created_at");--> statement-breakpoint
CREATE INDEX "units_group_status_expiry_idx" ON "blood_units" USING btree ("blood_group","status","expires_at");--> statement-breakpoint
CREATE INDEX "units_bank_status_idx" ON "blood_units" USING btree ("bank_id","status");--> statement-breakpoint
CREATE INDEX "donations_donor_collected_idx" ON "donations" USING btree ("donor_id","collected_at");--> statement-breakpoint
CREATE INDEX "donations_bank_idx" ON "donations" USING btree ("bank_id");--> statement-breakpoint
CREATE INDEX "donors_blood_group_idx" ON "donors" USING btree ("blood_group");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_scope_key" ON "idempotency_records" USING btree ("scope","key");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");