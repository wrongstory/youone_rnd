import { readFile } from "node:fs/promises";

import { evaluateReleaseCandidate } from "./composition/release-evidence.js";
import { workerSecurityLogRecord } from "./composition/security-log.js";

let input: unknown;
try {
  const path = process.env.R06_RELEASE_INPUT_PATH;
  if (!path) throw new Error("R06_RELEASE_INPUT_PATH_MISSING");
  input = JSON.parse(await readFile(path, "utf8"));
} catch {
  input = null;
}

const result = evaluateReleaseCandidate(input);
process.stdout.write(`${JSON.stringify(result)}\n`);
process.stderr.write(`${workerSecurityLogRecord({
  component: "release-gate",
  correlationId: "release:r06",
  event: result.status === "READY_FOR_RELEASE_PR" ? "RELEASE_GATE_COMPLETED" : "RELEASE_GATE_FAILED",
  outcome: result.status,
  status: result.status === "READY_FOR_RELEASE_PR" ? 200 : 503
})}\n`);
if (result.status !== "READY_FOR_RELEASE_PR") process.exitCode = 2;
