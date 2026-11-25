-- CHECK constraints: data integrity enforced by the database, not only the app.
ALTER TABLE "blood_requests" ADD CONSTRAINT "requests_units_positive" CHECK ("units_requested" BETWEEN 1 AND 20);
ALTER TABLE "donations" ADD CONSTRAINT "donations_volume_range" CHECK ("volume_ml" BETWEEN 300 AND 550);
ALTER TABLE "donors" ADD CONSTRAINT "donors_weight_positive" CHECK ("weight_kg" > 0 AND "weight_kg" < 300);
ALTER TABLE "blood_units" ADD CONSTRAINT "units_expiry_after_collection" CHECK ("expires_at" > "collected_at");
ALTER TABLE "hospitals" ADD CONSTRAINT "hospitals_cap_positive" CHECK ("daily_unit_cap" > 0);
--> statement-breakpoint

-- A03: the audit log is append-only. UPDATE and DELETE are rejected at the database level,
-- so even a compromised application account cannot rewrite history.
CREATE OR REPLACE FUNCTION audit_logs_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not allowed', TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_mutation();
