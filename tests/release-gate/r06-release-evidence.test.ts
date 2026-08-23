import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  OperationsPolicyError,
  validateOperationsPolicyBundle
} from "../../apps/worker/src/composition/operations-policy.js";
import {
  evaluateReleaseCandidate,
  releaseEvidenceSha256,
  REQUIRED_RELEASE_EVIDENCE_IDS,
  type ReleaseEvidenceId
} from "../../apps/worker/src/composition/release-evidence.js";
import { REQUIRED_STAGING_CHECK_IDS } from "../../apps/worker/src/composition/staging-evidence.js";

const digest = createHash("sha256").update("r06-evidence").digest("hex");
const commitSha = "b".repeat(40);
const approvedAt = "2026-08-23T12:00:00.000Z";
const effectiveFrom = "2026-08-23T12:01:00.000Z";
const evaluatedAt = "2026-08-23T13:00:00.000Z";
const approver = "16000000-0000-4000-8000-000000000001";

function approval() {
  return { status: "APPROVED", approvedAt, effectiveFrom, approvedByActorId: approver, approvalEvidenceSha256: digest };
}

function policies() {
  return {
    schemaVersion: 1,
    mfaSession: {
      decisionId: "OD-019-MFA-SESSION",
      policyVersion: "POL-MFA-SESSION-V1",
      approval: approval(),
      mfa: {
        requiredActorKinds: ["INTERNAL", "VENDOR"],
        requiredActionIds: ["APPROVAL_FINAL_ACTION", "TECHNICAL_COPY_RELEASE"],
        factorTypes: ["TOTP"],
        requiredAssuranceLevel: "aal2"
      },
      session: { jwtExpiryMinutes: 60, timeboxMinutes: 480, inactivityMinutes: 60, singleSessionPerUser: true },
      device: { newDeviceReauthentication: true, managedDeviceRequiredForActionIds: ["TECHNICAL_SOURCE_READ"] }
    },
    productionOperations: {
      decisionId: "OD-035-PRODUCTION-OPERATIONS",
      policyVersion: "POL-PRODUCTION-OPERATIONS-V1",
      approval: approval(),
      recoveryObjectives: { rpoMinutes: 60, rtoMinutes: 240 },
      databaseBackup: { cadenceMinutes: 60, retentionDays: 30 },
      storageBackup: { cadenceMinutes: 60, retentionDays: 30 },
      monitoringDestinationIds: ["MONITORING_SECURITY_CHANNEL"],
      incidentOwnerActorIds: [approver],
      recoveryApproverActorIds: ["16000000-0000-4000-8000-000000000002"],
      evidenceLocationId: "OPERATIONS_EVIDENCE_VAULT"
    },
    providerSessionRevoke: {
      decisionId: "OD-036-SUPABASE-SESSION-REVOKE",
      policyVersion: "POL-SUPABASE-SESSION-REVOKE-V1",
      approval: approval(),
      mechanism: "SUPABASE_GLOBAL_SIGN_OUT_WITH_TARGET_JWT",
      scope: "global",
      applicationSessionCheck: "EXACT_AUTH_SESSIONS_ROW_EVERY_REQUEST",
      maximumResidualAccessTokenMinutes: 60,
      retryAttempts: 3,
      reconciliationIntervalMinutes: 5,
      limitationsAcknowledged: ["ACCESS_TOKEN_VALID_UNTIL_EXPIRY", "TARGET_USER_JWT_REQUIRED"]
    }
  };
}

function sourceKind(evidenceId: ReleaseEvidenceId) {
  if (evidenceId.startsWith("CI_")) return "GITHUB_ACTIONS";
  if (evidenceId.startsWith("POLICY_")) return "APPROVAL_SNAPSHOT";
  if (evidenceId === "RECOVERY_DB_STORAGE") return "RECOVERY_DRILL";
  if (evidenceId === "STAGING_E2E_V1") return "STAGING_RUN";
  return "REVIEW_ARTIFACT";
}

function evidence() {
  return REQUIRED_RELEASE_EVIDENCE_IDS.map((evidenceId) => ({
    evidenceId,
    sourceKind: sourceKind(evidenceId),
    commitSha,
    observedAt: "2026-08-23T12:30:00.000Z",
    sha256: digest,
    ...(evidenceId.startsWith("CI_") ? { runId: "32628895773" } : {})
  }));
}

function stagingEvidence(status: "BLOCKED" | "READY" = "READY") {
  return {
    schemaVersion: 1,
    status,
    environmentKind: "STAGING",
    environmentId: "youone-staging",
    commitSha,
    correlationId: "staging:r06",
    startedAt: approvedAt,
    completedAt: "2026-08-23T12:30:00.000Z",
    credentialEvidence: status === "READY" ? "LIVE_CREDENTIALS_VERIFIED" : "NOT_VERIFIED",
    readiness: {
      status: "ready",
      components: [
        "web.database",
        "web.request-auth",
        "web.offline-sync",
        "worker.database",
        "worker.private-storage"
      ].map((componentId) => ({ componentId, status: "ready" }))
    },
    checks: REQUIRED_STAGING_CHECK_IDS.map((checkId) => ({ checkId, status: "PASS", evidenceSha256: digest })),
    artifactDigests: [{ artifactId: "R06_STAGING_PACKET", sha256: digest }]
  };
}

