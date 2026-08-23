import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { OperationsPolicyError, validateOperationsPolicyBundle } from "../../apps/worker/src/composition/operations-policy.js";
import {
  evaluateReleaseCandidate,
  releaseEvidenceSha256,
  REQUIRED_RELEASE_EVIDENCE_IDS,
  type ReleaseArtifactReader,
  type ReleaseEvidenceId
} from "../../apps/worker/src/composition/release-evidence.js";
import { REQUIRED_STAGING_CHECK_IDS } from "../../apps/worker/src/composition/staging-evidence.js";

const commitSha = "b".repeat(40);
const createdAt = "2026-08-23T11:00:00.000Z";
const approvedAt = "2026-08-23T12:00:00.000Z";
const effectiveFrom = "2026-08-23T12:01:00.000Z";
const evaluatedAt = "2026-08-23T13:00:00.000Z";
const approver = "16000000-0000-4000-8000-000000000001";
const sessionId = "16000000-0000-4000-8000-000000000009";
const subjectDigest = digest("target-subject");
const issuerDigest = digest("https://tenant.supabase.co/auth/v1");

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function approval(approvalEvidenceSha256: string) {
  return { status: "APPROVED", createdAt, approvedAt, effectiveFrom, approvedByActorId: approver, approvalEvidenceSha256, revokedAt: null };
}

function approvalArtifact(decisionId: string, policyVersion: string, includeBinding = false) {
  return {
    schemaVersion: 1,
    decisionId,
    policyVersion,
    approval: { status: "APPROVED", createdAt, approvedAt, effectiveFrom, approvedByActorId: approver, revokedAt: null },
    ...(includeBinding ? {
      targetSessionBinding: {
        verificationResult: "PASS",
        targetResolutionSource: "TRUSTED_RESOURCE_CONTEXT",
        trustedTargetUserId: "16000000-0000-4000-8000-000000000002",
        trustedAuthSubjectSha256: subjectDigest,
        jwtSubjectSha256: subjectDigest,
        activeSessionSubjectSha256: subjectDigest,
        jwtSessionId: sessionId,
        activeSessionId: sessionId,
        jwtIssuerSha256: issuerDigest,
        configuredIssuerSha256: issuerDigest,
        globalSignOutScope: "global",
        nextRequestSessionResolution: "DENIED_AFTER_REVOKE",
        residualAccessTokenRisk: "ACKNOWLEDGED"
      }
    } : {})
  };
}

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
}

function stagingEvidence(candidate = commitSha) {
  return {
    schemaVersion: 1,
    status: "READY",
    environmentKind: "STAGING",
    environmentId: "youone-staging",
    commitSha: candidate,
    correlationId: "staging:r06",
    startedAt: approvedAt,
    completedAt: "2026-08-23T12:30:00.000Z",
    credentialEvidence: "LIVE_CREDENTIALS_VERIFIED",
    readiness: {
      status: "ready",
      components: ["web.database", "web.request-auth", "web.offline-sync", "worker.database", "worker.private-storage"]
        .map((componentId) => ({ componentId, status: "ready" }))
    },
    checks: REQUIRED_STAGING_CHECK_IDS.map((checkId) => ({ checkId, status: "PASS", evidenceSha256: digest(checkId) })),
    artifactDigests: [{ artifactId: "R06_STAGING_PACKET", sha256: digest("staging-artifact") }]
  };
}

function sourceKind(evidenceId: ReleaseEvidenceId) {
  if (evidenceId.startsWith("CI_")) return "GITHUB_ACTIONS";
  if (evidenceId.startsWith("POLICY_")) return "APPROVAL_SNAPSHOT";
  if (evidenceId === "RECOVERY_DB_STORAGE") return "RECOVERY_DRILL";
  if (evidenceId === "STAGING_E2E_V1") return "STAGING_RUN";
  return "REVIEW_ARTIFACT";
}

