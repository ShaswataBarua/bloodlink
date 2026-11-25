import { describe, expect, it } from "vitest";
import { candidateGroups, isCompatible, RECIPIENT_ACCEPTS } from "../src/domain/compatibility";
import { checkDonorEligibility } from "../src/domain/eligibility";
import { canTransition, illegalTransitionMessage } from "../src/domain/request-state";
import { BLOOD_GROUPS, type BloodGroup } from "../src/domain/blood";

const NOW = new Date("2026-06-15T12:00:00Z");
const yearsAgo = (n: number) => new Date(NOW.getTime() - n * 365.25 * 86_400_000);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("M04 donor eligibility", () => {
  const base = { dob: yearsAgo(30), weightKg: 70, lastDonationAt: null };

  it("accepts a healthy donor", () => {
    expect(checkDonorEligibility(base, NOW)).toEqual({ eligible: true, reasons: [], age: 30 });
  });

  it("rejects under 18 with the exact reason", () => {
    const result = checkDonorEligibility({ ...base, dob: yearsAgo(17) }, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("minimum age is 18");
  });

  it("rejects over 60 with the exact reason", () => {
    const result = checkDonorEligibility({ ...base, dob: yearsAgo(61) }, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("maximum age is 60");
  });

  it("rejects under 50 kg", () => {
    const result = checkDonorEligibility({ ...base, weightKg: 49.9 }, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("minimum is 50 kg");
  });

  it("rejects a donation inside the 90-day interval", () => {
    const result = checkDonorEligibility({ ...base, lastDonationAt: daysAgo(89) }, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("at least 90 days");
  });

  it("accepts exactly 90 days", () => {
    expect(checkDonorEligibility({ ...base, lastDonationAt: daysAgo(90) }, NOW).eligible).toBe(true);
  });

  it("rejects a second donation on the same day", () => {
    const result = checkDonorEligibility({ ...base, lastDonationAt: daysAgo(0) }, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain("Donor has already donated today.");
  });

  it("collects every failed rule at once", () => {
    const result = checkDonorEligibility({ dob: yearsAgo(70), weightKg: 40, lastDonationAt: daysAgo(10) }, NOW);
    expect(result.reasons).toHaveLength(3);
  });
});

describe("M04 ABO/Rh compatibility", () => {
  it("O- is the universal red-cell donor", () => {
    for (const recipient of BLOOD_GROUPS) expect(isCompatible("O_NEG", recipient)).toBe(true);
  });

  it("AB+ is the universal recipient", () => {
    for (const donor of BLOOD_GROUPS) expect(isCompatible(donor, "AB_POS")).toBe(true);
  });

  it("A+ cannot receive B or AB red cells", () => {
    expect(isCompatible("B_POS", "A_POS")).toBe(false);
    expect(isCompatible("AB_POS", "A_POS")).toBe(false);
    expect(isCompatible("A_POS", "A_POS")).toBe(true);
    expect(isCompatible("O_POS", "A_POS")).toBe(true);
  });

  it("Rh-negative recipients never receive Rh-positive cells", () => {
    for (const donor of BLOOD_GROUPS) {
      if (donor.endsWith("_POS")) expect(isCompatible(donor, "A_NEG")).toBe(false);
    }
  });

  it("every recipient accepts its own group", () => {
    for (const group of BLOOD_GROUPS) expect(RECIPIENT_ACCEPTS[group]).toContain(group);
  });

  it("puts the exact group first, then compatible groups", () => {
    const order = candidateGroups("A_POS");
    expect(order[0]).toBe("A_POS");
    expect(order.slice(1).every((group: BloodGroup) => isCompatible(group, "A_POS"))).toBe(true);
    expect(candidateGroups("AB_NEG", true)).toEqual(["AB_NEG"]);
  });
});

describe("M04 request state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("PENDING", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "RESERVED")).toBe(true);
    expect(canTransition("RESERVED", "FULFILLED")).toBe(true);
  });

  it("allows waitlisting and recovery from it", () => {
    expect(canTransition("PENDING", "WAITLISTED")).toBe(true);
    expect(canTransition("WAITLISTED", "RESERVED")).toBe(true);
  });

  it("rejects skipping steps and terminal-state changes", () => {
    expect(canTransition("PENDING", "FULFILLED")).toBe(false);
    expect(canTransition("FULFILLED", "CANCELLED")).toBe(false);
    expect(canTransition("REJECTED", "APPROVED")).toBe(false);
    expect(canTransition("CANCELLED", "RESERVED")).toBe(false);
  });

  it("explains an illegal transition", () => {
    expect(illegalTransitionMessage("FULFILLED", "CANCELLED")).toContain("Allowed from FULFILLED: none");
  });
});
