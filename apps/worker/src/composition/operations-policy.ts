export const OPERATIONS_POLICY_DECISION_IDS = Object.freeze([
  "OD-019-MFA-SESSION",
  "OD-035-PRODUCTION-OPERATIONS",
  "OD-036-SUPABASE-SESSION-REVOKE"
] as const);

export type OperationsPolicyDecisionId = typeof OPERATIONS_POLICY_DECISION_IDS[number];

export type PolicyApproval = Readonly<{
  status: "APPROVED";
  createdAt: string;
  approvedAt: string;
  effectiveFrom: string;
  approvedByActorId: string;
  approvalEvidenceSha256: string;
  revokedAt: null;
}>;

export type MfaSessionPolicy = Readonly<{
  decisionId: "OD-019-MFA-SESSION";
  policyVersion: string;
  approval: PolicyApproval;
  mfa: Readonly<{
    requiredActorKinds: readonly ("INTERNAL" | "VENDOR")[];
    requiredActionIds: readonly string[];
    factorTypes: readonly ("PHONE" | "TOTP")[];
    requiredAssuranceLevel: "aal2";
  }>;
  session: Readonly<{
    jwtExpiryMinutes: number;
    timeboxMinutes: number | null;
    inactivityMinutes: number | null;
    singleSessionPerUser: boolean;
  }>;
  device: Readonly<{
    newDeviceReauthentication: boolean;
    managedDeviceRequiredForActionIds: readonly string[];
  }>;
}>;

export type ProductionOperationsPolicy = Readonly<{
  decisionId: "OD-035-PRODUCTION-OPERATIONS";
  policyVersion: string;
  approval: PolicyApproval;
  recoveryObjectives: Readonly<{ rpoMinutes: number; rtoMinutes: number }>;
  databaseBackup: Readonly<{ cadenceMinutes: number; retentionDays: number }>;
  storageBackup: Readonly<{ cadenceMinutes: number; retentionDays: number }>;
  monitoringDestinationIds: readonly string[];
  incidentOwnerActorIds: readonly string[];
  recoveryApproverActorIds: readonly string[];
  evidenceLocationId: string;
}>;

export type ProviderSessionRevokePolicy = Readonly<{
  decisionId: "OD-036-SUPABASE-SESSION-REVOKE";
  policyVersion: string;
  approval: PolicyApproval;
  mechanism: "SUPABASE_GLOBAL_SIGN_OUT_WITH_TARGET_JWT";
  scope: "global";
  applicationSessionCheck: "EXACT_AUTH_SESSIONS_ROW_EVERY_REQUEST";
  maximumResidualAccessTokenMinutes: number;
  retryAttempts: number;
  reconciliationIntervalMinutes: number;
  limitationsAcknowledged: readonly (
    | "ACCESS_TOKEN_VALID_UNTIL_EXPIRY"
    | "TARGET_USER_JWT_REQUIRED"
  )[];
}>;

export type OperationsPolicyBundle = Readonly<{
  schemaVersion: 1;
  mfaSession: MfaSessionPolicy;
  productionOperations: ProductionOperationsPolicy;
  providerSessionRevoke: ProviderSessionRevokePolicy;
}>;

export class OperationsPolicyError extends Error {
  public constructor(public readonly reasonCode:
    | "OPERATIONS_POLICY_APPROVAL_INVALID"
    | "OPERATIONS_POLICY_EFFECTIVE_DATE_INVALID"
    | "OPERATIONS_POLICY_INPUT_INVALID"
    | "OPERATIONS_POLICY_VALUE_INVALID"
    | "OPERATIONS_POLICY_VERSION_INVALID") {
    super(reasonCode);
    this.name = "OperationsPolicyError";
  }
}

const shaPattern = /^[0-9a-f]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const stableIdPattern = /^[A-Z][A-Z0-9_.-]{2,95}$/;
const policyVersionPattern = /^POL-[A-Z0-9-]+-V[1-9][0-9]*$/;