function fixture() {
  const artifacts = new Map<ReleaseEvidenceId, Uint8Array>();
  for (const evidenceId of REQUIRED_RELEASE_EVIDENCE_IDS) artifacts.set(evidenceId, bytes(`evidence:${evidenceId}`));
  artifacts.set("STAGING_E2E_V1", bytes(stagingEvidence()));
  artifacts.set("POLICY_OD019", bytes(approvalArtifact("OD-019-MFA-SESSION", "POL-MFA-SESSION-V1")));
  artifacts.set("POLICY_OD035", bytes(approvalArtifact("OD-035-PRODUCTION-OPERATIONS", "POL-PRODUCTION-OPERATIONS-V1")));
  artifacts.set("POLICY_OD036", bytes(approvalArtifact("OD-036-SUPABASE-SESSION-REVOKE", "POL-SUPABASE-SESSION-REVOKE-V1", true)));
  const artifact = (id: ReleaseEvidenceId) => artifacts.get(id) ?? new Uint8Array();
  const evidence = REQUIRED_RELEASE_EVIDENCE_IDS.map((evidenceId) => ({
    evidenceId,
    sourceKind: sourceKind(evidenceId),
    commitSha,
    observedAt: "2026-08-23T12:30:00.000Z",
    sha256: digest(artifact(evidenceId)),
    ...(evidenceId === "STAGING_E2E_V1" ? { canonicalSha256: releaseEvidenceSha256(stagingEvidence()) } : {}),
    ...(evidenceId === "POLICY_OD019" ? { policyVersion: "POL-MFA-SESSION-V1" } : {}),
    ...(evidenceId === "POLICY_OD035" ? { policyVersion: "POL-PRODUCTION-OPERATIONS-V1" } : {}),
    ...(evidenceId === "POLICY_OD036" ? { policyVersion: "POL-SUPABASE-SESSION-REVOKE-V1" } : {}),
    ...(evidenceId.startsWith("CI_") ? { runId: "32629729525" } : {})
  }));
  const policies = {
    schemaVersion: 1,
    mfaSession: {
      decisionId: "OD-019-MFA-SESSION", policyVersion: "POL-MFA-SESSION-V1", approval: approval(digest(artifact("POLICY_OD019"))),
      mfa: { requiredActorKinds: ["INTERNAL", "VENDOR"], requiredActionIds: ["APPROVAL_FINAL_ACTION"], factorTypes: ["TOTP"], requiredAssuranceLevel: "aal2" },
      session: { jwtExpiryMinutes: 60, timeboxMinutes: 480, inactivityMinutes: 60, singleSessionPerUser: true },
      device: { newDeviceReauthentication: true, managedDeviceRequiredForActionIds: ["TECHNICAL_SOURCE_READ"] }
    },
    productionOperations: {
      decisionId: "OD-035-PRODUCTION-OPERATIONS", policyVersion: "POL-PRODUCTION-OPERATIONS-V1", approval: approval(digest(artifact("POLICY_OD035"))),
      recoveryObjectives: { rpoMinutes: 60, rtoMinutes: 240 }, databaseBackup: { cadenceMinutes: 60, retentionDays: 30 },
      storageBackup: { cadenceMinutes: 60, retentionDays: 30 }, monitoringDestinationIds: ["MONITORING_SECURITY_CHANNEL"],
      incidentOwnerActorIds: [approver], recoveryApproverActorIds: ["16000000-0000-4000-8000-000000000002"], evidenceLocationId: "OPERATIONS_EVIDENCE_VAULT"
    },
    providerSessionRevoke: {
      decisionId: "OD-036-SUPABASE-SESSION-REVOKE", policyVersion: "POL-SUPABASE-SESSION-REVOKE-V1", approval: approval(digest(artifact("POLICY_OD036"))),
      mechanism: "SUPABASE_GLOBAL_SIGN_OUT_WITH_TARGET_JWT", scope: "global", applicationSessionCheck: "EXACT_AUTH_SESSIONS_ROW_EVERY_REQUEST",
      maximumResidualAccessTokenMinutes: 60, retryAttempts: 3, reconciliationIntervalMinutes: 5,
      limitationsAcknowledged: ["ACCESS_TOKEN_VALID_UNTIL_EXPIRY", "TARGET_USER_JWT_REQUIRED"]
    }
  };
  const input = { schemaVersion: 1, candidateCommitSha: commitSha, environmentId: "youone-staging", operationsPolicies: policies, evidence, openBlockerIds: [] };
  const reader: ReleaseArtifactReader = { read: async (evidenceId) => {
    const value = artifacts.get(evidenceId);
    if (!value) throw new Error("missing artifact");
    return value;
  } };
  return { artifacts, evidence, input, policies, reader };
}

