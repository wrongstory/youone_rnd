import { runStagingE2E } from "./composition/staging-e2e.js";
import { workerSecurityLogRecord } from "./composition/security-log.js";

const result = await runStagingE2E();
process.stdout.write(`${JSON.stringify(result)}\n`);
process.stderr.write(`${workerSecurityLogRecord({
  component: "staging-e2e",
  correlationId: "status" in result && "correlationId" in result ? result.correlationId : "staging:configuration",
  event: result.status === "READY" ? "STAGING_E2E_COMPLETED" : "STAGING_E2E_FAILED",
  outcome: result.status === "READY" ? "STAGING_EVIDENCE_READY" : "reasonCode" in result ? result.reasonCode : result.status,
  status: result.status === "READY" ? 200 : 503
})}\n`);
if (result.status !== "READY") process.exitCode = 2;
