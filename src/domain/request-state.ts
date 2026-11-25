export const REQUEST_STATUSES = [
  "PENDING", "APPROVED", "RESERVED", "FULFILLED", "REJECTED", "CANCELLED", "EXPIRED", "WAITLISTED",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/**
 * The single source of truth for the request state machine.
 * Every status change in the app goes through canTransition().
 */
export const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  PENDING: ["APPROVED", "RESERVED", "REJECTED", "CANCELLED", "EXPIRED", "WAITLISTED"],
  APPROVED: ["RESERVED", "REJECTED", "CANCELLED", "EXPIRED", "WAITLISTED"],
  WAITLISTED: ["RESERVED", "REJECTED", "CANCELLED", "EXPIRED"],
  RESERVED: ["FULFILLED", "CANCELLED", "EXPIRED"],
  FULFILLED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function illegalTransitionMessage(from: RequestStatus, to: RequestStatus): string {
  return `Illegal status transition ${from} -> ${to}. Allowed from ${from}: ${
    TRANSITIONS[from].join(", ") || "none"
  }.`;
}

export const URGENCY_RANK: Record<"CRITICAL" | "URGENT" | "ROUTINE", number> = {
  CRITICAL: 0,
  URGENT: 1,
  ROUTINE: 2,
};
