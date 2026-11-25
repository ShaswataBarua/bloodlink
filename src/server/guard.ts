import { redirect } from "next/navigation";
import { audit } from "./audit";
import { HttpError } from "./http";
import { can, type Action, type ResourceScope } from "./policy";
import { getActor, type Actor, type Role } from "./session";

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new HttpError(401, "Authentication required.", "UNAUTHENTICATED");
  return actor;
}

/**
 * The one gate every API route goes through. A denial is written to the audit log
 * before the error is returned, so blocked attempts are evidence, not silence.
 */
export async function authorizeActor(
  actor: Actor,
  action: Action,
  resource: ResourceScope = {},
  meta: { ip?: string | null; resourceType?: string; resourceId?: string | null } = {},
): Promise<void> {
  if (can(actor, action, resource)) return;
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    action,
    resourceType: meta.resourceType ?? action.split(":")[0],
    resourceId: meta.resourceId ?? null,
    outcome: "DENIED",
    ip: meta.ip ?? null,
  });
  throw new HttpError(403, "You do not have permission to perform this action.", "FORBIDDEN");
}

export async function authorize(
  action: Action,
  resource: ResourceScope = {},
  meta: { ip?: string | null; resourceType?: string; resourceId?: string | null } = {},
): Promise<Actor> {
  const actor = await requireActor();
  await authorizeActor(actor, action, resource, meta);
  return actor;
}

/**
 * IDOR defence: another tenant's record is reported as "not found" (so its existence
 * is not leaked) and the attempt is audited as DENIED.
 */
export async function denyAsNotFound(
  actor: Actor,
  action: Action,
  resource: ResourceScope,
  meta: { ip?: string | null; resourceType?: string; resourceId?: string | null } = {},
): Promise<never> {
  await audit({
    actorId: actor.id,
    actorRole: actor.role,
    action,
    resourceType: meta.resourceType ?? action.split(":")[0],
    resourceId: meta.resourceId ?? null,
    outcome: "DENIED",
    ip: meta.ip ?? null,
    after: { reason: "cross-tenant access attempt" },
  });
  throw new HttpError(404, "Record not found.", "NOT_FOUND");
}

/** Like authorize(), but scoped to the caller's own tenant fields (used for "own" rules). */
export async function authorizeOwn(
  action: Action,
  meta: { ip?: string | null; resourceType?: string; resourceId?: string | null } = {},
): Promise<Actor> {
  const actor = await requireActor();
  await authorizeActor(
    actor,
    action,
    { donorId: actor.donorId, hospitalId: actor.hospitalId, bankId: actor.bankId },
    meta,
  );
  return actor;
}

export async function requirePageActor(roles?: readonly Role[]): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (roles && !roles.includes(actor.role)) redirect("/");
  return actor;
}
