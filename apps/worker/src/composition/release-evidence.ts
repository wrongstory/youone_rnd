import { createHash } from "node:crypto";

import { DEPLOYMENT_COMPONENT_IDS } from "./deployment-readiness.js";
import {
  OperationsPolicyError,
  validateOperationsPolicyBundle,
  type OperationsPolicyBundle,
  type PolicyApproval
} from "./operations-policy.js";
import { REQUIRED_STAGING_CHECK_IDS } from "./staging-evidence.js";

export const REQUIRED_RELEASE_EVIDENCE_IDS = Object.freeze([
  "CI_QUALITY", "CI_M07", "CI_M08", "CI_M09", "CI_M10", "CI_M11", "CI_M12", "CI_M13", "CI_M14", "CI_M15", "CI_M16",
  "CI_R01", "CI_R02", "CI_R03", "CI_R04", "CI_R05",
  "MIGRATION_CLEAN", "MIGRATION_UPGRADE", "MIGRATION_ROLLBACK_FORWARD_FIX", "RECOVERY_DB_STORAGE", "STAGING_E2E_V1",
  "PWA_INSTALLABILITY", "MOBILE_375_PRIMARY_FLOW", "SECURITY_CRITICAL_HIGH_ZERO", "POLICY_OD019", "POLICY_OD035", "POLICY_OD036"
] as const);

export type ReleaseEvidenceId = typeof REQUIRED_RELEASE_EVIDENCE_IDS[number];
export type ReleaseEvidenceReference = Readonly<{
  evidenceId: ReleaseEvidenceId;
  sourceKind: "APPROVAL_SNAPSHOT" | "GITHUB_ACTIONS" | "RECOVERY_DRILL" | "REVIEW_ARTIFACT" | "STAGING_RUN";
  commitSha: string;
  observedAt: string;
  sha256: string;
  canonicalSha256?: string;
  policyVersion?: string;
  runId?: string;
}>;

export interface ReleaseArtifactReader {
  read(evidenceId: ReleaseEvidenceId): Promise<Uint8Array>;
}

export type ReleaseEvaluationContext = Readonly<{
  artifacts: ReleaseArtifactReader;
  evaluatedAt: string;
  promotionSourceCommitSha: string;
}>;

export type ReleaseGateReport = Readonly<{
  schemaVersion: 1;
  status: "BLOCKED" | "READY_FOR_RELEASE_PR";
  candidateCommitSha: string | null;
  promotionSourceCommitSha: string | null;
  environmentId: string | null;
  evaluatedAt: string;
  reasonCodes: readonly string[];
  missingEvidenceIds: readonly ReleaseEvidenceId[];
  evidence: readonly ReleaseEvidenceReference[];
  userReleaseApprovalRequired: true;
}>;

const shaPattern = /^[0-9a-f]{64}$/;
const commitPattern = /^[0-9a-f]{40}$/;
const environmentPattern = /^[a-z0-9][a-z0-9-]{2,62}$/;
const stableIdPattern = /^[A-Z][A-Z0-9_.-]{2,95}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ciEvidenceIds = new Set<ReleaseEvidenceId>(REQUIRED_RELEASE_EVIDENCE_IDS.filter((id) => id.startsWith("CI_")));
const maximumArtifactBytes = 10 * 1024 * 1024;

export async function evaluateReleaseCandidate(input: unknown, context: ReleaseEvaluationContext): Promise<ReleaseGateReport> {
  try {
    return await evaluate(input, context);
  } catch {
    return blocked(context?.evaluatedAt, ["R06_INTERNAL_VALIDATION_FAILED"]);
  }
}

/** UTF-8, sorted object keys, no insignificant whitespace/newline, ISO strings unchanged and array order preserved. */
export function releaseEvidenceSha256(value: unknown): string {
  return sha256(new TextEncoder().encode(canonicalJson(value)));
}