const context = (reader: ReleaseArtifactReader, promotionSourceCommitSha = commitSha) => ({ artifacts: reader, evaluatedAt, promotionSourceCommitSha });

describe("R06 versioned operations policies", () => {
  it("enforces created <= approved <= effective <= evaluation and no revoked approval", () => {
    const setup = fixture();
    expect(validateOperationsPolicyBundle(setup.policies, evaluatedAt).mfaSession.approval.createdAt).toBe(createdAt);
    const future = structuredClone(setup.policies);
    future.productionOperations.approval.effectiveFrom = "2026-08-24T00:00:00.000Z";
    expect(() => validateOperationsPolicyBundle(future, evaluatedAt)).toThrowError(OperationsPolicyError);
    const revoked = structuredClone(setup.policies);
    revoked.providerSessionRevoke.approval.revokedAt = "2026-08-23T12:30:00.000Z" as never;
    expect(() => validateOperationsPolicyBundle(revoked, evaluatedAt)).toThrowError(OperationsPolicyError);
    const placeholder = structuredClone(setup.policies);
    placeholder.productionOperations.monitoringDestinationIds = ["MONITORING_TBD"];
    expect(() => validateOperationsPolicyBundle(placeholder, evaluatedAt)).toThrowError(OperationsPolicyError);
  });
});

