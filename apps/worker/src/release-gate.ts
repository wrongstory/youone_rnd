import { readFile, readdir } from "node:fs/promises";

import { filesystemReleaseArtifactReader } from "./composition/release-artifacts.js";
import { evaluateReleaseCandidate, type ReleaseGateReport } from "./composition/release-evidence.js";
import { isMigrationHead } from "./composition/recovery-manifest.js";
import { workerSecurityLogRecord } from "./composition/security-log.js";

async function candidateMigrationHead(): Promise<string> {
  const sqlNames = (await readdir(new URL("../../../supabase/migrations/", import.meta.url))).filter((name) => name.endsWith(".sql"));
  if (sqlNames.length === 0 || sqlNames.some((name) => !isMigrationHead(name))) throw new Error("R06_CANDIDATE_MIGRATION_HEAD_INVALID");
  const names = sqlNames.sort();
  const head = names.at(-1);
  if (head === undefined) throw new Error("R06_CANDIDATE_MIGRATION_HEAD_INVALID");
  return head;
}

let status: ReleaseGateReport["status"] = "BLOCKED";
try {
  const inputPath = process.env.R06_RELEASE_INPUT_PATH;
  const artifactRoot = process.env.R06_ARTIFACT_ROOT;
  const promotionSourceCommitSha = process.env.R06_PROMOTION_SOURCE_COMMIT;
  if (!inputPath || !artifactRoot || !promotionSourceCommitSha) throw new Error("R06_CONFIGURATION_INVALID");
  const input: unknown = JSON.parse(await readFile(inputPath, "utf8"));
  const result = await evaluateReleaseCandidate(input, {
    artifacts: filesystemReleaseArtifactReader(artifactRoot),
    candidateMigrationHead: await candidateMigrationHead(),
    evaluatedAt: new Date().toISOString(),
    promotionSourceCommitSha
  });
  status = result.status;
} catch {
  status = "BLOCKED";
}

// Construct and write the fixed-field security record before the two-value stdout contract.
// A logger/serialization failure is itself fail-closed and cannot leave READY on stdout.
try {
  process.stderr.write(`${workerSecurityLogRecord({
    component: "release-gate",
    correlationId: "release:r06",
    event: status === "READY_FOR_RELEASE_PR" ? "RELEASE_GATE_COMPLETED" : "RELEASE_GATE_FAILED",
    outcome: status,
    status: status === "READY_FOR_RELEASE_PR" ? 200 : 503
  })}\n`);
} catch {
  status = "BLOCKED";
}
process.stdout.write(`${status}\n`);
if (status !== "READY_FOR_RELEASE_PR") process.exitCode = 2;
