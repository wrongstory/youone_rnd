import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  combineDeploymentReadiness,
  DEPLOYMENT_COMPONENT_IDS
} from "../../apps/worker/src/composition/deployment-readiness.js";
import { getWorkerState } from "../../apps/worker/src/composition/runtime.js";
import { runStagingE2E } from "../../apps/worker/src/composition/staging-e2e.js";
import {
  createStagingEvidence,
  REQUIRED_STAGING_CHECK_IDS,
  type StagingCheckResult
} from "../../apps/worker/src/composition/staging-evidence.js";
import { workerSecurityLogRecord } from "../../apps/worker/src/composition/security-log.js";
import { probeWorkerDatabase } from "../../apps/worker/src/composition/worker-database.js";

const digest = createHash("sha256").update("r05-evidence").digest("hex");
const commitSha = "a".repeat(40);
const readyWeb = Object.freeze({
  service: "youone-web",
  status: "ready",
  components: Object.freeze([
    Object.freeze({ component: "database", status: "ready" }),
    Object.freeze({ component: "request-auth", status: "ready" }),
    Object.freeze({ component: "offline-sync", status: "ready" })
  ])
});
const readyWorker = Object.freeze({
  service: "youone-worker",
  status: "ready",
  components: Object.freeze([
    Object.freeze({ component: "database", status: "ready" }),
    Object.freeze({ component: "private-storage", status: "ready" })
  ])
});

function passingChecks(): readonly StagingCheckResult[] {
  return REQUIRED_STAGING_CHECK_IDS.map((checkId) => Object.freeze({ checkId, status: "PASS" as const, evidenceSha256: digest }));
}

function stagingEnvironment(): Record<string, string> {
  return {
    DEPLOYMENT_STAGE: "staging",
    STAGING_WEB_BASE_URL: "https://staging.youone.example",
    STAGING_ENVIRONMENT_ID: "youone-staging",
    STAGING_COMMIT_SHA: commitSha,
    STAGING_CORRELATION_ID: "staging:r05-contract",
    WORKER_DATABASE_URL: "postgresql://configured",
    SUPABASE_URL: "https://tenant.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: `sb_secret_${"x".repeat(32)}`,
    SUPABASE_PRIVATE_BUCKETS: "documents-private"
  };
}

function readinessResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