describe("R06 candidate-bound artifact gate", () => {
  it("returns READY only after reading and hashing exactly 27 candidate-bound artifacts", async () => {
    const setup = fixture();
    expect(REQUIRED_RELEASE_EVIDENCE_IDS).toHaveLength(27);
    const result = await evaluateReleaseCandidate(setup.input, context(setup.reader));
    expect(result).toMatchObject({ status: "READY_FOR_RELEASE_PR", candidateCommitSha: commitSha, promotionSourceCommitSha: commitSha, reasonCodes: [], missingEvidenceIds: [] });
    expect(result.evidence).toHaveLength(REQUIRED_RELEASE_EVIDENCE_IDS.length);
  });

  it("blocks stale evidence when trusted promotion source moved to a newer commit", async () => {
    const setup = fixture();
    const result = await evaluateReleaseCandidate(setup.input, context(setup.reader, "c".repeat(40)));
    expect(result.status).toBe("BLOCKED");
    expect(result.reasonCodes).toContain("R06_PROMOTION_SOURCE_COMMIT_MISMATCH");
  });

  it("blocks missing, duplicate, extra and unknown IDs using exact cardinality", async () => {
    for (const mutation of ["missing", "duplicate", "extra", "unknown"] as const) {
      const setup = fixture();
      if (mutation === "missing") setup.input.evidence.pop();
      if (mutation === "duplicate") setup.input.evidence[26] = { ...setup.input.evidence[0]! };
      if (mutation === "extra") setup.input.evidence.push({ ...setup.input.evidence[0]! });
      if (mutation === "unknown") setup.input.evidence[26] = { ...setup.input.evidence[26]!, evidenceId: "CI_UNKNOWN" as never };
      const result = await evaluateReleaseCandidate(setup.input, context(setup.reader));
      expect(result.status, mutation).toBe("BLOCKED");
      expect(result.reasonCodes, mutation).toEqual(expect.arrayContaining(mutation === "duplicate" || mutation === "unknown" ? ["R06_EVIDENCE_INVALID"] : ["R06_EVIDENCE_CARDINALITY_INVALID"]));
    }
  });

  it("blocks a wrong source kind and credential-bearing artifact without echoing its value", async () => {
    const wrongSource = fixture();
    wrongSource.input.evidence.find((item) => item.evidenceId === "CI_M09")!.sourceKind = "REVIEW_ARTIFACT";
    expect((await evaluateReleaseCandidate(wrongSource.input, context(wrongSource.reader))).reasonCodes).toContain("R06_EVIDENCE_INVALID");

    const credential = fixture();
    credential.artifacts.set("CI_M10", bytes("Authorization: Bearer never-print-this-token"));
    const reference = credential.input.evidence.find((item) => item.evidenceId === "CI_M10")!;
    reference.sha256 = digest(credential.artifacts.get("CI_M10")!);
    const result = await evaluateReleaseCandidate(credential.input, context(credential.reader));
    expect(result.reasonCodes).toContain("R06_ARTIFACT_SECRET_DETECTED");
    expect(JSON.stringify(result)).not.toContain("never-print-this-token");
  });

  it("blocks missing artifacts, raw digest mismatch and R05 canonical/commit mismatch", async () => {
    const missing = fixture();
    missing.artifacts.delete("CI_M07");
    expect((await evaluateReleaseCandidate(missing.input, context(missing.reader))).reasonCodes).toContain("R06_ARTIFACT_UNAVAILABLE");

    const changed = fixture();
    changed.artifacts.set("CI_M08", bytes("changed artifact"));
    expect((await evaluateReleaseCandidate(changed.input, context(changed.reader))).reasonCodes).toContain("R06_ARTIFACT_DIGEST_MISMATCH");

    const staleStaging = fixture();
    const stale = stagingEvidence("a".repeat(40));
    const staleBytes = bytes(stale);
    staleStaging.artifacts.set("STAGING_E2E_V1", staleBytes);
    const reference = staleStaging.input.evidence.find((item) => item.evidenceId === "STAGING_E2E_V1")!;
    reference.sha256 = digest(staleBytes);
    reference.canonicalSha256 = releaseEvidenceSha256(stale);
    expect((await evaluateReleaseCandidate(staleStaging.input, context(staleStaging.reader))).reasonCodes).toContain("R06_STAGING_EVIDENCE_MISMATCH");
  });

  it("blocks policy version drift and invalid OD-036 target binding evidence", async () => {
    const version = fixture();
    version.input.evidence.find((item) => item.evidenceId === "POLICY_OD019")!.policyVersion = "POL-MFA-SESSION-V2";
    expect((await evaluateReleaseCandidate(version.input, context(version.reader))).reasonCodes).toContain("R06_POLICY_EVIDENCE_MISMATCH");

    const binding = fixture();
    const invalidArtifact = approvalArtifact("OD-036-SUPABASE-SESSION-REVOKE", "POL-SUPABASE-SESSION-REVOKE-V1", true);
    invalidArtifact.targetSessionBinding!.jwtSubjectSha256 = digest("different-subject");
    const invalidBytes = bytes(invalidArtifact);
    binding.artifacts.set("POLICY_OD036", invalidBytes);
    const reference = binding.input.evidence.find((item) => item.evidenceId === "POLICY_OD036")!;
    reference.sha256 = digest(invalidBytes);
    binding.policies.providerSessionRevoke.approval.approvalEvidenceSha256 = reference.sha256;
    expect((await evaluateReleaseCandidate(binding.input, context(binding.reader))).reasonCodes).toContain("R06_SESSION_REVOKE_BINDING_INVALID");
  });

  it("converts reader/internal errors to secretless BLOCKED output", async () => {
    const setup = fixture();
    const result = await evaluateReleaseCandidate(setup.input, context({ read: async () => { throw new Error("Authorization: Bearer secret-token"); } }));
    const serialized = JSON.stringify(result);
    expect(result.status).toBe("BLOCKED");
    expect(serialized).not.toMatch(/Bearer|secret-token|Authorization/);
  });
});

describe("R06 CLI fail-closed output contract", () => {
  it("prints only BLOCKED, exits non-zero and never echoes invalid input secrets", () => {
    const directory = mkdtempSync(join(tmpdir(), "youone-r06-"));
    try {
      const inputPath = join(directory, "input.json");
      writeFileSync(inputPath, JSON.stringify({ schemaVersion: 0, accessToken: "secret-token", cookie: "secret-cookie" }));
      const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "apps/worker/src/release-gate.ts"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, R06_RELEASE_INPUT_PATH: inputPath, R06_ARTIFACT_ROOT: directory, R06_PROMOTION_SOURCE_COMMIT: commitSha }
      });
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe("BLOCKED\n");
      expect(result.stderr).not.toMatch(/secret-token|secret-cookie|accessToken|cookie/);
      expect(result.stderr).toContain('"outcome":"BLOCKED"');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