export function validateOperationsPolicyBundle(input: unknown, evaluatedAt: string): OperationsPolicyBundle {
  const evaluationTime = canonicalTime(evaluatedAt, "OPERATIONS_POLICY_EFFECTIVE_DATE_INVALID");
  if (!isRecord(input) || input.schemaVersion !== 1) fail("OPERATIONS_POLICY_INPUT_INVALID");
  const mfaSession = validateMfaSession(input.mfaSession, evaluationTime);
  const productionOperations = validateProductionOperations(input.productionOperations, evaluationTime);
  const providerSessionRevoke = validateProviderSessionRevoke(input.providerSessionRevoke, evaluationTime, mfaSession.session.jwtExpiryMinutes);
  return Object.freeze({ schemaVersion: 1, mfaSession, productionOperations, providerSessionRevoke });
}

function validateMfaSession(input: unknown, evaluatedAt: number): MfaSessionPolicy {
  const record = policyRecord(input, "OD-019-MFA-SESSION", evaluatedAt);
  if (!isRecord(record.mfa) || !isRecord(record.session) || !isRecord(record.device)) fail("OPERATIONS_POLICY_INPUT_INVALID");
  const actorKinds = exactUniqueValues(record.mfa.requiredActorKinds, ["INTERNAL", "VENDOR"] as const, true);
  const factors = exactUniqueValues(record.mfa.factorTypes, ["PHONE", "TOTP"] as const, true);
  const requiredActionIds = stableIds(record.mfa.requiredActionIds, true);
  const managedDeviceActions = stableIds(record.device.managedDeviceRequiredForActionIds, false);
  const jwtExpiryMinutes = boundedInteger(record.session.jwtExpiryMinutes, 5, 1_440);
  const timeboxMinutes = nullableBoundedInteger(record.session.timeboxMinutes, jwtExpiryMinutes, 525_600);
  const inactivityMinutes = nullableBoundedInteger(record.session.inactivityMinutes, jwtExpiryMinutes, 525_600);
  if (record.mfa.requiredAssuranceLevel !== "aal2" || typeof record.session.singleSessionPerUser !== "boolean" || typeof record.device.newDeviceReauthentication !== "boolean") {
    fail("OPERATIONS_POLICY_VALUE_INVALID");
  }
  return Object.freeze({
    decisionId: "OD-019-MFA-SESSION",
    policyVersion: record.policyVersion,
    approval: record.approval,
    mfa: Object.freeze({ requiredActorKinds: actorKinds, requiredActionIds, factorTypes: factors, requiredAssuranceLevel: "aal2" }),
    session: Object.freeze({ jwtExpiryMinutes, timeboxMinutes, inactivityMinutes, singleSessionPerUser: record.session.singleSessionPerUser }),
    device: Object.freeze({ newDeviceReauthentication: record.device.newDeviceReauthentication, managedDeviceRequiredForActionIds: managedDeviceActions })
  });
}

function validateProductionOperations(input: unknown, evaluatedAt: number): ProductionOperationsPolicy {
  const record = policyRecord(input, "OD-035-PRODUCTION-OPERATIONS", evaluatedAt);
  if (!isRecord(record.recoveryObjectives) || !isRecord(record.databaseBackup) || !isRecord(record.storageBackup)) {
    fail("OPERATIONS_POLICY_INPUT_INVALID");
  }
  const rpoMinutes = boundedInteger(record.recoveryObjectives.rpoMinutes, 1, 525_600);
  const rtoMinutes = boundedInteger(record.recoveryObjectives.rtoMinutes, 1, 525_600);
  const databaseBackup = backupPolicy(record.databaseBackup, rpoMinutes);
  const storageBackup = backupPolicy(record.storageBackup, rpoMinutes);
  const monitoringDestinationIds = stableIds(record.monitoringDestinationIds, true);
  const incidentOwnerActorIds = actorIds(record.incidentOwnerActorIds);
  const recoveryApproverActorIds = actorIds(record.recoveryApproverActorIds);
  if (typeof record.evidenceLocationId !== "string" || !stableIdPattern.test(record.evidenceLocationId) || containsPlaceholderToken(record.evidenceLocationId)) fail("OPERATIONS_POLICY_VALUE_INVALID");
  return Object.freeze({
    decisionId: "OD-035-PRODUCTION-OPERATIONS",
    policyVersion: record.policyVersion,
    approval: record.approval,
    recoveryObjectives: Object.freeze({ rpoMinutes, rtoMinutes }),
    databaseBackup,
    storageBackup,
    monitoringDestinationIds,
    incidentOwnerActorIds,
    recoveryApproverActorIds,
    evidenceLocationId: record.evidenceLocationId
  });
}