function candidate() {
  const staging = stagingEvidence();
  const stagingDigest = releaseEvidenceSha256(staging);
  return {
    schemaVersion: 1,
    candidateCommitSha: commitSha,
    environmentId: "youone-staging",
    operationsPolicies: policies(),
    evidence: evidence().map((item) => item.evidenceId === "STAGING_E2E_V1" ? { ...item, sha256: stagingDigest } : item),
    stagingEvidence: staging,
    stagingEvidenceSha256: stagingDigest,
    openBlockerIds: []
  };
}

describe("R06 versioned operations policies", () => {
  it("accepts only complete, approved and currently effective policy values", () => {
    const result = validateOperationsPolicyBundle(policies(), evaluatedAt);
    expect(result.mfaSession.session.jwtExpiryMinutes).toBe(60);
    expect(result.productionOperations.databaseBackup.cadenceMinutes).toBeLessThanOrEqual(result.productionOperations.recoveryObjectives.rpoMinutes);
    expect(result.providerSessionRevoke.limitationsAcknowledged).toHaveLength(2);
  });

  it("rejects pending approval, future activation, duplicate values and unsafe recovery cadence", () => {
    const pending = policies();
    pending.mfaSession.approval.status = "PENDING";
    expect(() => validateOperationsPolicyBundle(pending, evaluatedAt)).toThrowError(OperationsPolicyError);

    const future = policies();
    future.productionOperations.approval.effectiveFrom = "2026-08-24T00:00:00.000Z";
    expect(() => validateOperationsPolicyBundle(future, evaluatedAt)).toThrowError(OperationsPolicyError);

    const duplicate = policies();
    duplicate.mfaSession.mfa.factorTypes = ["TOTP", "TOTP"];
    expect(() => validateOperationsPolicyBundle(duplicate, evaluatedAt)).toThrowError(OperationsPolicyError);

    const unsafeCadence = policies();
    unsafeCadence.productionOperations.databaseBackup.cadenceMinutes = 120;
    expect(() => validateOperationsPolicyBundle(unsafeCadence, evaluatedAt)).toThrowError(OperationsPolicyError);
  });
});

describe("R06 release evidence gate", () => {
  it("returns READY_FOR_RELEASE_PR only for the exact approved policy and evidence set", () => {
    const result = evaluateReleaseCandidate(candidate(), evaluatedAt);
    expect(result).toMatchObject({
      status: "READY_FOR_RELEASE_PR",
      candidateCommitSha: commitSha,
      environmentId: "youone-staging",
      reasonCodes: [],
      missingEvidenceIds: [],
      userReleaseApprovalRequired: true
    });
    expect(result.evidence.map((item) => item.evidenceId)).toEqual(REQUIRED_RELEASE_EVIDENCE_IDS);
  });

  it("blocks repository-only or partial evidence and identifies every missing stable ID", () => {
    const input = candidate();
    input.evidence = input.evidence.slice(0, 2);
    input.stagingEvidence = stagingEvidence("BLOCKED");
    const result = evaluateReleaseCandidate(input, evaluatedAt);
    expect(result.status).toBe("BLOCKED");
    expect(result.reasonCodes).toEqual(expect.arrayContaining(["R06_EVIDENCE_SET_INCOMPLETE", "R06_STAGING_EVIDENCE_NOT_READY"]));
    expect(result.missingEvidenceIds).toHaveLength(REQUIRED_RELEASE_EVIDENCE_IDS.length - 2);
  });

  it("blocks commit mismatch and unresolved activation blockers", () => {
    const input = candidate();
    input.evidence[0] = { ...input.evidence[0], commitSha: "c".repeat(40) };
    input.openBlockerIds = ["OD_036_UNRESOLVED"];
    const result = evaluateReleaseCandidate(input, evaluatedAt);
    expect(result.status).toBe("BLOCKED");
    expect(result.reasonCodes).toEqual(expect.arrayContaining(["R06_EVIDENCE_INVALID", "R06_OPEN_BLOCKERS"]));
  });

  it("blocks an embedded Staging packet whose canonical digest does not match", () => {
    const input = candidate();
    input.stagingEvidenceSha256 = digest;
    const result = evaluateReleaseCandidate(input, evaluatedAt);
    expect(result.status).toBe("BLOCKED");
    expect(result.reasonCodes).toContain("R06_STAGING_EVIDENCE_MISMATCH");
  });

  it("never serializes supplied secrets, URLs or provider payloads", () => {
    const input = {
      ...candidate(),
      accessToken: "secret-access-token",
      signedUrl: "https://signed.invalid/private",
      requestBody: { confidential: true },
      evidence: evidence().map((item) => ({ ...item, cookie: "secret-cookie", objectKey: "private/document.pdf" }))
    };
    const serialized = JSON.stringify(evaluateReleaseCandidate(input, evaluatedAt));
    expect(serialized).not.toMatch(/secret-access-token|signed\.invalid|confidential|secret-cookie|private\/document/);
  });
});