async function evaluate(input: unknown, context: ReleaseEvaluationContext): Promise<ReleaseGateReport> {
  const evaluationTime = safeTime(context.evaluatedAt);
  const promotionSourceCommitSha = commitPattern.test(context.promotionSourceCommitSha) ? context.promotionSourceCommitSha : null;
  if (evaluationTime === null || !context.artifacts || !isRecord(input) || input.schemaVersion !== 1) {
    return blocked(context.evaluatedAt, ["R06_INPUT_INVALID"], promotionSourceCommitSha);
  }
  const candidateCommitSha = typeof input.candidateCommitSha === "string" && commitPattern.test(input.candidateCommitSha) ? input.candidateCommitSha : null;
  const environmentId = typeof input.environmentId === "string" && environmentPattern.test(input.environmentId) ? input.environmentId : null;
  const reasons = new Set<string>();
  if (candidateCommitSha === null || environmentId === null) reasons.add("R06_INPUT_INVALID");
  if (promotionSourceCommitSha === null || candidateCommitSha !== promotionSourceCommitSha) reasons.add("R06_PROMOTION_SOURCE_COMMIT_MISMATCH");

  let policies: OperationsPolicyBundle | null = null;
  try {
    policies = validateOperationsPolicyBundle(input.operationsPolicies, context.evaluatedAt);
  } catch (error) {
    reasons.add(error instanceof OperationsPolicyError && error.reasonCode === "OPERATIONS_POLICY_APPROVAL_INVALID" ? "R06_POLICY_NOT_APPROVED" : "R06_POLICY_INVALID");
  }

  const evidence = validateEvidenceMetadata(input.evidence, candidateCommitSha, evaluationTime, reasons);
  const suppliedIds = new Set(evidence.map((item) => item.evidenceId));
  const missingEvidenceIds = REQUIRED_RELEASE_EVIDENCE_IDS.filter((id) => !suppliedIds.has(id));
  if (missingEvidenceIds.length > 0) reasons.add("R06_EVIDENCE_SET_INCOMPLETE");
  const artifacts = await verifyArtifacts(evidence, context.artifacts, reasons);
  if (policies !== null) validatePolicyEvidence(evidence, artifacts, policies, reasons);
  validateStagingArtifact(evidence, artifacts, candidateCommitSha, promotionSourceCommitSha, environmentId, evaluationTime, reasons);

  if (!Array.isArray(input.openBlockerIds) || input.openBlockerIds.some((id) => typeof id !== "string" || !stableIdPattern.test(id)) || new Set(input.openBlockerIds).size !== input.openBlockerIds.length) {
    reasons.add("R06_INPUT_INVALID");
  } else if (input.openBlockerIds.length > 0) reasons.add("R06_OPEN_BLOCKERS");

  const reasonCodes = Object.freeze([...reasons].sort());
  return Object.freeze({
    schemaVersion: 1,
    status: reasonCodes.length === 0 ? "READY_FOR_RELEASE_PR" : "BLOCKED",
    candidateCommitSha,
    promotionSourceCommitSha,
    environmentId,
    evaluatedAt: new Date(evaluationTime).toISOString(),
    reasonCodes,
    missingEvidenceIds: Object.freeze(missingEvidenceIds),
    evidence: Object.freeze(evidence),
    userReleaseApprovalRequired: true
  });
}

