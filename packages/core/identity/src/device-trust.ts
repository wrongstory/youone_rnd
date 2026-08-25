/**
 * P0 DeviceTrust and restricted activation contracts.
 *
 * This module deliberately has no browser, Supabase, database, or cookie types.
 * Provider tokens and raw device nonces must be consumed before this boundary;
 * only one-way SHA-256 HMAC fingerprints may cross it.
 */
import type {
  CorrelationId,
  Sha256,
  StableCode,
  UtcInstant,
  Uuid,
  Version
} from "@youone/shared-kernel/public";

import type {
  AccountKind,
  AccountStatus,
  AssuranceLevel,
  AuthSessionVerifier
} from "./public.js";
import { IdentityVerificationError } from "./identity-verification-error";

export type DeviceTrustState = "PENDING" | "ACTIVE" | "REVOKED" | "EXPIRED";
export type DeviceTrustPolicyState = "DRAFT" | "EFFECTIVE" | "REVOKED";
export type DeviceTrustAuthenticationMethod = "PASSWORD_TOTP_AAL2";
export type ActivationEvidenceKind = "REGISTRATION_APPROVAL" | "OD042_BOOTSTRAP";
export type ActivationEvidenceState = "APPROVED" | "REVOKED";

export const ACTIVATION_ACTIONS = Object.freeze({
  enrollDeviceTrust: "identity.device-trust.enroll.activation",
  verifyDeviceTrust: "identity.device-trust.verify.activation",
  readReadiness: "identity.activation.readiness.read"
} as const);

export type ActivationAction = (typeof ACTIVATION_ACTIONS)[keyof typeof ACTIVATION_ACTIONS];
const activationActions: readonly ActivationAction[] = Object.freeze(Object.values(ACTIVATION_ACTIONS));

export type ActivationEvidenceSnapshot = Readonly<{
  evidenceId: Uuid;
  evidenceKind: ActivationEvidenceKind;
  state: ActivationEvidenceState;
  userAccountId: Uuid;
  authSubject: string;
  approvedAt: UtcInstant;
  providerInvitationAcceptedAt?: UtcInstant;
  passwordEstablishedAt?: UtcInstant;
  validUntil?: UtcInstant;
  revokedAt?: UtcInstant;
  evidenceSha256: Sha256;
}>;

export type VerifiedTotpSnapshot = Readonly<{
  method: "TOTP";
  assuranceLevel: AssuranceLevel;
  verifiedAt: UtcInstant;
  factorEvidenceId: Uuid;
  revokedAt?: UtcInstant;
}>;

/**
 * Returned only by the trusted server identity adapter after checking the exact
 * configured provider issuer/project and the exact live provider session row.
 */
export type ActivationIdentitySnapshot = Readonly<{
  userAccountId: Uuid;
  authSubject: string;
  accountKind: AccountKind;
  accountStatus: AccountStatus;
  accountValidFrom: UtcInstant;
  accountValidUntil?: UtcInstant;
  accountVersion: Version;
  providerIssuer: string;
  providerProjectId: StableCode;
  providerSessionId: string;
  providerSessionIsLive: boolean;
  totp: VerifiedTotpSnapshot | null;
  activationEvidence: ActivationEvidenceSnapshot | null;
}>;

export interface ActivationContextSource {
  /** The adapter must not accept a request-body user ID and must bind this lookup to the exact live session. */
  load(
    authSubject: string,
    providerSessionId: string,
    requestTime: UtcInstant
  ): Promise<ActivationIdentitySnapshot | null>;
}

export type ActivationContext = Readonly<{
  userAccountId: Uuid;
  authSubject: string;
  accountKind: AccountKind;
  accountVersion: Version;
  providerIssuer: string;
  providerProjectId: StableCode;
  providerSessionId: string;
  assuranceLevel: "AAL2";
  authenticationMethod: "TOTP";
  totpEvidenceId: Uuid;
  activationEvidenceId: Uuid;
  activationEvidenceKind: ActivationEvidenceKind;
  requestTime: UtcInstant;
  correlationId: CorrelationId;
  allowedActions: readonly ActivationAction[];
}>;

