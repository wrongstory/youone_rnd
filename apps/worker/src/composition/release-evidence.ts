import { createHash } from "node:crypto";

import { OperationsPolicyError, validateOperationsPolicyBundle } from "./operations-policy.js";
import { DEPLOYMENT_COMPONENT_IDS } from "./deployment-readiness.js";
import { REQUIRED_STAGING_CHECK_IDS } from "./staging-evidence.js";

export const REQUIRED_RELEASE_EVIDENCE_IDS = Object.freeze([
  "CI_QUALITY",
  "CI_M07",
  "CI_M08",
  "CI_M09",
  "CI_M10",
  "CI_M11",
  "CI_M12",
  "CI_M13",
  "CI_M14",
  "CI_M15",
  "CI_M16",
  "CI_R01",
  "CI_R02",
  "CI_R03",
  "CI_R04",
  "CI_R05",
  "MIGRATION_CLEAN",
  "MIGRATION_UPGRADE",
  "MIGRATION_ROLLBACK_FORWARD_FIX",
  "RECOVERY_DB_STORAGE",
  "STAGING_E2E_V1",
  "PWA_INSTALLABILITY",
  "MOBILE_375_PRIMARY_FLOW",
  "SECURITY_CRITICAL_HIGH_ZERO",
  "POLICY_OD019",
  "POLICY_OD035",
  "POLICY_OD036"
] as const);

export type ReleaseEvidenceId = typeof REQUIRED_RELEASE_EVIDENCE_IDS[number];
export type ReleaseEvidenceReference = Readonly<{
  evidenceId: ReleaseEvidenceId;
  sourceKind: "APPROVAL_SNAPSHOT" | "GITHUB_ACTIONS" | "RECOVERY_DRILL" | "REVIEW_ARTIFACT" | "STAGING_RUN";
  commitSha: string;
  observedAt: string;
  sha256: string;
  runId?: string;
}>;