function validateEvidenceMetadata(input: unknown, candidateCommitSha: string | null, evaluatedAt: number, reasons: Set<string>): ReleaseEvidenceReference[] {
  if (!Array.isArray(input) || input.length !== REQUIRED_RELEASE_EVIDENCE_IDS.length) {
    reasons.add("R06_EVIDENCE_CARDINALITY_INVALID");
    if (!Array.isArray(input)) return [];
  }
  const result: ReleaseEvidenceReference[] = [];
  const seen = new Set<string>();
  for (const item of input as unknown[]) {
    if (!isRecord(item) || typeof item.evidenceId !== "string" || !REQUIRED_RELEASE_EVIDENCE_IDS.includes(item.evidenceId as ReleaseEvidenceId) || seen.has(item.evidenceId)) {
      reasons.add("R06_EVIDENCE_INVALID");
      continue;
    }
    const evidenceId = item.evidenceId as ReleaseEvidenceId;
    seen.add(evidenceId);
    const observedAt = safeTime(item.observedAt);
    const sourceKind = item.sourceKind;
    const runId = item.runId;
    const policyVersion = item.policyVersion;
    const canonicalSha256 = item.canonicalSha256;
    const isPolicy = evidenceId.startsWith("POLICY_");
    const isStaging = evidenceId === "STAGING_E2E_V1";
    const validRun = sourceKind === "GITHUB_ACTIONS" ? typeof runId === "string" && /^[1-9][0-9]{0,19}$/.test(runId) : runId === undefined;
    const validPolicyVersion = isPolicy ? typeof policyVersion === "string" && /^POL-[A-Z0-9-]+-V[1-9][0-9]*$/.test(policyVersion) : policyVersion === undefined;
    const validCanonicalDigest = isStaging ? typeof canonicalSha256 === "string" && shaPattern.test(canonicalSha256) : canonicalSha256 === undefined;
    if (
      sourceKind !== expectedSource(evidenceId) || !validRun || !validPolicyVersion || !validCanonicalDigest ||
      typeof item.sha256 !== "string" || !shaPattern.test(item.sha256) || typeof item.commitSha !== "string" ||
      item.commitSha !== candidateCommitSha || observedAt === null || observedAt > evaluatedAt
    ) {
      reasons.add("R06_EVIDENCE_INVALID");
      continue;
    }
    result.push(Object.freeze({
      evidenceId,
      sourceKind,
      commitSha: item.commitSha,
      observedAt: new Date(observedAt).toISOString(),
      sha256: item.sha256,
      ...(typeof canonicalSha256 === "string" ? { canonicalSha256 } : {}),
      ...(typeof policyVersion === "string" ? { policyVersion } : {}),
      ...(typeof runId === "string" ? { runId } : {})
    }) as ReleaseEvidenceReference);
  }
  return result.sort((left, right) => REQUIRED_RELEASE_EVIDENCE_IDS.indexOf(left.evidenceId) - REQUIRED_RELEASE_EVIDENCE_IDS.indexOf(right.evidenceId));
}

async function verifyArtifacts(evidence: readonly ReleaseEvidenceReference[], reader: ReleaseArtifactReader, reasons: Set<string>): Promise<ReadonlyMap<ReleaseEvidenceId, Uint8Array>> {
  const verified = new Map<ReleaseEvidenceId, Uint8Array>();
  await Promise.all(evidence.map(async (reference) => {
    let bytes: Uint8Array;
    try {
      bytes = await reader.read(reference.evidenceId);
    } catch {
      reasons.add("R06_ARTIFACT_UNAVAILABLE");
      return;
    }
    if (bytes.byteLength === 0 || bytes.byteLength > maximumArtifactBytes) {
      reasons.add("R06_ARTIFACT_INVALID");
      return;
    }
    if (containsCredentialMaterial(bytes)) {
      reasons.add("R06_ARTIFACT_SECRET_DETECTED");
      return;
    }
    if (sha256(bytes) !== reference.sha256) {
      reasons.add("R06_ARTIFACT_DIGEST_MISMATCH");
      return;
    }
    verified.set(reference.evidenceId, bytes);
  }));
  return verified;
}

function validatePolicyEvidence(evidence: readonly ReleaseEvidenceReference[], artifacts: ReadonlyMap<ReleaseEvidenceId, Uint8Array>, policies: OperationsPolicyBundle, reasons: Set<string>): void {
  const definitions = [
    { evidenceId: "POLICY_OD019", policy: policies.mfaSession },
    { evidenceId: "POLICY_OD035", policy: policies.productionOperations },
    { evidenceId: "POLICY_OD036", policy: policies.providerSessionRevoke }
  ] as const;
  const references = new Map(evidence.map((item) => [item.evidenceId, item]));
  for (const definition of definitions) {
    const reference = references.get(definition.evidenceId);
    const bytes = artifacts.get(definition.evidenceId);
    if (reference?.policyVersion !== definition.policy.policyVersion || reference?.sha256 !== definition.policy.approval.approvalEvidenceSha256 || bytes === undefined) {
      reasons.add("R06_POLICY_EVIDENCE_MISMATCH");
      continue;
    }
    const artifact = parseJson(bytes);
    if (!policyArtifactMatches(artifact, definition.policy.decisionId, definition.policy.policyVersion, definition.policy.approval)) {
      reasons.add("R06_POLICY_EVIDENCE_MISMATCH");
      continue;
    }
    if (definition.evidenceId === "POLICY_OD036" && !validSessionRevokeBindingArtifact(artifact)) reasons.add("R06_SESSION_REVOKE_BINDING_INVALID");
  }
}

