import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { Actor } from "@/server/session";
import { inventorySummary, type InventorySummary } from "./inventory";

export type DashboardData = {
  stock: InventorySummary["byGroup"];
  totals: {
    available: number;
    reserved: number;
    expiring7d: number;
    expired: number;
    donors: number;
    eligibleDonors: number;
  };
  requests: {
    open: number;
    waitlisted: number;
    fulfilled: number;
    fulfilmentRate: number;
    avgFulfilmentMinutes: number | null;
  };
  expiringUnits: Array<{ id: string; bloodGroup: string; bankName: string; expiresAt: Date }>;
  recentRequests: Array<{
    id: string; patientRef: string; bloodGroup: string; unitsRequested: number;
    urgency: string; status: string; hospitalName: string; createdAt: Date;
  }>;
};

export async function getDashboard(actor: Actor): Promise<DashboardData> {
  const hospitalId = actor.role === "HOSPITAL" ? actor.hospitalId : null;
  const scope = hospitalId ? sql`and hospital_id = ${hospitalId}` : sql``;

  const [stock, totalsRow, requestRow, expiring, recent] = await Promise.all([
    inventorySummary(),
    db.execute<{
      available: number; reserved: number; expiring7d: number; expired: number;
      donors: number; eligible_donors: number;
    }>(sql`
      select
        (select count(*)::int from blood_units where status = 'AVAILABLE') as available,
        (select count(*)::int from blood_units where status = 'RESERVED') as reserved,
        (select count(*)::int from blood_units where status = 'AVAILABLE' and expires_at <= now() + interval '7 days') as expiring7d,
        (select count(*)::int from blood_units where status = 'EXPIRED') as expired,
        (select count(*)::int from donors) as donors,
        (select count(*)::int from donors d
          where date_part('year', age(d.dob)) between 18 and 60
            and d.weight_kg >= 50
            and (d.last_donation_at is null or d.last_donation_at < now() - interval '90 days')
        ) as eligible_donors
    `),
    db.execute<{ open: number; waitlisted: number; fulfilled: number; terminal: number; avg_minutes: number | null }>(sql`
      select
        count(*) filter (where status in ('PENDING','APPROVED','RESERVED'))::int as open,
        count(*) filter (where status = 'WAITLISTED')::int as waitlisted,
        count(*) filter (where status = 'FULFILLED')::int as fulfilled,
        count(*) filter (where status in ('FULFILLED','REJECTED','CANCELLED','EXPIRED'))::int as terminal,
        avg(extract(epoch from (updated_at - created_at)) / 60) filter (where status = 'FULFILLED') as avg_minutes
      from blood_requests where true ${scope}
    `),
    db.execute<{ id: string; blood_group: string; bank_name: string; expires_at: Date }>(sql`
      select u.id, u.blood_group::text as blood_group, b.name as bank_name, u.expires_at
      from blood_units u join blood_banks b on b.id = u.bank_id
      where u.status = 'AVAILABLE' and u.expires_at <= now() + interval '7 days'
      order by u.expires_at asc limit 6
    `),
    db.execute<{
      id: string; patient_ref: string; blood_group: string; units_requested: number;
      urgency: string; status: string; hospital_name: string; created_at: Date;
    }>(sql`
      select r.id, r.patient_ref, r.blood_group::text as blood_group, r.units_requested,
             r.urgency::text as urgency, r.status::text as status, h.name as hospital_name, r.created_at
      from blood_requests r join hospitals h on h.id = r.hospital_id
      where true ${scope}
      order by r.created_at desc limit 8
    `),
  ]);

  const totals = totalsRow.rows[0];
  const requests = requestRow.rows[0];
  const rate = requests.terminal > 0 ? Math.round((requests.fulfilled / requests.terminal) * 100) : 0;

  return {
    stock: stock.byGroup,
    totals: {
      available: totals.available,
      reserved: totals.reserved,
      expiring7d: totals.expiring7d,
      expired: totals.expired,
      donors: totals.donors,
      eligibleDonors: totals.eligible_donors,
    },
    requests: {
      open: requests.open,
      waitlisted: requests.waitlisted,
      fulfilled: requests.fulfilled,
      fulfilmentRate: rate,
      avgFulfilmentMinutes: requests.avg_minutes === null ? null : Math.round(Number(requests.avg_minutes)),
    },
    expiringUnits: expiring.rows.map((r) => ({
      id: r.id, bloodGroup: r.blood_group, bankName: r.bank_name, expiresAt: r.expires_at,
    })),
    recentRequests: recent.rows.map((r) => ({
      id: r.id, patientRef: r.patient_ref, bloodGroup: r.blood_group,
      unitsRequested: r.units_requested, urgency: r.urgency, status: r.status,
      hospitalName: r.hospital_name, createdAt: r.created_at,
    })),
  };
}
