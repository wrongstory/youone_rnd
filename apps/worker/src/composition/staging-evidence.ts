import type { DeploymentReadiness } from "./deployment-readiness.js";

export const REQUIRED_STAGING_CHECK_IDS = Object.freeze([
  "AUTH_INTERNAL_ACTIVE",
  "AUTH_VENDOR_ACTIVE",
  "AUTH_DISABLED_DENY",
  "AUTH_EXPIRED_DENY",
  "VENDOR_CROSS_SCOPE_DENY",
  "VENDOR_FORBIDDEN_FIELD_REDACTION",
  "EVIDENCE_IMMUTABILITY",
  "APPROVAL_CONCURRENCY",
  "OFFLINE_CONFLICT_NO_OVERWRITE",
  "CORRELATION_HTTP_APPLICATION_DB_WORKER",
  "SECRETLESS_LOGGING",
  "READINESS_FAILURE_MATRIX",
  "PWA_INSTALLABILITY",
  "MOBILE_375_PRIMARY_FLOW",
  "PRIVATE_STORAGE_RESTORE"
] as const);

export type StagingCheckId = typeof REQUIRED_STAGING_CHECK_IDS[number];
export type StagingCheckResult = Readonly<{
  checkId: StagingCheckId;
  evidenceSha256?: string;
  reasonCode?: string;
  status: "BLOCKED" | "FAIL" | "PASS";
}>;

export type StagingEvidence = Readonly<{
  schemaVersion: 1;
  status: "BLOCKED" | "NOT_READY" | "READY";
  environmentKind: "STAGING";
  environmentId: string;
  commitSha: string;
  correlationId: string;
  startedAt: string;
  completedAt: string;
  credentialEvidence: "LIVE_CREDENTIALS_VERIFIED" | "NOT_VERIFIED";
  readiness: DeploymentReadiness;
  checks: readonly StagingCheckResult[];
  artifactDigests: readonly Readonly<{ artifactId: string; sha256: string }>[];
}>;

const shaPattern = /^[0-9a-f]{64}$/;
const commitPattern = /^[0-9a-f]{40}$/;
const stablePattern = /^[A-Z][A-Z0-9_]{2,95}$/;
const environmentPattern = /^[a-z0-9][a-z0-9-]{2,62}$/;
const correlationPattern = /^staging:[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

export function createStagingEvidence(input: Readonly<{
  artifactDigests?: readonly Readonly<{ artifactId: string; sha256: string }>[];
  checks: readonly StagingCheckResult[];
  commitSha: string;
  completedAt: string;
  correlationId: string;
  credentialEvidence: StagingEvidence["credentialEvidence"];
  environmentId: string;
  readiness: DeploymentReadiness;
  startedAt: string;
}>): StagingEvidence {
  if (!commitPattern.test(input.commitSha)) throw new Error("STAGING_COMMIT_SHA_INVALID");
  if (!environmentPattern.test(input.environmentId)) throw new Error("STAGING_ENVIRONMENT_ID_INVALID");
  if (!correlationPattern.test(input.correlationId)) throw new Error("STAGING_CORRELATION_ID_INVALID");
  const started = Date.parse(input.startedAt);
  const completed = Date.parse(input.completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) throw new Error("STAGING_TIME_RANGE_INVALID");

  const supplied = new Map<StagingCheckId, StagingCheckResult>();
  for (const check of input.checks) {
    if (!REQUIRED_STAGING_CHECK_IDS.includes(check.checkId) || supplied.has(check.checkId)) throw new Error("STAGING_CHECK_SET_INVALID");
    if (check.status === "PASS" && (check.evidenceSha256 === undefined || !shaPattern.test(check.evidenceSha256))) {
      throw new Error("STAGING_CHECK_EVIDENCE_INVALID");
    }
    if (check.status !== "PASS" && (check.reasonCode === undefined || !stablePattern.test(check.reasonCode))) {
      throw new Error("STAGING_CHECK_REASON_INVALID");
    }
    supplied.set(check.checkId, check);
  }
  const checks = REQUIRED_STAGING_CHECK_IDS.map((checkId): StagingCheckResult => {
    const check = supplied.get(checkId);
    if (!check) return Object.freeze({ checkId, status: "BLOCKED", reasonCode: "STAGING_CHECK_NOT_EXECUTED" });
    return Object.freeze({
      checkId,
      status: check.status,
      ...(check.evidenceSha256 ? { evidenceSha256: check.evidenceSha256 } : {}),
      ...(check.reasonCode ? { reasonCode: check.reasonCode } : {})
    });
  });
  const artifacts = (input.artifactDigests ?? []).map((artifact) => {
    if (!/^[A-Z][A-Z0-9_.-]{2,95}$/.test(artifact.artifactId) || !shaPattern.test(artifact.sha256)) {
      throw new Error("STAGING_ARTIFACT_DIGEST_INVALID");
    }
    return Object.freeze({ artifactId: artifact.artifactId, sha256: artifact.sha256 });
  });
  if (new Set(artifacts.map((artifact) => artifact.artifactId)).size !== artifacts.length) {
    throw new Error("STAGING_ARTIFACT_SET_INVALID");
  }

  const hasFailure = checks.some((check) => check.status === "FAIL");
  const hasBlocked = checks.some((check) => check.status === "BLOCKED");
  const ready = input.readiness.status === "ready"
    && input.credentialEvidence === "LIVE_CREDENTIALS_VERIFIED"
    && !hasFailure
    && !hasBlocked
    && artifacts.length > 0;
  const status = ready
    ? "READY"
    : input.readiness.status === "not_ready" || hasFailure
      ? "NOT_READY"
      : "BLOCKED";
  return Object.freeze({
    schemaVersion: 1,
    status,
    environmentKind: "STAGING",
    environmentId: input.environmentId,
    commitSha: input.commitSha,
    correlationId: input.correlationId,
    startedAt: new Date(started).toISOString(),
    completedAt: new Date(completed).toISOString(),
    credentialEvidence: input.credentialEvidence,
    readiness: input.readiness,
    checks: Object.freeze(checks),
    artifactDigests: Object.freeze(artifacts)
  });
}