function validateStagingArtifact(
  evidence: readonly ReleaseEvidenceReference[], artifacts: ReadonlyMap<ReleaseEvidenceId, Uint8Array>,
  candidateCommitSha: string | null, promotionSourceCommitSha: string | null, environmentId: string | null,
  evaluatedAt: number, reasons: Set<string>
): void {
  const reference = evidence.find((item) => item.evidenceId === "STAGING_E2E_V1");
  const bytes = artifacts.get("STAGING_E2E_V1");
  if (!reference || !bytes) {
    reasons.add("R06_STAGING_EVIDENCE_NOT_READY");
    return;
  }
  const input = parseJson(bytes);
  if (!isRecord(input) || input.schemaVersion !== 1 || input.status !== "READY" || input.environmentKind !== "STAGING" || input.credentialEvidence !== "LIVE_CREDENTIALS_VERIFIED") {
    reasons.add("R06_STAGING_EVIDENCE_NOT_READY");
    return;
  }
  if (input.commitSha !== candidateCommitSha || input.commitSha !== promotionSourceCommitSha || input.environmentId !== environmentId || releaseEvidenceSha256(input) !== reference.canonicalSha256) {
    reasons.add("R06_STAGING_EVIDENCE_MISMATCH");
  }
  const startedAt = safeTime(input.startedAt);
  const completedAt = safeTime(input.completedAt);
  if (startedAt === null || completedAt === null || completedAt < startedAt || completedAt > evaluatedAt) reasons.add("R06_STAGING_EVIDENCE_MISMATCH");
  if (!validReadiness(input.readiness)) reasons.add("R06_STAGING_EVIDENCE_NOT_READY");
  if (!Array.isArray(input.checks) || input.checks.length !== REQUIRED_STAGING_CHECK_IDS.length) {
    reasons.add("R06_STAGING_EVIDENCE_NOT_READY");
    return;
  }
  const checks = new Set<string>();
  for (const check of input.checks) {
    if (!isRecord(check) || typeof check.checkId !== "string" || !REQUIRED_STAGING_CHECK_IDS.includes(check.checkId as never) || checks.has(check.checkId) || check.status !== "PASS" || typeof check.evidenceSha256 !== "string" || !shaPattern.test(check.evidenceSha256)) {
      reasons.add("R06_STAGING_EVIDENCE_NOT_READY");
      return;
    }
    checks.add(check.checkId);
  }
  if (REQUIRED_STAGING_CHECK_IDS.some((id) => !checks.has(id)) || !validArtifactDigests(input.artifactDigests)) reasons.add("R06_STAGING_EVIDENCE_NOT_READY");
}

function validReadiness(input: unknown): boolean {
  if (!isRecord(input) || input.status !== "ready" || !Array.isArray(input.components) || input.components.length !== DEPLOYMENT_COMPONENT_IDS.length) return false;
  const components = new Set<string>();
  for (const component of input.components) {
    if (!isRecord(component) || typeof component.componentId !== "string" || !DEPLOYMENT_COMPONENT_IDS.includes(component.componentId as never) || components.has(component.componentId) || component.status !== "ready" || component.reasonCode !== undefined) return false;
    components.add(component.componentId);
  }
  return DEPLOYMENT_COMPONENT_IDS.every((id) => components.has(id));
}