declare const trustedActivationBrand: unique symbol;
export type TrustedActivationContext = ActivationContext & Readonly<{ [trustedActivationBrand]: true }>;
const trustedActivationContexts = new WeakSet<object>();

export function assertTrustedActivationContext(
  context: ActivationContext
): asserts context is TrustedActivationContext {
  if (!trustedActivationContexts.has(context)) {
    throw new IdentityVerificationError("ActivationContext was not produced by TrustedActivationContextFactory");
  }
}

export function assertActivationActionAllowed(
  context: TrustedActivationContext,
  action: ActivationAction
): void {
  assertTrustedActivationContext(context);
  if (!context.allowedActions.includes(action)) {
    throw new IdentityVerificationError("ActivationContext action is not allowed");
  }
}

/**
 * This factory is intentionally separate from TrustedActorContextFactory.
 * It accepts only a provider token and derives the user/session from trusted sources.
 */
export class TrustedActivationContextFactory {
  public constructor(
    private readonly verifier: AuthSessionVerifier,
    private readonly source: ActivationContextSource
  ) {}

  public async create(
    accessToken: string,
    correlationId: CorrelationId,
    requestTime: UtcInstant
  ): Promise<TrustedActivationContext> {
    const session = await this.verifier.verify(accessToken);
    if (session.authSubject.trim().length === 0 || session.sessionId.trim().length === 0) {
      throw new IdentityVerificationError("ACTIVATION_PROVIDER_IDENTITY_INCOMPLETE");
    }
    if (session.expiresAt <= requestTime) {
      throw new IdentityVerificationError("ACTIVATION_PROVIDER_SESSION_EXPIRED");
    }
    if (session.assuranceLevel !== "AAL2") {
      throw new IdentityVerificationError("ACTIVATION_TOTP_AAL2_REQUIRED");
    }

    const snapshot = await this.source.load(session.authSubject, session.sessionId, requestTime);
    if (
      snapshot === null ||
      snapshot.authSubject !== session.authSubject ||
      snapshot.providerSessionId !== session.sessionId
    ) {
      throw new IdentityVerificationError("ACTIVATION_EXACT_SESSION_IDENTITY_REQUIRED");
    }

    const basis = evaluateActivationBasis({ snapshot, requestTime });
    if (!basis.ready) {
      throw new IdentityVerificationError(basis.reasonCodes[0] ?? "ACTIVATION_CONTEXT_DENIED");
    }

    const evidence = snapshot.activationEvidence;
    const totp = snapshot.totp;
    if (evidence === null || totp === null) {
      throw new IdentityVerificationError("ACTIVATION_CONTEXT_DENIED");
    }

    const context: ActivationContext = Object.freeze({
      userAccountId: snapshot.userAccountId,
      authSubject: snapshot.authSubject,
      accountKind: snapshot.accountKind,
      accountVersion: snapshot.accountVersion,
      providerIssuer: snapshot.providerIssuer,
      providerProjectId: snapshot.providerProjectId,
      providerSessionId: snapshot.providerSessionId,
      assuranceLevel: "AAL2",
      authenticationMethod: "TOTP",
      totpEvidenceId: totp.factorEvidenceId,
      activationEvidenceId: evidence.evidenceId,
      activationEvidenceKind: evidence.evidenceKind,
      requestTime,
      correlationId,
      allowedActions: activationActions
    });
    trustedActivationContexts.add(context);
    return context as TrustedActivationContext;
  }
}

export type DeviceTrustPolicyVersionSnapshot = Readonly<{
  policyVersionId: Uuid;
  policyCode: StableCode;
  state: DeviceTrustPolicyState;
  maximumTrustSeconds: number;
  approvedAt: UtcInstant;
  effectiveAt: UtcInstant;
  validUntil?: UtcInstant;
  revokedAt?: UtcInstant;
  approvalEvidenceId: Uuid;
}>;

export type DeviceTrustSnapshot = Readonly<{
  deviceTrustId: Uuid;
  userAccountId: Uuid;
  providerSessionId: string;
  deviceCredentialHmac: Sha256;
  state: DeviceTrustState;
  authenticationMethod: DeviceTrustAuthenticationMethod;
  policyVersionId: Uuid;
  createdAt: UtcInstant;
  approvedAt?: UtcInstant;
  expiresAt: UtcInstant;
  revokedAt?: UtcInstant;
  optimisticVersion: Version;
}>;