function validateProviderSessionRevoke(input: unknown, evaluatedAt: number, jwtExpiryMinutes: number): ProviderSessionRevokePolicy {
  const record = policyRecord(input, "OD-036-SUPABASE-SESSION-REVOKE", evaluatedAt);
  if (
    record.mechanism !== "SUPABASE_GLOBAL_SIGN_OUT_WITH_TARGET_JWT" ||
    record.scope !== "global" ||
    record.applicationSessionCheck !== "EXACT_AUTH_SESSIONS_ROW_EVERY_REQUEST"
  ) fail("OPERATIONS_POLICY_VALUE_INVALID");
  const maximumResidualAccessTokenMinutes = boundedInteger(record.maximumResidualAccessTokenMinutes, 1, jwtExpiryMinutes);
  const retryAttempts = boundedInteger(record.retryAttempts, 1, 20);
  const reconciliationIntervalMinutes = boundedInteger(record.reconciliationIntervalMinutes, 1, 1_440);
  const limitationsAcknowledged = exactUniqueValues(record.limitationsAcknowledged, [
    "ACCESS_TOKEN_VALID_UNTIL_EXPIRY",
    "TARGET_USER_JWT_REQUIRED"
  ] as const, true);
  if (limitationsAcknowledged.length !== 2) fail("OPERATIONS_POLICY_VALUE_INVALID");
  return Object.freeze({
    decisionId: "OD-036-SUPABASE-SESSION-REVOKE",
    policyVersion: record.policyVersion,
    approval: record.approval,
    mechanism: "SUPABASE_GLOBAL_SIGN_OUT_WITH_TARGET_JWT",
    scope: "global",
    applicationSessionCheck: "EXACT_AUTH_SESSIONS_ROW_EVERY_REQUEST",
    maximumResidualAccessTokenMinutes,
    retryAttempts,
    reconciliationIntervalMinutes,
    limitationsAcknowledged
  });
}

function policyRecord(input: unknown, decisionId: OperationsPolicyDecisionId, evaluatedAt: number): Readonly<Record<string, unknown> & { policyVersion: string; approval: PolicyApproval }> {
  if (!isRecord(input) || input.decisionId !== decisionId || typeof input.policyVersion !== "string") fail("OPERATIONS_POLICY_INPUT_INVALID");
  if (!policyVersionPattern.test(input.policyVersion) || containsPlaceholderToken(input.policyVersion)) fail("OPERATIONS_POLICY_VERSION_INVALID");
  const approval = validateApproval(input.approval, evaluatedAt);
  return Object.freeze({ ...input, policyVersion: input.policyVersion, approval });
}