export type ReleaseGateReport = Readonly<{
  schemaVersion: 1;
  status: "BLOCKED" | "READY_FOR_RELEASE_PR";
  candidateCommitSha: string | null;
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
const stableBlockerPattern = /^[A-Z][A-Z0-9_.-]{2,95}$/;
const ciEvidenceIds = new Set<ReleaseEvidenceId>(REQUIRED_RELEASE_EVIDENCE_IDS.filter((id) => id.startsWith("CI_")));

export function evaluateReleaseCandidate(input: unknown, evaluatedAt = new Date().toISOString()): ReleaseGateReport {
  const evaluationTime = canonicalTime(evaluatedAt);
  if (!isRecord(input) || input.schemaVersion !== 1) return blocked(evaluatedAt, ["R06_INPUT_INVALID"]);
  const candidateCommitSha = typeof input.candidateCommitSha === "string" && commitPattern.test(input.candidateCommitSha) ? input.candidateCommitSha : null;
  const environmentId = typeof input.environmentId === "string" && environmentPattern.test(input.environmentId) ? input.environmentId : null;
  const reasons = new Set<string>();
  if (candidateCommitSha === null || environmentId === null) reasons.add("R06_INPUT_INVALID");

  let policyApprovalDigests: Readonly<Record<string, string>> | null = null;
  try {
    const policies = validateOperationsPolicyBundle(input.operationsPolicies, evaluatedAt);
    policyApprovalDigests = Object.freeze({
      POLICY_OD019: policies.mfaSession.approval.approvalEvidenceSha256,
      POLICY_OD035: policies.productionOperations.approval.approvalEvidenceSha256,
      POLICY_OD036: policies.providerSessionRevoke.approval.approvalEvidenceSha256
    });
  } catch (error) {
    reasons.add(error instanceof OperationsPolicyError && error.reasonCode === "OPERATIONS_POLICY_APPROVAL_INVALID"
      ? "R06_POLICY_NOT_APPROVED"
      : "R06_POLICY_INVALID");
  }

  const evidence = validateEvidence(input.evidence, candidateCommitSha, evaluationTime, reasons);
  const suppliedIds = new Set(evidence.map((item) => item.evidenceId));
  const missingEvidenceIds = REQUIRED_RELEASE_EVIDENCE_IDS.filter((id) => !suppliedIds.has(id));
  if (missingEvidenceIds.length > 0) reasons.add("R06_EVIDENCE_SET_INCOMPLETE");
  validateEvidenceLinkage(evidence, policyApprovalDigests, input.stagingEvidenceSha256, reasons);
  validateStagingEvidence(input.stagingEvidence, input.stagingEvidenceSha256, candidateCommitSha, environmentId, evaluationTime, reasons);

  if (!Array.isArray(input.openBlockerIds) || input.openBlockerIds.some((id) => typeof id !== "string" || !stableBlockerPattern.test(id)) || new Set(input.openBlockerIds).size !== input.openBlockerIds.length) {
    reasons.add("R06_INPUT_INVALID");
  } else if (input.openBlockerIds.length > 0) {
    reasons.add("R06_OPEN_BLOCKERS");
  }

  const reasonCodes = Object.freeze([...reasons].sort());
  return Object.freeze({
    schemaVersion: 1,
    status: reasonCodes.length === 0 ? "READY_FOR_RELEASE_PR" : "BLOCKED",
    candidateCommitSha,
    environmentId,
    evaluatedAt: new Date(evaluationTime).toISOString(),
    reasonCodes,
    missingEvidenceIds: Object.freeze(missingEvidenceIds),
    evidence: Object.freeze(evidence),
    userReleaseApprovalRequired: true
  });
}

/** Digest embedded evidence with deterministic key ordering rather than caller JSON formatting. */
export function releaseEvidenceSha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function validateEvidence(input: unknown, candidateCommitSha: string | null, evaluatedAt: number, reasons: Set<string>): ReleaseEvidenceReference[] {
  if (!Array.isArray(input)) {
    reasons.add("R06_EVIDENCE_SET_INCOMPLETE");
    return [];
  }
  const result: ReleaseEvidenceReference[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!isRecord(item) || typeof item.evidenceId !== "string" || !REQUIRED_RELEASE_EVIDENCE_IDS.includes(item.evidenceId as ReleaseEvidenceId) || seen.has(item.evidenceId)) {
      reasons.add("R06_EVIDENCE_INVALID");
      continue;
    }
    const evidenceId = item.evidenceId as ReleaseEvidenceId;
    seen.add(evidenceId);
    const observedAt = safeTime(item.observedAt);
    const sourceKind = item.sourceKind;
    const runId = item.runId;
    const validSource = sourceKind === expectedSource(evidenceId);
    const validRun = sourceKind === "GITHUB_ACTIONS" ? typeof runId === "string" && /^[1-9][0-9]{0,19}$/.test(runId) : runId === undefined;
    if (
      !validSource || !validRun || typeof item.sha256 !== "string" || !shaPattern.test(item.sha256) ||
      typeof item.commitSha !== "string" || item.commitSha !== candidateCommitSha || observedAt === null || observedAt > evaluatedAt
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
      ...(typeof runId === "string" ? { runId } : {})
    }) as ReleaseEvidenceReference);
  }
  return result.sort((left, right) => REQUIRED_RELEASE_EVIDENCE_IDS.indexOf(left.evidenceId) - REQUIRED_RELEASE_EVIDENCE_IDS.indexOf(right.evidenceId));
}

function validateEvidenceLinkage(
  evidence: readonly ReleaseEvidenceReference[],
  policyApprovalDigests: Readonly<Record<string, string>> | null,
  stagingEvidenceSha256: unknown,
  reasons: Set<string>
): void {
  const byId = new Map(evidence.map((item) => [item.evidenceId, item]));
  if (policyApprovalDigests !== null) {
    for (const evidenceId of ["POLICY_OD019", "POLICY_OD035", "POLICY_OD036"] as const) {
      if (byId.get(evidenceId)?.sha256 !== policyApprovalDigests[evidenceId]) reasons.add("R06_EVIDENCE_LINKAGE_INVALID");
    }
  }
  if (typeof stagingEvidenceSha256 === "string" && byId.get("STAGING_E2E_V1")?.sha256 !== stagingEvidenceSha256) {
    reasons.add("R06_EVIDENCE_LINKAGE_INVALID");
  }
}