export type DeviceTrustDecisionReason =
  | "DEVICE_TRUST_ALLOWED"
  | "DEVICE_TRUST_BINDING_MISMATCH"
  | "DEVICE_TRUST_CREDENTIAL_MISMATCH"
  | "DEVICE_TRUST_EXPIRED"
  | "DEVICE_TRUST_NOT_ACTIVE"
  | "DEVICE_TRUST_POLICY_INVALID"
  | "DEVICE_TRUST_POLICY_MISSING"
  | "DEVICE_TRUST_POLICY_VERSION_MISMATCH"
  | "DEVICE_TRUST_RECORD_INVALID"
  | "DEVICE_TRUST_REVOKED";

export type DeviceTrustDecision =
  | Readonly<{
      trusted: true;
      reasonCode: "DEVICE_TRUST_ALLOWED";
      deviceTrustId: Uuid;
      policyVersionId: Uuid;
      userAccountId: Uuid;
      providerSessionId: string;
    }>
  | Readonly<{
      trusted: false;
      reasonCode: Exclude<DeviceTrustDecisionReason, "DEVICE_TRUST_ALLOWED">;
      deviceTrustId?: Uuid;
      policyVersionId?: Uuid;
    }>;

export type DeviceTrustEvaluationInput = Readonly<{
  userAccountId: Uuid;
  providerSessionId: string;
  presentedDeviceCredentialHmac: Sha256;
  record: DeviceTrustSnapshot | null;
  policy: DeviceTrustPolicyVersionSnapshot | null;
  evaluatedAt: UtcInstant;
}>;

export function evaluateDeviceTrust(input: DeviceTrustEvaluationInput): DeviceTrustDecision {
  const { record, policy } = input;
  if (policy === null) return deviceTrustDenied("DEVICE_TRUST_POLICY_MISSING");
  if (!isEffectiveDeviceTrustPolicy(policy, input.evaluatedAt)) {
    return deviceTrustDenied("DEVICE_TRUST_POLICY_INVALID", undefined, policy.policyVersionId);
  }
  if (record === null) return deviceTrustDenied("DEVICE_TRUST_NOT_ACTIVE", undefined, policy.policyVersionId);
  if (record.userAccountId !== input.userAccountId || record.providerSessionId !== input.providerSessionId) {
    return deviceTrustDenied("DEVICE_TRUST_BINDING_MISMATCH", record.deviceTrustId, policy.policyVersionId);
  }
  if (record.policyVersionId !== policy.policyVersionId) {
    return deviceTrustDenied("DEVICE_TRUST_POLICY_VERSION_MISMATCH", record.deviceTrustId, policy.policyVersionId);
  }
  if (record.deviceCredentialHmac !== input.presentedDeviceCredentialHmac) {
    return deviceTrustDenied("DEVICE_TRUST_CREDENTIAL_MISMATCH", record.deviceTrustId, policy.policyVersionId);
  }
  if (record.state === "REVOKED" || record.revokedAt !== undefined) {
    return deviceTrustDenied("DEVICE_TRUST_REVOKED", record.deviceTrustId, policy.policyVersionId);
  }
  if (record.state === "EXPIRED" || record.expiresAt <= input.evaluatedAt) {
    return deviceTrustDenied("DEVICE_TRUST_EXPIRED", record.deviceTrustId, policy.policyVersionId);
  }
  if (record.state !== "ACTIVE" || record.approvedAt === undefined) {
    return deviceTrustDenied("DEVICE_TRUST_NOT_ACTIVE", record.deviceTrustId, policy.policyVersionId);
  }
  const maximumExpiry = Date.parse(record.createdAt) + policy.maximumTrustSeconds * 1_000;
  if (
    record.authenticationMethod !== "PASSWORD_TOTP_AAL2" ||
    record.approvedAt < record.createdAt ||
    record.approvedAt > input.evaluatedAt ||
    Date.parse(record.expiresAt) > maximumExpiry
  ) {
    return deviceTrustDenied("DEVICE_TRUST_RECORD_INVALID", record.deviceTrustId, policy.policyVersionId);
  }
  return Object.freeze({
    trusted: true,
    reasonCode: "DEVICE_TRUST_ALLOWED",
    deviceTrustId: record.deviceTrustId,
    policyVersionId: policy.policyVersionId,
    userAccountId: record.userAccountId,
    providerSessionId: record.providerSessionId
  });
}