function validateApproval(input: unknown, evaluatedAt: number): PolicyApproval {
  if (!isRecord(input) || input.status !== "APPROVED" || input.revokedAt !== null || typeof input.approvedByActorId !== "string" || !uuidPattern.test(input.approvedByActorId) || typeof input.approvalEvidenceSha256 !== "string" || !shaPattern.test(input.approvalEvidenceSha256)) {
    fail("OPERATIONS_POLICY_APPROVAL_INVALID");
  }
  const createdAt = canonicalTime(input.createdAt, "OPERATIONS_POLICY_APPROVAL_INVALID");
  const approvedAt = canonicalTime(input.approvedAt, "OPERATIONS_POLICY_APPROVAL_INVALID");
  const effectiveFrom = canonicalTime(input.effectiveFrom, "OPERATIONS_POLICY_EFFECTIVE_DATE_INVALID");
  if (createdAt > approvedAt || approvedAt > effectiveFrom || effectiveFrom > evaluatedAt) fail("OPERATIONS_POLICY_EFFECTIVE_DATE_INVALID");
  return Object.freeze({
    status: "APPROVED",
    createdAt: new Date(createdAt).toISOString(),
    approvedAt: new Date(approvedAt).toISOString(),
    effectiveFrom: new Date(effectiveFrom).toISOString(),
    approvedByActorId: input.approvedByActorId,
    approvalEvidenceSha256: input.approvalEvidenceSha256,
    revokedAt: null
  });
}

function backupPolicy(input: Record<string, unknown>, rpoMinutes: number): Readonly<{ cadenceMinutes: number; retentionDays: number }> {
  const cadenceMinutes = boundedInteger(input.cadenceMinutes, 1, 525_600);
  const retentionDays = boundedInteger(input.retentionDays, 1, 3_650);
  if (cadenceMinutes > rpoMinutes) fail("OPERATIONS_POLICY_VALUE_INVALID");
  return Object.freeze({ cadenceMinutes, retentionDays });
}

function stableIds(input: unknown, required: boolean): readonly string[] {
  if (!Array.isArray(input) || required && input.length === 0 || input.some((value) => typeof value !== "string" || !stableIdPattern.test(value) || containsPlaceholderToken(value))) fail("OPERATIONS_POLICY_VALUE_INVALID");
  if (new Set(input).size !== input.length) fail("OPERATIONS_POLICY_VALUE_INVALID");
  return Object.freeze([...input] as string[]);
}

function actorIds(input: unknown): readonly string[] {
  if (!Array.isArray(input) || input.length === 0 || input.some((value) => typeof value !== "string" || !uuidPattern.test(value)) || new Set(input).size !== input.length) {
    fail("OPERATIONS_POLICY_VALUE_INVALID");
  }
  return Object.freeze([...input] as string[]);
}

function exactUniqueValues<const Value extends string>(input: unknown, allowed: readonly Value[], required: boolean): readonly Value[] {
  if (!Array.isArray(input) || required && input.length === 0 || input.some((value) => typeof value !== "string" || !allowed.includes(value as Value)) || new Set(input).size !== input.length) {
    fail("OPERATIONS_POLICY_VALUE_INVALID");
  }
  return Object.freeze([...input] as Value[]);
}

function boundedInteger(input: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(input) || (input as number) < minimum || (input as number) > maximum) fail("OPERATIONS_POLICY_VALUE_INVALID");
  return input as number;
}

function nullableBoundedInteger(input: unknown, minimum: number, maximum: number): number | null {
  return input === null ? null : boundedInteger(input, minimum, maximum);
}

function canonicalTime(input: unknown, reasonCode: OperationsPolicyError["reasonCode"]): number {
  if (typeof input !== "string") fail(reasonCode);
  const timestamp = Date.parse(input);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== input) fail(reasonCode);
  return timestamp;
}

function containsPlaceholderToken(value: string): boolean {
  const tokens = value.toUpperCase().split(/[^A-Z0-9]+/);
  return tokens.some((token) => ["TBD", "TODO", "PLACEHOLDER", "CHANGEME", "FILLME", "UNSET", "UNKNOWN", "SAMPLE", "DUMMY"].includes(token));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(reasonCode: OperationsPolicyError["reasonCode"]): never {
  throw new OperationsPolicyError(reasonCode);
}
