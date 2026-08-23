export type SecurityLogInput = Readonly<{
  event: "SYNC_REQUEST_COMPLETED" | "SYNC_REQUEST_DENIED" | "SYNC_REQUEST_FAILED";
  correlationId: string;
  route: "/api/v1/sync/commands";
  outcome: string;
  status: number;
}>;

/** Emits only reviewed fields. Request bodies, tokens, cookies, object keys and personal data have no slot. */
export function securityLogRecord(input: SecurityLogInput, occurredAt = new Date()): string {
  return JSON.stringify({
    timestamp: occurredAt.toISOString(),
    level: input.status >= 500 ? "ERROR" : input.status >= 400 ? "WARN" : "INFO",
    event: input.event,
    correlationId: input.correlationId,
    route: input.route,
    outcome: input.outcome,
    status: input.status
  });
}

export function writeSecurityLog(input: SecurityLogInput): void {
  const record = `${securityLogRecord(input)}\n`;
  if (input.status >= 500) process.stderr.write(record);
  else process.stdout.write(record);
}
