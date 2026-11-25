import type { Actor, Role } from "./session";

/**
 * A03: ONE central permission matrix. Every route handler and server action calls
 * authorize()/can(); there are no ad-hoc role checks scattered through the app.
 *
 *   "allow" = role may perform the action on any resource
 *   "own"   = role may perform it only on resources it owns (tenant isolation)
 *   "deny"  = never
 */
export type Action =
  | "dashboard:read"
  | "inventory:read"
  | "inventory:write"
  | "donor:read"
  | "donor:write"
  | "donation:create"
  | "request:read"
  | "request:create"
  | "request:approve"
  | "request:reject"
  | "request:allocate"
  | "request:fulfil"
  | "request:cancel"
  | "audit:read"
  | "audit:verify"
  | "user:manage"
  | "race:run"
  | "security:run"
  | "profile:update";

type Rule = "allow" | "own" | "deny";

const MATRIX: Record<Action, Record<Role, Rule>> = {
  "dashboard:read":  { ADMIN: "allow", BANK_STAFF: "allow", HOSPITAL: "allow", DONOR: "allow" },
  "inventory:read":  { ADMIN: "allow", BANK_STAFF: "allow", HOSPITAL: "allow", DONOR: "deny" },
  "inventory:write": { ADMIN: "allow", BANK_STAFF: "own",   HOSPITAL: "deny",  DONOR: "deny" },
  "donor:read":      { ADMIN: "allow", BANK_STAFF: "allow", HOSPITAL: "deny",  DONOR: "own" },
  "donor:write":     { ADMIN: "allow", BANK_STAFF: "allow", HOSPITAL: "deny",  DONOR: "deny" },
  "donation:create": { ADMIN: "allow", BANK_STAFF: "own",   HOSPITAL: "deny",  DONOR: "deny" },
  "request:read":    { ADMIN: "allow", BANK_STAFF: "allow", HOSPITAL: "own",   DONOR: "deny" },
  "request:create":  { ADMIN: "deny",  BANK_STAFF: "deny",  HOSPITAL: "allow", DONOR: "deny" },
  "request:approve": { ADMIN: "allow", BANK_STAFF: "allow", HOSPITAL: "deny",  DONOR: "deny" },
  "request:reject":  { ADMIN: "allow", BANK_STAFF: "allow", HOSPITAL: "deny",  DONOR: "deny" },
  "request:allocate":{ ADMIN: "allow", BANK_STAFF: "allow", HOSPITAL: "deny",  DONOR: "deny" },
  "request:fulfil":  { ADMIN: "allow", BANK_STAFF: "allow", HOSPITAL: "deny",  DONOR: "deny" },
  "request:cancel":  { ADMIN: "allow", BANK_STAFF: "deny",  HOSPITAL: "own",   DONOR: "deny" },
  "audit:read":      { ADMIN: "allow", BANK_STAFF: "deny",  HOSPITAL: "deny",  DONOR: "deny" },
  "audit:verify":    { ADMIN: "allow", BANK_STAFF: "deny",  HOSPITAL: "deny",  DONOR: "deny" },
  "user:manage":     { ADMIN: "allow", BANK_STAFF: "deny",  HOSPITAL: "deny",  DONOR: "deny" },
  "race:run":        { ADMIN: "allow", BANK_STAFF: "allow", HOSPITAL: "deny",  DONOR: "deny" },
  "security:run":    { ADMIN: "allow", BANK_STAFF: "deny",  HOSPITAL: "deny",  DONOR: "deny" },
  "profile:update":  { ADMIN: "allow", BANK_STAFF: "allow", HOSPITAL: "allow", DONOR: "allow" },
};

export type ResourceScope = {
  hospitalId?: string | null;
  bankId?: string | null;
  donorId?: string | null;
  ownerId?: string | null;
};

/** Tenant ownership is decided by the field that identifies the role's tenant. */
export function ownsResource(actor: Actor, resource: ResourceScope): boolean {
  switch (actor.role) {
    case "HOSPITAL":
      return !!resource.hospitalId && resource.hospitalId === actor.hospitalId;
    case "BANK_STAFF":
      return !!resource.bankId && resource.bankId === actor.bankId;
    case "DONOR":
      return !!resource.donorId && resource.donorId === actor.donorId;
    case "ADMIN":
      return false; // admin is covered by "allow", never by ownership
  }
}

export function ruleFor(role: Role, action: Action): Rule {
  return MATRIX[action][role];
}

export function can(actor: Actor, action: Action, resource: ResourceScope = {}): boolean {
  const rule = ruleFor(actor.role, action);
  if (rule === "allow") return true;
  if (rule === "own") return ownsResource(actor, resource);
  return false;
}

export const POLICY_MATRIX = MATRIX;
