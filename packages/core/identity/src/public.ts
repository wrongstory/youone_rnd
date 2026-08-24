/** Public cross-module contracts for @youone/core-identity. */

import type { Sha256, StableCode, UtcInstant, Uuid, Version } from "@youone/shared-kernel/public";

export type AccountStatus = "ACTIVE" | "DISABLED" | "PENDING";
export type AccountKind = "INTERNAL" | "VENDOR";
export type AssignmentStatus = "ACTIVE" | "REVOKED";
export type AssuranceLevel = "AAL1" | "AAL2" | "UNKNOWN";

export type VerifiedAuthSession = Readonly<{
  authSubject: string;
  sessionId: string;
  expiresAt: UtcInstant;
  assuranceLevel: AssuranceLevel;
  verificationEvidenceHash?: Sha256;
}>;

export interface AuthSessionVerifier {
  verify(accessToken: string): Promise<VerifiedAuthSession>;
}

export type EffectiveAssignment = Readonly<{
  assignmentId: Uuid;
  stableCode: StableCode;
  validFrom: UtcInstant;
  validUntil?: UtcInstant;
  evidenceId: Uuid;
}>;

export type VendorMembership = Readonly<{
  vendorUserId: Uuid;
  vendorId: Uuid;
  status: AssignmentStatus;
  validFrom: UtcInstant;
  validUntil?: UtcInstant;
  evidenceId: Uuid;
}>;

export type ActingAuthority = Readonly<{
  assignmentId: Uuid;
  roleId: StableCode;
  effectiveActorId: Uuid;
  allowedActions: readonly StableCode[];
  validFrom: UtcInstant;
  validUntil?: UtcInstant;
  evidenceId: Uuid;
}>;

export type IdentitySnapshot = Readonly<{
  userId: Uuid;
  authSubject: string;
  accountKind: AccountKind;
  accountStatus: AccountStatus;
  accountValidFrom: UtcInstant;
  accountValidUntil?: UtcInstant;
  accountVersion: Version;
  organizations: readonly EffectiveAssignment[];
  departments: readonly EffectiveAssignment[];
  positions: readonly EffectiveAssignment[];
  roles: readonly EffectiveAssignment[];
  permissions: readonly EffectiveAssignment[];
  vendorMemberships: readonly VendorMembership[];
  actingAuthorities: readonly ActingAuthority[];
  evidenceIds: readonly Uuid[];
}>;

export interface IdentitySnapshotSource {
  loadByVerifiedSubject(authSubject: string, requestTime: UtcInstant): Promise<IdentitySnapshot | null>;
}

export class IdentityVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityVerificationError";
  }
}

export * from "./operational-auth";
