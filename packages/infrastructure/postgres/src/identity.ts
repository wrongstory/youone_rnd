import type {
  ActorContextSnapshot,
  ActorContextSource,
  ActorScopeExtensionSource,
  TypedScopeGrant
} from "@youone/core-authorization/public";
import type { ActingAuthority, EffectiveAssignment, IdentitySnapshot, VendorMembership } from "@youone/core-identity/public";
import { stableCode, utcInstant, uuid, version, type UtcInstant, type Uuid } from "@youone/shared-kernel/public";

import type { SqlPool } from "./driver.js";

const EMPTY_SCOPE_SOURCE: ActorScopeExtensionSource = Object.freeze({
  load: async (): Promise<readonly TypedScopeGrant[]> => []
});

/**
 * Read-only identity bootstrap after Supabase subject verification.
 * The supplied pool MUST connect through a server-only login that can SET ROLE
 * youone_identity_resolver. It must never be the ordinary request pool.
 */
export class PostgresActorContextSource implements ActorContextSource {
  public constructor(
    private readonly pool: SqlPool,
    private readonly scopeExtension: ActorScopeExtensionSource = EMPTY_SCOPE_SOURCE
  ) {}

  public async load(authSubject: string, requestTime: UtcInstant): Promise<ActorContextSnapshot | null> {
    const connection = await this.pool.connect();
    let identity: IdentitySnapshot | null = null;
    let securityEntitlements: readonly ReturnType<typeof stableCode>[] = [];
    let began = false;
    try {
      await connection.query("begin read only");
      began = true;
      await connection.query("set local role youone_identity_resolver");
      const result = await connection.query<{ snapshot: unknown }>(
        "select app_private.resolve_actor_context_snapshot($1, $2::timestamptz) as snapshot",
        [authSubject, requestTime]
      );
      const raw = result.rows[0]?.snapshot;
      if (raw !== null && raw !== undefined) {
        identity = parseIdentitySnapshot(raw);
        securityEntitlements = parseStableCodeArray(record(raw).securityEntitlements);
      }
      await connection.query("commit");
    } catch (error) {
      if (began) await connection.query("rollback");
      throw error;
    } finally {
      connection.release();
    }
    if (identity === null) return null;
    const scopeGrants = await this.scopeExtension.load(identity.userId, requestTime);
    return Object.freeze({ identity, scopeGrants: Object.freeze([...scopeGrants]), securityEntitlements });
  }
}

function parseIdentitySnapshot(value: unknown): IdentitySnapshot {
  const raw = record(value);
  const accountKind = string(raw.accountKind);
  const accountStatus = string(raw.accountStatus);
  if (accountKind !== "INTERNAL" && accountKind !== "VENDOR") throw new Error("invalid server account kind");
  if (accountStatus !== "ACTIVE" && accountStatus !== "DISABLED" && accountStatus !== "PENDING") throw new Error("invalid server account status");
  return Object.freeze({
    userId: uuid(string(raw.userId)),
    authSubject: string(raw.authSubject),
    accountKind,
    accountStatus,
    accountValidFrom: utcInstant(string(raw.accountValidFrom)),
    ...(raw.accountValidUntil === null || raw.accountValidUntil === undefined ? {} : { accountValidUntil: utcInstant(string(raw.accountValidUntil)) }),
    accountVersion: version(number(raw.accountVersion)),
    organizations: parseAssignments(raw.organizations),
    departments: parseAssignments(raw.departments),
    positions: parseAssignments(raw.positions),
    roles: parseAssignments(raw.roles),
    permissions: parseAssignments(raw.permissions),
    vendorMemberships: parseVendorMemberships(raw.vendorMemberships),
    actingAuthorities: parseActingAuthorities(raw.actingAuthorities),
    evidenceIds: parseUuidArray(raw.evidenceIds)
  });
}

function parseAssignments(value: unknown): readonly EffectiveAssignment[] {
  return Object.freeze(array(value).map((item) => {
    const raw = record(item);
    return Object.freeze({
      assignmentId: uuid(string(raw.assignmentId)),
      stableCode: stableCode(string(raw.stableCode)),
      validFrom: utcInstant(string(raw.validFrom)),
      ...(raw.validUntil === null || raw.validUntil === undefined ? {} : { validUntil: utcInstant(string(raw.validUntil)) }),
      evidenceId: uuid(string(raw.evidenceId))
    });
  }));
}

function parseVendorMemberships(value: unknown): readonly VendorMembership[] {
  return Object.freeze(array(value).map((item) => {
    const raw = record(item);
    const status = string(raw.status);
    if (status !== "ACTIVE" && status !== "REVOKED") throw new Error("invalid vendor membership status");
    return Object.freeze({
      vendorUserId: uuid(string(raw.vendorUserId)),
      vendorId: uuid(string(raw.vendorId)),
      status,
      validFrom: utcInstant(string(raw.validFrom)),
      ...(raw.validUntil === null || raw.validUntil === undefined ? {} : { validUntil: utcInstant(string(raw.validUntil)) }),
      evidenceId: uuid(string(raw.evidenceId))
    });
  }));
}

function parseActingAuthorities(value: unknown): readonly ActingAuthority[] {
  return Object.freeze(array(value).map((item) => {
    const raw = record(item);
    return Object.freeze({
      assignmentId: uuid(string(raw.assignmentId)),
      roleId: stableCode(string(raw.roleId)),
      effectiveActorId: uuid(string(raw.effectiveActorId)),
      allowedActions: parseStableCodeArray(raw.allowedActions),
      validFrom: utcInstant(string(raw.validFrom)),
      ...(raw.validUntil === null || raw.validUntil === undefined ? {} : { validUntil: utcInstant(string(raw.validUntil)) }),
      evidenceId: uuid(string(raw.evidenceId))
    });
  }));
}

function parseStableCodeArray(value: unknown) {
  return Object.freeze(array(value).map((item) => stableCode(string(item))));
}

function parseUuidArray(value: unknown): readonly Uuid[] {
  return Object.freeze(array(value).map((item) => uuid(string(item))));
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid actor snapshot object");
  return value as Record<string, unknown>;
}

function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("invalid actor snapshot array");
  return value;
}

function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid actor snapshot string");
  return value;
}

function number(value: unknown): number {
  if (typeof value !== "number") throw new Error("invalid actor snapshot number");
  return value;
}
