import {
  offlineSyncEndpoint,
  SyncRequestAuthenticationError,
  SyncRequestValidationError,
  withRequestCorrelation
} from "../../../../../composition/offline-sync";
import { writeSecurityLog } from "../../../../../composition/security-log";
import {
  OfflineCommandBindingError,
  OfflineCommandIdempotencyError,
  OfflineCommandIntegrityError,
  OfflineCommandOnlineOnlyError,
  OfflineCommandValidationError
} from "@youone/core-sync/public";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const correlated = withRequestCorrelation(request);
  const responseHeaders = {
    "Cache-Control": "private, no-store",
    "X-Correlation-Id": correlated.correlationId
  };
  const endpoint = offlineSyncEndpoint();
  if (endpoint === null) {
    writeSecurityLog({
      event: "SYNC_REQUEST_FAILED",
      correlationId: correlated.correlationId,
      route: "/api/v1/sync/commands",
      outcome: "SYNC_REQUEST_ADAPTER_NOT_CONFIGURED",
      status: 503
    });
    return Response.json(
      { result: "UNAVAILABLE", reason: "SYNC_REQUEST_ADAPTER_NOT_CONFIGURED" },
      { status: 503, headers: responseHeaders }
    );
  }

  try {
    const result = await endpoint.execute(correlated.request);
    writeSecurityLog({
      event: result.status >= 400 ? "SYNC_REQUEST_DENIED" : "SYNC_REQUEST_COMPLETED",
      correlationId: correlated.correlationId,
      route: "/api/v1/sync/commands",
      outcome: result.body.result,
      status: result.status
    });
    return Response.json(result.body, { status: result.status, headers: responseHeaders });
  } catch (error) {
    const status = error instanceof SyncRequestAuthenticationError || error instanceof Error && error.name === "IdentityVerificationError"
      ? 401
      : error instanceof SyncRequestValidationError || error instanceof OfflineCommandValidationError || error instanceof SyntaxError
        ? 400
        : error instanceof OfflineCommandOnlineOnlyError
          ? 422
          : error instanceof OfflineCommandBindingError || error instanceof OfflineCommandIntegrityError || error instanceof OfflineCommandIdempotencyError
            ? 409
            : 500;
    const reason = status === 401
      ? "SYNC_REQUEST_UNAUTHENTICATED"
      : status === 400
        ? "SYNC_REQUEST_INVALID"
        : status === 409
          ? "SYNC_REQUEST_CONFLICT"
          : status === 422
            ? "SYNC_COMMAND_NOT_ALLOWED"
            : "SYNC_REQUEST_FAILED";
    writeSecurityLog({
      event: status >= 500 ? "SYNC_REQUEST_FAILED" : "SYNC_REQUEST_DENIED",
      correlationId: correlated.correlationId,
      route: "/api/v1/sync/commands",
      outcome: reason,
      status
    });
    return Response.json({ result: "REJECTED", reason }, { status, headers: responseHeaders });
  }
}
