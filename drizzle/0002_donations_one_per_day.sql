-- M06: a donor cannot donate twice on the same UTC day, even under a race.
-- The app locks the donor row too, but this index is the database-level guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS "donations_one_per_day"
  ON "donations" ("donor_id", ((("collected_at" AT TIME ZONE 'UTC'))::date));
--> statement-breakpoint

-- M05: audit log browsing is usually filtered by action.
CREATE INDEX IF NOT EXISTS "audit_action_seq_idx" ON "audit_logs" ("action", "seq" DESC);