export type ActivationBasisReason =
  | "ACTIVATION_ACCOUNT_DISABLED_OR_EXPIRED"
  | "ACTIVATION_ACCOUNT_NOT_PENDING"
  | "ACTIVATION_EVIDENCE_INVALID"
  | "ACTIVATION_EXACT_SESSION_IDENTITY_REQUIRED"
  | "ACTIVATION_INVITATION_NOT_ACCEPTED"
  | "ACTIVATION_PASSWORD_NOT_ESTABLISHED"
  | "ACTIVATION_PROVIDER_SESSION_REQUIRED"
  | "ACTIVATION_TOTP_AAL2_REQUIRED";

export type ActivationBasisDecision = Readonly<{
  ready: boolean;
  reasonCodes: readonly ActivationBasisReason[];
}>;

export function evaluateActivationBasis(input: Readonly<{
  snapshot: ActivationIdentitySnapshot;
  requestTime: UtcInstant;
}>): ActivationBasisDecision {
  const { snapshot, requestTime } = input;
  const reasons: ActivationBasisReason[] = [];
  if (snapshot.accountStatus === "DISABLED") reasons.push("ACTIVATION_ACCOUNT_DISABLED_OR_EXPIRED");
  else if (snapshot.accountStatus !== "PENDING") reasons.push("ACTIVATION_ACCOUNT_NOT_PENDING");
  if (
    snapshot.accountValidFrom > requestTime ||
    (snapshot.accountValidUntil !== undefined && snapshot.accountValidUntil <= requestTime)
  ) reasons.push("ACTIVATION_ACCOUNT_DISABLED_OR_EXPIRED");
  if (!snapshot.providerSessionIsLive || snapshot.providerSessionId.trim().length === 0) {
    reasons.push("ACTIVATION_PROVIDER_SESSION_REQUIRED");
  }
  if (
    snapshot.totp === null ||
    snapshot.totp.method !== "TOTP" ||
    snapshot.totp.assuranceLevel !== "AAL2" ||
    snapshot.totp.revokedAt !== undefined ||
    snapshot.totp.verifiedAt > requestTime
  ) reasons.push("ACTIVATION_TOTP_AAL2_REQUIRED");

  const evidence = snapshot.activationEvidence;
  if (
    evidence === null ||
    evidence.state !== "APPROVED" ||
    evidence.userAccountId !== snapshot.userAccountId ||
    evidence.authSubject !== snapshot.authSubject ||
    evidence.revokedAt !== undefined ||
    evidence.approvedAt > requestTime ||
    (evidence.validUntil !== undefined && evidence.validUntil <= requestTime)
  ) {
    reasons.push("ACTIVATION_EVIDENCE_INVALID");
  } else {
    if (evidence.providerInvitationAcceptedAt === undefined || evidence.providerInvitationAcceptedAt > requestTime) {
      reasons.push("ACTIVATION_INVITATION_NOT_ACCEPTED");
    }
    if (evidence.passwordEstablishedAt === undefined || evidence.passwordEstablishedAt > requestTime) {
      reasons.push("ACTIVATION_PASSWORD_NOT_ESTABLISHED");
    }
  }
  return Object.freeze({ ready: reasons.length === 0, reasonCodes: Object.freeze(reasons) });
}

export type AccountActivationReason = ActivationBasisReason
  | "ACTIVATION_DEVICE_TRUST_REQUIRED"
  | "ACTIVATION_REQUIRED_ASSIGNMENT_MISSING"
  | "ACTIVATION_VENDOR_MEMBERSHIP_MISSING";

export type AccountActivationReadiness = Readonly<{
  ready: boolean;
  reasonCodes: readonly AccountActivationReason[];
  accountVersion: Version;
}>;

