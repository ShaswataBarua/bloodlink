import { BLOOD_GROUPS, type BloodGroup } from "./blood";

/**
 * Red-cell compatibility: which donor groups a recipient can safely receive.
 * Source: standard ABO/Rh transfusion table (whole blood / red cell concentrate).
 */
export const RECIPIENT_ACCEPTS: Record<BloodGroup, readonly BloodGroup[]> = {
  O_NEG: ["O_NEG"],
  O_POS: ["O_NEG", "O_POS"],
  A_NEG: ["O_NEG", "A_NEG"],
  A_POS: ["O_NEG", "O_POS", "A_NEG", "A_POS"],
  B_NEG: ["O_NEG", "B_NEG"],
  B_POS: ["O_NEG", "O_POS", "B_NEG", "B_POS"],
  AB_NEG: ["O_NEG", "A_NEG", "B_NEG", "AB_NEG"],
  AB_POS: [...BLOOD_GROUPS],
};

export function isCompatible(donor: BloodGroup, recipient: BloodGroup): boolean {
  return RECIPIENT_ACCEPTS[recipient].includes(donor);
}

/**
 * Candidate groups in allocation priority order: the exact group first, then the
 * compatible groups. Within each group the database applies FEFO (earliest expiry first).
 */
export function candidateGroups(recipient: BloodGroup, exactOnly = false): BloodGroup[] {
  const compatible = RECIPIENT_ACCEPTS[recipient].filter((g) => g !== recipient);
  return exactOnly ? [recipient] : [recipient, ...compatible];
}
