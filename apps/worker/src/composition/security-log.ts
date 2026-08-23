export type WorkerSecurityLogInput = Readonly<{
  component: "database" | "private-storage" | "staging-e2e";
  correlationId: string;
  event:
    | "STAGING_E2E_COMPLETED"
    | "STAGING_E2E_FAILED"
    | "WORKER_DATABASE_IDLE_CLIENT_ERROR"
    | "WORKER_READINESS_FAILED";
  outcome: string;
  status: number;
}>;

/** Fixed-field operational record. Secrets, object keys, URLs and test payloads have no slot. */
export function workerSecurityLogRecord(input: WorkerSecurityLogInput, occurredAt = new Date()): string {
  return JSON.stringify({
    timestamp: occurredAt.toISOString(),
    level: input.status >= 500 ? "ERROR" : input.status >= 400 ? "WARN" : "INFO",
    event: input.event,
    correlationId: input.correlationId,
    component: input.component,
    outcome: input.outcome,
    status: input.status
  });
}

export function writeWorkerSecurityLog(input: WorkerSecurityLogInput): void {
  const record = `${workerSecurityLogRecord(input)}\n`;
  if (input.status >= 500) process.stderr.write(record);
  else process.stdout.write(record);
}