export type AccountActivationFacts = Readonly<{
  identity: ActivationIdentitySnapshot;
  deviceTrustDecision: DeviceTrustDecision;
  hasActiveRequiredAssignment: boolean;
  hasActiveVendorMembership: boolean;
  evaluatedAt: UtcInstant;
}>;

/** Pure gate only; it never mutates UserAccount or auto-activates after DeviceTrust enrollment. */
export function evaluateAccountActivationReadiness(
  facts: AccountActivationFacts
): AccountActivationReadiness {
  const basis = evaluateActivationBasis({ snapshot: facts.identity, requestTime: facts.evaluatedAt });
  const reasons: AccountActivationReason[] = [...basis.reasonCodes];
  if (
    !facts.deviceTrustDecision.trusted ||
    facts.deviceTrustDecision.userAccountId !== facts.identity.userAccountId ||
    facts.deviceTrustDecision.providerSessionId !== facts.identity.providerSessionId
  ) reasons.push("ACTIVATION_DEVICE_TRUST_REQUIRED");
  if (facts.identity.accountKind === "INTERNAL" && !facts.hasActiveRequiredAssignment) {
    reasons.push("ACTIVATION_REQUIRED_ASSIGNMENT_MISSING");
  }
  if (facts.identity.accountKind === "VENDOR" && !facts.hasActiveVendorMembership) {
    reasons.push("ACTIVATION_VENDOR_MEMBERSHIP_MISSING");
  }
  return Object.freeze({
    ready: reasons.length === 0,
    reasonCodes: Object.freeze(reasons),
    accountVersion: facts.identity.accountVersion
  });
}

/** Server-only policy reader. A missing effective version is an intentional fail-closed result. */
export interface DeviceTrustPolicySource {
  loadEffective(evaluatedAt: UtcInstant): Promise<DeviceTrustPolicyVersionSnapshot | null>;
}

export interface DeviceTrustCommandPort {
  createPending(input: Readonly<{
    context: TrustedActivationContext;
    deviceCredentialHmac: Sha256;
    policy: DeviceTrustPolicyVersionSnapshot;
    expiresAt: UtcInstant;
  }>): Promise<DeviceTrustSnapshot>;
  activatePending(input: Readonly<{
    context: TrustedActivationContext;
    deviceTrustId: Uuid;
    deviceCredentialHmac: Sha256;
    expectedVersion: Version;
    policy: DeviceTrustPolicyVersionSnapshot;
  }>): Promise<DeviceTrustSnapshot>;
  loadExact(input: Readonly<{
    context: TrustedActivationContext;
    deviceTrustId?: Uuid;
    deviceCredentialHmac: Sha256;
  }>): Promise<DeviceTrustSnapshot | null>;
}

export class DeviceTrustPolicyUnavailableError extends Error {
  public constructor() {
    super("DEVICE_TRUST_EFFECTIVE_POLICY_REQUIRED");
    this.name = "DeviceTrustPolicyUnavailableError";
  }
}

/**
 * Minimal activation-only use cases. Cookie parsing/signing remains an interface concern;
 * persistence and audit remain an infrastructure transaction concern.
 */
export class DeviceTrustActivationService {
  public constructor(
    private readonly policies: DeviceTrustPolicySource,
    private readonly commands: DeviceTrustCommandPort
  ) {}

  public async beginEnrollment(
    context: TrustedActivationContext,
    deviceCredentialHmac: Sha256
  ): Promise<DeviceTrustSnapshot> {
    assertActivationActionAllowed(context, ACTIVATION_ACTIONS.enrollDeviceTrust);
    const policy = await this.requirePolicy(context.requestTime);
    const expiresAt = addSeconds(context.requestTime, policy.maximumTrustSeconds);
    const pending = await this.commands.createPending({ context, deviceCredentialHmac, policy, expiresAt });
    if (
      pending.state !== "PENDING" ||
      pending.userAccountId !== context.userAccountId ||
      pending.providerSessionId !== context.providerSessionId ||
      pending.deviceCredentialHmac !== deviceCredentialHmac ||
      pending.policyVersionId !== policy.policyVersionId ||
      pending.expiresAt !== expiresAt ||
      pending.approvedAt !== undefined ||
      pending.revokedAt !== undefined
    ) {
      throw new IdentityVerificationError("DEVICE_TRUST_ENROLLMENT_RESULT_INVALID");
    }
    return pending;
  }

