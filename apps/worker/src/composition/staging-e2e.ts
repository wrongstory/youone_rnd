import { randomUUID } from "node:crypto";

import { combineDeploymentReadiness } from "./deployment-readiness.js";
import { getWorkerPrivateStorage } from "./private-storage.js";
import { getWorkerState } from "./runtime.js";
import {
  createStagingEvidence,
  type StagingCheckResult,
  type StagingEvidence
} from "./staging-evidence.js";
import { probeWorkerDatabase } from "./worker-database.js";

export type BlockedStagingRun = Readonly<{
  schemaVersion: 1;
  status: "BLOCKED";
  environmentKind: "STAGING";
  reasonCode:
    | "STAGING_CONFIG_INVALID"
    | "STAGING_PREVIEW_FORBIDDEN"
    | "STAGING_READINESS_UNAVAILABLE";
}>;

export interface StagingCheckExecutor {
  execute(input: Readonly<{
    baseUrl: URL;
    correlationId: string;
  }>): Promise<Readonly<{
    artifactDigests: readonly Readonly<{ artifactId: string; sha256: string }>[];
    checks: readonly StagingCheckResult[];
  }>>;
}

export async function runStagingE2E(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: Readonly<{
    checks?: StagingCheckExecutor;
    fetch?: typeof globalThis.fetch;
    now?: () => Date;
    workerState?: () => Promise<Awaited<ReturnType<typeof getWorkerState>>>;
  }> = {}
): Promise<StagingEvidence | BlockedStagingRun> {
  let configuration: StagingConfiguration;
  try {
    configuration = stagingConfiguration(environment);
  } catch (error) {
    return blocked(error instanceof StagingConfigurationError ? error.reasonCode : "STAGING_CONFIG_INVALID");
  }
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now().toISOString();
  let web: unknown;
  let worker: Awaited<ReturnType<typeof getWorkerState>>;
  try {
    let workerOperation: Promise<Awaited<ReturnType<typeof getWorkerState>>>;
    if (dependencies.workerState) {
      workerOperation = dependencies.workerState();
    } else {
      const privateStorage = getWorkerPrivateStorage(environment);
      workerOperation = getWorkerState(environment, {
        database: { probe: () => probeWorkerDatabase(environment) },
        ...(privateStorage === null ? {} : { privateStorage })
      });
    }
    [web, worker] = await Promise.all([
      fetchWebReadiness(configuration.baseUrl, dependencies.fetch ?? globalThis.fetch, configuration.timeoutMillis),
      workerOperation
    ]);
  } catch {
    return blocked("STAGING_READINESS_UNAVAILABLE");
  }
  const readiness = combineDeploymentReadiness(web, worker);
  let result: Awaited<ReturnType<StagingCheckExecutor["execute"]>> = { checks: [], artifactDigests: [] };
  if (readiness.status === "ready" && dependencies.checks) {
    try {
      result = await dependencies.checks.execute({ baseUrl: configuration.baseUrl, correlationId: configuration.correlationId });
    } catch {
      result = { checks: [], artifactDigests: [] };
    }
  }
  return createStagingEvidence({
    environmentId: configuration.environmentId,
    commitSha: configuration.commitSha,
    correlationId: configuration.correlationId,
    startedAt,
    completedAt: now().toISOString(),
    credentialEvidence: readiness.status === "ready" ? "LIVE_CREDENTIALS_VERIFIED" : "NOT_VERIFIED",
    readiness,
    checks: result.checks,
    artifactDigests: result.artifactDigests
  });
}

type StagingConfiguration = Readonly<{
  baseUrl: URL;
  commitSha: string;
  correlationId: string;
  environmentId: string;
  timeoutMillis: number;
}>;

class StagingConfigurationError extends Error {
  public constructor(public readonly reasonCode: BlockedStagingRun["reasonCode"]) {
    super(reasonCode);
    this.name = "StagingConfigurationError";
  }
}

function stagingConfiguration(environment: Readonly<Record<string, string | undefined>>): StagingConfiguration {
  if (environment.DEPLOYMENT_STAGE !== "staging") throw new StagingConfigurationError("STAGING_CONFIG_INVALID");
  if (environment.YOUONE_PREVIEW_DATA === "enabled") throw new StagingConfigurationError("STAGING_PREVIEW_FORBIDDEN");
  const baseUrl = safeBaseUrl(environment.STAGING_WEB_BASE_URL);
  const environmentId = environment.STAGING_ENVIRONMENT_ID ?? "";
  const commitSha = environment.STAGING_COMMIT_SHA ?? "";
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(environmentId) || !/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new StagingConfigurationError("STAGING_CONFIG_INVALID");
  }
  const timeoutMillis = boundedTimeout(environment.STAGING_READINESS_TIMEOUT_MS);
  const suppliedCorrelation = environment.STAGING_CORRELATION_ID;
  const correlationId = suppliedCorrelation ?? `staging:${randomUUID()}`;
  if (!/^staging:[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(correlationId)) {
    throw new StagingConfigurationError("STAGING_CONFIG_INVALID");
  }
  return Object.freeze({ baseUrl, environmentId, commitSha, correlationId, timeoutMillis });
}

function safeBaseUrl(raw: string | undefined): URL {
  let url: URL;
  try {
    url = new URL(raw ?? "");
  } catch {
    throw new StagingConfigurationError("STAGING_CONFIG_INVALID");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.pathname !== "" && url.pathname !== "/")) {
    throw new StagingConfigurationError("STAGING_CONFIG_INVALID");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname === "127.0.0.1" || hostname === "::1") {
    throw new StagingConfigurationError("STAGING_CONFIG_INVALID");
  }
  url.pathname = "/";
  return url;
}

function boundedTimeout(raw: string | undefined): number {
  if (raw === undefined) return 10_000;
  if (!/^\d+$/.test(raw)) throw new StagingConfigurationError("STAGING_CONFIG_INVALID");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 500 || value > 30_000) {
    throw new StagingConfigurationError("STAGING_CONFIG_INVALID");
  }
  return value;
}

async function fetchWebReadiness(baseUrl: URL, fetchImplementation: typeof globalThis.fetch, timeoutMillis: number): Promise<unknown> {
  const response = await fetchImplementation(new URL("api/health/ready", baseUrl), {
    cache: "no-store",
    headers: { "X-Correlation-Id": `staging:${randomUUID()}` },
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMillis)
  });
  if (response.status !== 200 && response.status !== 503) {
    await response.body?.cancel();
    throw new Error("STAGING_READINESS_UNAVAILABLE");
  }
  const cacheControl = response.headers.get("cache-control") ?? "";
  if (!cacheControl.includes("private") || !cacheControl.includes("no-store")) {
    await response.body?.cancel();
    throw new Error("STAGING_READINESS_UNAVAILABLE");
  }
  return response.json();
}

function blocked(reasonCode: BlockedStagingRun["reasonCode"]): BlockedStagingRun {
  return Object.freeze({ schemaVersion: 1, status: "BLOCKED", environmentKind: "STAGING", reasonCode });
}