describe("R05 integrated deployment readiness", () => {
  it("maps the exact Web and Worker component set", () => {
    const result = combineDeploymentReadiness(readyWeb, readyWorker);
    expect(result.status).toBe("ready");
    expect(result.components.map((component) => component.componentId)).toEqual(DEPLOYMENT_COMPONENT_IDS);
  });

  it("fails closed for missing, duplicate, inconsistent or secret-bearing reason fields", () => {
    const malformed = {
      service: "youone-web",
      status: "not_ready",
      components: [
        { component: "database", status: "not_ready", reasonCode: "postgresql://secret" },
        { component: "database", status: "ready" },
        { component: "offline-sync", status: "ready" }
      ]
    };
    const result = combineDeploymentReadiness(malformed, readyWorker);
    expect(result.status).toBe("not_ready");
    expect(result.components.every((component) => component.reasonCode === "DEPLOYMENT_READINESS_PAYLOAD_INVALID")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("bounds Worker probes and rejects invalid readiness timeout configuration", async () => {
    const environment = {
      WORKER_DATABASE_URL: "configured",
      SUPABASE_URL: "configured",
      SUPABASE_SERVICE_ROLE_KEY: "configured",
      SUPABASE_PRIVATE_BUCKETS: "configured",
      WORKER_READINESS_TIMEOUT_MS: "unsafe"
    };
    await expect(getWorkerState(environment, {
      database: { probe: vi.fn(async () => ({ ready: true })) },
      privateStorage: { probe: vi.fn(async () => ({ ready: true })) }
    })).resolves.toMatchObject({
      status: "not_ready",
      components: [
        { reasonCode: "WORKER_READINESS_CONFIG_INVALID" },
        { reasonCode: "WORKER_READINESS_CONFIG_INVALID" }
      ]
    });
  });
});

describe("R05 staging evidence", () => {
  it("creates READY evidence only with live credentials, all required checks and artifact digests", () => {
    const evidence = createStagingEvidence({
      environmentId: "youone-staging",
      commitSha,
      correlationId: "staging:r05-ready",
      startedAt: "2026-08-23T12:00:00Z",
      completedAt: "2026-08-23T12:05:00Z",
      credentialEvidence: "LIVE_CREDENTIALS_VERIFIED",
      readiness: combineDeploymentReadiness(readyWeb, readyWorker),
      checks: passingChecks(),
      artifactDigests: [{ artifactId: "R05_E2E_RESULTS", sha256: digest }],
      bearerToken: "not-serialized"
    } as never);
    expect(evidence.status).toBe("READY");
    expect(evidence.checks).toHaveLength(REQUIRED_STAGING_CHECK_IDS.length);
    expect(JSON.stringify(evidence)).not.toContain("not-serialized");
  });

  it("records missing credentials and unexecuted checks as BLOCKED", () => {
    const evidence = createStagingEvidence({
      environmentId: "youone-staging",
      commitSha,
      correlationId: "staging:r05-blocked",
      startedAt: "2026-08-23T12:00:00Z",
      completedAt: "2026-08-23T12:00:01Z",
      credentialEvidence: "NOT_VERIFIED",
      readiness: combineDeploymentReadiness(readyWeb, readyWorker),
      checks: []
    });
    expect(evidence.status).toBe("BLOCKED");
    expect(evidence.checks.every((check) => check.status === "BLOCKED")).toBe(true);
  });

  it("emits a fixed-field Worker security log without injected secret fields", () => {
    const record = workerSecurityLogRecord({
      component: "staging-e2e",
      correlationId: "staging:r05-log",
      event: "STAGING_E2E_FAILED",
      outcome: "STAGING_READINESS_UNAVAILABLE",
      status: 503,
      objectKey: "private/secret.pdf",
      token: "secret-token"
    } as never, new Date("2026-08-23T12:00:00Z"));
    expect(JSON.parse(record)).toEqual({
      timestamp: "2026-08-23T12:00:00.000Z",
      level: "ERROR",
      event: "STAGING_E2E_FAILED",
      correlationId: "staging:r05-log",
      component: "staging-e2e",
      outcome: "STAGING_READINESS_UNAVAILABLE",
      status: 503
    });
    expect(record).not.toContain("secret");
  });
});

describe("R05 Staging runner", () => {
  it("refuses non-staging and Preview targets before making a request", async () => {
    const fetch = vi.fn();
    await expect(runStagingE2E({ ...stagingEnvironment(), DEPLOYMENT_STAGE: "production" }, { fetch }))
      .resolves.toEqual({ schemaVersion: 1, status: "BLOCKED", environmentKind: "STAGING", reasonCode: "STAGING_CONFIG_INVALID" });
    await expect(runStagingE2E({ ...stagingEnvironment(), YOUONE_PREVIEW_DATA: "enabled" }, { fetch }))
      .resolves.toEqual({ schemaVersion: 1, status: "BLOCKED", environmentKind: "STAGING", reasonCode: "STAGING_PREVIEW_FORBIDDEN" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps live readiness BLOCKED until the required Staging matrix executor exists", async () => {
    const result = await runStagingE2E(stagingEnvironment(), {
      fetch: vi.fn(async () => readinessResponse(readyWeb)),
      now: () => new Date("2026-08-23T12:00:00Z"),
      workerState: async () => readyWorker
    });
    expect(result.status).toBe("BLOCKED");
    expect("checks" in result && result.checks.every((check) => check.status === "BLOCKED")).toBe(true);
  });

  it("produces READY only after live readiness and the complete evidence matrix pass", async () => {
    const result = await runStagingE2E(stagingEnvironment(), {
      fetch: vi.fn(async () => readinessResponse(readyWeb)),
      now: () => new Date("2026-08-23T12:00:00Z"),
      workerState: async () => readyWorker,
      checks: {
        execute: async () => ({
          checks: passingChecks(),
          artifactDigests: [{ artifactId: "R05_E2E_RESULTS", sha256: digest }]
        })
      }
    });
    expect(result).toMatchObject({ status: "READY", credentialEvidence: "LIVE_CREDENTIALS_VERIFIED" });
  });

  it("reports missing Worker database configuration without leaking its value", async () => {
    await expect(probeWorkerDatabase({}, vi.fn() as never)).resolves.toEqual({
      ready: false,
      reasonCode: "WORKER_DATABASE_URL_MISSING"
    });
  });
});