function validateStagingEvidence(input: unknown, digest: unknown, candidateCommitSha: string | null, environmentId: string | null, evaluatedAt: number, reasons: Set<string>): void {
  if (!isRecord(input) || input.schemaVersion !== 1 || input.status !== "READY" || input.credentialEvidence !== "LIVE_CREDENTIALS_VERIFIED") {
    reasons.add("R06_STAGING_EVIDENCE_NOT_READY");
    return;
  }
  if (input.commitSha !== candidateCommitSha || input.environmentId !== environmentId || typeof digest !== "string" || !shaPattern.test(digest)) {
    reasons.add("R06_STAGING_EVIDENCE_MISMATCH");
  } else {
    try {
      if (releaseEvidenceSha256(input) !== digest) reasons.add("R06_STAGING_EVIDENCE_MISMATCH");
    } catch {
      reasons.add("R06_STAGING_EVIDENCE_MISMATCH");
    }
  }
  const startedAt = safeTime(input.startedAt);
  const completedAt = safeTime(input.completedAt);
  if (startedAt === null || completedAt === null || completedAt < startedAt || completedAt > evaluatedAt) {
    reasons.add("R06_STAGING_EVIDENCE_MISMATCH");
  }
  if (!isRecord(input.readiness) || input.readiness.status !== "ready" || !Array.isArray(input.readiness.components) || input.readiness.components.length !== DEPLOYMENT_COMPONENT_IDS.length) {
    reasons.add("R06_STAGING_EVIDENCE_NOT_READY");
  } else {
    const components = new Set<string>();
    for (const component of input.readiness.components) {
      if (!isRecord(component) || typeof component.componentId !== "string" || !DEPLOYMENT_COMPONENT_IDS.includes(component.componentId as never) || components.has(component.componentId) || component.status !== "ready" || component.reasonCode !== undefined) {
        reasons.add("R06_STAGING_EVIDENCE_NOT_READY");
        break;
      }
      components.add(component.componentId);
    }
    if (DEPLOYMENT_COMPONENT_IDS.some((id) => !components.has(id))) reasons.add("R06_STAGING_EVIDENCE_NOT_READY");
  }
  if (!Array.isArray(input.checks) || input.checks.length !== REQUIRED_STAGING_CHECK_IDS.length) {
    reasons.add("R06_STAGING_EVIDENCE_NOT_READY");
    return;
  }
  const checks = new Map<string, unknown>();
  for (const check of input.checks) {
    if (!isRecord(check) || typeof check.checkId !== "string" || checks.has(check.checkId) || check.status !== "PASS" || typeof check.evidenceSha256 !== "string" || !shaPattern.test(check.evidenceSha256)) {
      reasons.add("R06_STAGING_EVIDENCE_NOT_READY");
      return;
    }
    checks.set(check.checkId, check);
  }
  if (REQUIRED_STAGING_CHECK_IDS.some((id) => !checks.has(id)) || !Array.isArray(input.artifactDigests) || input.artifactDigests.length === 0) {
    reasons.add("R06_STAGING_EVIDENCE_NOT_READY");
    return;
  }
  const artifactIds = new Set<string>();
  for (const artifact of input.artifactDigests) {
    if (!isRecord(artifact) || typeof artifact.artifactId !== "string" || !stableBlockerPattern.test(artifact.artifactId) || artifactIds.has(artifact.artifactId) || typeof artifact.sha256 !== "string" || !shaPattern.test(artifact.sha256)) {
      reasons.add("R06_STAGING_EVIDENCE_NOT_READY");
      return;
    }
    artifactIds.add(artifact.artifactId);
  }
}

function expectedSource(evidenceId: ReleaseEvidenceId): ReleaseEvidenceReference["sourceKind"] {
  if (ciEvidenceIds.has(evidenceId)) return "GITHUB_ACTIONS";
  if (evidenceId.startsWith("POLICY_")) return "APPROVAL_SNAPSHOT";
  if (evidenceId === "RECOVERY_DB_STORAGE") return "RECOVERY_DRILL";
  if (evidenceId === "STAGING_E2E_V1") return "STAGING_RUN";
  return "REVIEW_ARTIFACT";
}

function blocked(evaluatedAt: string, reasonCodes: readonly string[]): ReleaseGateReport {
  const time = safeTime(evaluatedAt) ?? 0;
  return Object.freeze({
    schemaVersion: 1,
    status: "BLOCKED",
    candidateCommitSha: null,
    environmentId: null,
    evaluatedAt: new Date(time).toISOString(),
    reasonCodes: Object.freeze([...reasonCodes]),
    missingEvidenceIds: REQUIRED_RELEASE_EVIDENCE_IDS,
    evidence: Object.freeze([]),
    userReleaseApprovalRequired: true
  });
}

function canonicalTime(value: string): number {
  const time = safeTime(value);
  return time ?? 0;
}

function safeTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("R06_CANONICAL_EVIDENCE_INVALID");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new Error("R06_CANONICAL_EVIDENCE_INVALID");
}
