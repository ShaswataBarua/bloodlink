import { DAY_MS } from "./blood";

export type DonorForEligibility = {
  dob: Date;
  weightKg: number;
  lastDonationAt: Date | null;
};

export type EligibilityResult = {
  eligible: boolean;
  /** Every failed rule, with the reason a staff member can act on. Empty when eligible. */
  reasons: string[];
  age: number;
};

export const MIN_AGE = 18;
export const MAX_AGE = 60;
export const MIN_WEIGHT_KG = 50;
export const MIN_DAYS_BETWEEN_DONATIONS = 90;

export function ageInYears(dob: Date, now: Date): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** The four product rules, each returning its own exact reason. */
export function checkDonorEligibility(
  donor: DonorForEligibility,
  now = new Date(),
  opts: { donatedToday?: boolean } = {},
): EligibilityResult {
  const reasons: string[] = [];
  const age = ageInYears(donor.dob, now);

  if (age < MIN_AGE) reasons.push(`Donor is ${age} years old; minimum age is ${MIN_AGE}.`);
  if (age > MAX_AGE) reasons.push(`Donor is ${age} years old; maximum age is ${MAX_AGE}.`);
  if (donor.weightKg < MIN_WEIGHT_KG)
    reasons.push(`Donor weighs ${donor.weightKg} kg; minimum is ${MIN_WEIGHT_KG} kg.`);

  if (donor.lastDonationAt) {
    const days = Math.floor((now.getTime() - donor.lastDonationAt.getTime()) / DAY_MS);
    if (days < MIN_DAYS_BETWEEN_DONATIONS)
      reasons.push(
        `Last donation was ${days} day(s) ago; at least ${MIN_DAYS_BETWEEN_DONATIONS} days are required.`,
      );
  }

  // "Not already donating today" — a second same-day donation is always refused.
  const donatedToday = opts.donatedToday ?? (donor.lastDonationAt ? sameUtcDay(donor.lastDonationAt, now) : false);
  if (donatedToday) reasons.push("Donor has already donated today.");

  return { eligible: reasons.length === 0, reasons, age };
}
