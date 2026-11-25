import { describe, expect, it } from "vitest";
import { can, ownsResource, ruleFor, type Action } from "../src/server/policy";
import type { Actor } from "../src/server/session";

const HOSPITAL_A = "11111111-1111-1111-1111-111111111111";
const HOSPITAL_B = "22222222-2222-2222-2222-222222222222";
const BANK_A = "33333333-3333-3333-3333-333333333333";
const DONOR_A = "44444444-4444-4444-4444-444444444444";

const admin: Actor = { id: "a", email: "a@x", name: "Admin", role: "ADMIN", hospitalId: null, bankId: null, donorId: null };
const staff: Actor = { id: "s", email: "s@x", name: "Staff", role: "BANK_STAFF", hospitalId: null, bankId: BANK_A, donorId: null };
const hospitalA: Actor = { id: "h", email: "h@x", name: "Hosp A", role: "HOSPITAL", hospitalId: HOSPITAL_A, bankId: null, donorId: null };
const donor: Actor = { id: "d", email: "d@x", name: "Donor", role: "DONOR", hospitalId: null, bankId: null, donorId: DONOR_A };

describe("A03 policy matrix", () => {
  it("only administrators read the audit log", () => {
    expect(can(admin, "audit:read")).toBe(true);
    expect(can(staff, "audit:read")).toBe(false);
    expect(can(hospitalA, "audit:read")).toBe(false);
    expect(can(donor, "audit:read")).toBe(false);
  });

  it("hospital staff cannot create blood requests", () => {
    expect(can(hospitalA, "request:create")).toBe(true);
    expect(can(staff, "request:create")).toBe(false);
    expect(can(admin, "request:create")).toBe(false);
  });

  it("hospitals only read and cancel their own requests", () => {
    expect(can(hospitalA, "request:read", { hospitalId: HOSPITAL_A })).toBe(true);
    expect(can(hospitalA, "request:read", { hospitalId: HOSPITAL_B })).toBe(false);
    expect(can(hospitalA, "request:cancel", { hospitalId: HOSPITAL_A })).toBe(true);
    expect(can(hospitalA, "request:cancel", { hospitalId: HOSPITAL_B })).toBe(false);
  });

  it("bank staff write only their own bank's stock", () => {
    expect(can(staff, "inventory:write", { bankId: BANK_A })).toBe(true);
    expect(can(staff, "inventory:write", { bankId: HOSPITAL_A })).toBe(false);
    expect(can(staff, "donation:create", { bankId: BANK_A })).toBe(true);
    expect(can(staff, "donation:create", { bankId: "other" })).toBe(false);
  });

  it("donors read only their own record", () => {
    expect(can(donor, "donor:read", { donorId: DONOR_A })).toBe(true);
    expect(can(donor, "donor:read", { donorId: "other" })).toBe(false);
    expect(can(donor, "donor:write", { donorId: DONOR_A })).toBe(false);
  });

  it("hospitals cannot allocate or fulfil", () => {
    expect(can(hospitalA, "request:allocate")).toBe(false);
    expect(can(hospitalA, "request:fulfil")).toBe(false);
    expect(can(hospitalA, "request:approve")).toBe(false);
    expect(can(staff, "request:allocate")).toBe(true);
    expect(can(staff, "request:fulfil")).toBe(true);
  });

  it("admin ownership is never implied by tenant fields", () => {
    expect(ownsResource(admin, { hospitalId: HOSPITAL_A })).toBe(false);
    expect(ownsResource(staff, { bankId: BANK_A })).toBe(true);
  });

  it("every action has a rule for every role", () => {
    const actions: Action[] = ["audit:read", "request:create", "race:run", "security:run"];
    for (const action of actions) {
      for (const role of ["ADMIN", "BANK_STAFF", "HOSPITAL", "DONOR"] as const) {
        expect(["allow", "own", "deny"]).toContain(ruleFor(role, action));
      }
    }
  });
});
