export const BLOOD_GROUPS = [
  "A_POS", "A_NEG", "B_POS", "B_NEG", "AB_POS", "AB_NEG", "O_POS", "O_NEG",
] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const BLOOD_GROUP_LABEL: Record<BloodGroup, string> = {
  A_POS: "A+", A_NEG: "A-", B_POS: "B+", B_NEG: "B-",
  AB_POS: "AB+", AB_NEG: "AB-", O_POS: "O+", O_NEG: "O-",
};

/** Red cell concentrate shelf life used to compute expiresAt. */
export const SHELF_LIFE_DAYS = 35;
export const DAY_MS = 24 * 60 * 60 * 1000;