  public async activateEnrollment(
    context: TrustedActivationContext,
    deviceTrustId: Uuid,
    deviceCredentialHmac: Sha256
  ): Promise<DeviceTrustSnapshot> {
    assertActivationActionAllowed(context, ACTIVATION_ACTIONS.enrollDeviceTrust);
    const policy = await this.requirePolicy(context.requestTime);
    const pending = await this.commands.loadExact({ context, deviceTrustId, deviceCredentialHmac });
    if (
      pending === null ||
      pending.state !== "PENDING" ||
      pending.userAccountId !== context.userAccountId ||
      pending.providerSessionId !== context.providerSessionId ||
      pending.deviceCredentialHmac !== deviceCredentialHmac ||
      pending.policyVersionId !== policy.policyVersionId ||
      pending.expiresAt <= context.requestTime
    ) {
      throw new IdentityVerificationError("DEVICE_TRUST_ENROLLMENT_INVALID_OR_REPLAYED");
    }
    const activated = await this.commands.activatePending({
      context,
      deviceTrustId,
      deviceCredentialHmac,
      expectedVersion: pending.optimisticVersion,
      policy
    });
    if (
      activated.state !== "ACTIVE" ||
      activated.userAccountId !== context.userAccountId ||
      activated.providerSessionId !== context.providerSessionId ||
      activated.deviceCredentialHmac !== deviceCredentialHmac ||
      activated.policyVersionId !== policy.policyVersionId
    ) {
      throw new IdentityVerificationError("DEVICE_TRUST_ACTIVATION_RESULT_INVALID");
    }
    return activated;
  }

  public async verify(
    context: TrustedActivationContext,
    deviceCredentialHmac: Sha256
  ): Promise<DeviceTrustDecision> {
    assertActivationActionAllowed(context, ACTIVATION_ACTIONS.verifyDeviceTrust);
    const policy = await this.policies.loadEffective(context.requestTime);
    const record = await this.commands.loadExact({ context, deviceCredentialHmac });
    return evaluateDeviceTrust({
      userAccountId: context.userAccountId,
      providerSessionId: context.providerSessionId,
      presentedDeviceCredentialHmac: deviceCredentialHmac,
      record,
      policy,
      evaluatedAt: context.requestTime
    });
  }

  private async requirePolicy(evaluatedAt: UtcInstant): Promise<DeviceTrustPolicyVersionSnapshot> {
    const policy = await this.policies.loadEffective(evaluatedAt);
    if (policy === null || !isEffectiveDeviceTrustPolicy(policy, evaluatedAt)) {
      throw new DeviceTrustPolicyUnavailableError();
    }
    return policy;
  }
}

function isEffectiveDeviceTrustPolicy(
  policy: DeviceTrustPolicyVersionSnapshot,
  evaluatedAt: UtcInstant
): boolean {
  return policy.state === "EFFECTIVE" &&
    Number.isSafeInteger(policy.maximumTrustSeconds) &&
    policy.maximumTrustSeconds > 0 &&
    policy.approvedAt <= policy.effectiveAt &&
    policy.effectiveAt <= evaluatedAt &&
    policy.revokedAt === undefined &&
    (policy.validUntil === undefined || policy.validUntil > evaluatedAt);
}

function addSeconds(instant: UtcInstant, seconds: number): UtcInstant {
  const value = new Date(Date.parse(instant) + seconds * 1_000);
  if (!Number.isSafeInteger(seconds) || seconds <= 0 || Number.isNaN(value.getTime())) {
    throw new DeviceTrustPolicyUnavailableError();
  }
  return value.toISOString() as UtcInstant;
}

function deviceTrustDenied(
  reasonCode: Exclude<DeviceTrustDecisionReason, "DEVICE_TRUST_ALLOWED">,
  deviceTrustId?: Uuid,
  policyVersionId?: Uuid
): DeviceTrustDecision {
  return Object.freeze({
    trusted: false,
    reasonCode,
    ...(deviceTrustId === undefined ? {} : { deviceTrustId }),
    ...(policyVersionId === undefined ? {} : { policyVersionId })
  });
}