function validArtifactDigests(input: unknown): boolean {
  if (!Array.isArray(input) || input.length === 0) return false;
  const ids = new Set<string>();
  return input.every((artifact) => {
    if (!isRecord(artifact) || typeof artifact.artifactId !== "string" || !stableIdPattern.test(artifact.artifactId) || ids.has(artifact.artifactId) || typeof artifact.sha256 !== "string" || !shaPattern.test(artifact.sha256)) return false;
    ids.add(artifact.artifactId);
    return true;
  });
}

function policyArtifactMatches(input: unknown, decisionId: string, policyVersion: string, approval: PolicyApproval): boolean {
  if (!isRecord(input) || input.schemaVersion !== 1 || input.decisionId !== decisionId || input.policyVersion !== policyVersion || !isRecord(input.approval)) return false;
  return input.approval.status === approval.status && input.approval.createdAt === approval.createdAt && input.approval.approvedAt === approval.approvedAt &&
    input.approval.effectiveFrom === approval.effectiveFrom && input.approval.approvedByActorId === approval.approvedByActorId && input.approval.revokedAt === null;
}

function validSessionRevokeBindingArtifact(input: unknown): boolean {
  if (!isRecord(input) || !isRecord(input.targetSessionBinding)) return false;
  const binding = input.targetSessionBinding;
  return binding.verificationResult === "PASS" && binding.targetResolutionSource === "TRUSTED_RESOURCE_CONTEXT" &&
    typeof binding.trustedTargetUserId === "string" && uuidPattern.test(binding.trustedTargetUserId) &&
    equalDigests(binding.trustedAuthSubjectSha256, binding.jwtSubjectSha256, binding.activeSessionSubjectSha256) &&
    typeof binding.jwtSessionId === "string" && uuidPattern.test(binding.jwtSessionId) && binding.activeSessionId === binding.jwtSessionId &&
    equalDigests(binding.jwtIssuerSha256, binding.configuredIssuerSha256) && binding.globalSignOutScope === "global" &&
    binding.nextRequestSessionResolution === "DENIED_AFTER_REVOKE" && binding.residualAccessTokenRisk === "ACKNOWLEDGED";
}

function equalDigests(...values: unknown[]): boolean {
  return values.every((value) => typeof value === "string" && shaPattern.test(value) && value === values[0]);
}

function expectedSource(evidenceId: ReleaseEvidenceId): ReleaseEvidenceReference["sourceKind"] {
  if (ciEvidenceIds.has(evidenceId)) return "GITHUB_ACTIONS";
  if (evidenceId.startsWith("POLICY_")) return "APPROVAL_SNAPSHOT";
  if (evidenceId === "RECOVERY_DB_STORAGE") return "RECOVERY_DRILL";
  if (evidenceId === "STAGING_E2E_V1") return "STAGING_RUN";
  return "REVIEW_ARTIFACT";
}

function blocked(evaluatedAt: string | undefined, reasonCodes: readonly string[], promotionSourceCommitSha: string | null = null): ReleaseGateReport {
  const time = safeTime(evaluatedAt) ?? 0;
  return Object.freeze({ schemaVersion: 1, status: "BLOCKED", candidateCommitSha: null, promotionSourceCommitSha, environmentId: null,
    evaluatedAt: new Date(time).toISOString(), reasonCodes: Object.freeze([...reasonCodes]), missingEvidenceIds: REQUIRED_RELEASE_EVIDENCE_IDS,
    evidence: Object.freeze([]), userReleaseApprovalRequired: true });
}

function containsCredentialMaterial(bytes: Uint8Array): boolean {
  const text = new TextDecoder("utf-8").decode(bytes);
  return /authorization\s*:\s*bearer|sb_secret_|postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@|"(?:accessToken|cookie|password|requestBody|signedUrl|objectKey|connectionString)"\s*:/i.test(text);
}

function parseJson(bytes: Uint8Array): unknown {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return null; }
}

function sha256(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function safeTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : null;
}
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("R06_CANONICAL_EVIDENCE_INVALID"); return JSON.stringify(value); }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  throw new Error("R06_CANONICAL_EVIDENCE_INVALID");
}
