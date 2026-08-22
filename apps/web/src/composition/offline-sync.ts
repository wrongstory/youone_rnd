import {
  parseOfflineCommand,
  type OfflineSyncService,
  type SyncCommandResult
} from "@youone/core-sync/public";
import { correlationId, uuid } from "@youone/shared-kernel/public";

type TrustedSyncActor = Parameters<OfflineSyncService["execute"]>[0];

export interface TrustedSyncActorResolver {
  /** Must verify the live server session and reload current identity, permission and scope records. */
  resolve(request: Request): Promise<TrustedSyncActor>;
}

export interface TrustedSyncActorFactory {
  create(
    accessToken: string,
    requestCorrelationId: ReturnType<typeof correlationId>,
    actingAuthorityId?: ReturnType<typeof uuid>
  ): Promise<TrustedSyncActor>;
}

export class SyncRequestAuthenticationError extends Error {
  readonly code = "SYNC_REQUEST_UNAUTHENTICATED";

  constructor(message: string) {
    super(message);
    this.name = "SyncRequestAuthenticationError";
  }
}

export class SyncRequestValidationError extends Error {
  readonly code = "SYNC_REQUEST_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "SyncRequestValidationError";
  }
}

const correlationPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const bearerPattern = /^Bearer ([^\s]{1,8192})$/;
const maximumCommandBytes = 64 * 1024;

export function requestCorrelationId(request: Request): string {
  const supplied = request.headers.get("x-correlation-id")?.trim();
  return supplied !== undefined && correlationPattern.test(supplied)
    ? supplied
    : `request:${crypto.randomUUID()}`;
}

export function withRequestCorrelation(request: Request): Readonly<{ request: Request; correlationId: string }> {
  const currentCorrelationId = requestCorrelationId(request);
  const headers = new Headers(request.headers);
  headers.set("x-correlation-id", currentCorrelationId);
  return Object.freeze({ request: new Request(request, { headers }), correlationId: currentCorrelationId });
}

export class LiveTrustedSyncActorResolver implements TrustedSyncActorResolver {
  constructor(private readonly actors: TrustedSyncActorFactory) {}

  async resolve(request: Request): Promise<TrustedSyncActor> {
    const authorization = request.headers.get("authorization")?.trim() ?? "";
    const bearer = bearerPattern.exec(authorization);
    if (bearer === null) throw new SyncRequestAuthenticationError("a valid bearer session is required");

    const authorityHeader = request.headers.get("x-acting-authority-id")?.trim();
    let actingAuthorityId: ReturnType<typeof uuid> | undefined;
    if (authorityHeader !== undefined && authorityHeader !== "") {
      try {
        actingAuthorityId = uuid(authorityHeader);
      } catch {
        throw new SyncRequestAuthenticationError("acting authority selection is invalid");
      }
    }

    return this.actors.create(
      bearer[1] as string,
      correlationId(requestCorrelationId(request)),
      actingAuthorityId
    );
  }
}

export interface OfflineSyncExecutor {
  execute(actor: TrustedSyncActor, command: ReturnType<typeof parseOfflineCommand>): Promise<SyncCommandResult>;
}

export type OfflineSyncEndpointResult = Readonly<{
  status: 200 | 409 | 422;
  body: SyncCommandResult;
}>;

export function createOfflineSyncEndpoint(dependencies: Readonly<{
  actors: TrustedSyncActorResolver;
  sync: OfflineSyncExecutor;
}>) {
  return Object.freeze({
    async execute(request: Request): Promise<OfflineSyncEndpointResult> {
      const actor = await dependencies.actors.resolve(request);
      const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.startsWith("application/json")) {
        throw new SyncRequestValidationError("application/json content is required");
      }
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > maximumCommandBytes) {
        throw new SyncRequestValidationError("offline command exceeds the request limit");
      }
      let input: unknown;
      try {
        input = JSON.parse(rawBody) as unknown;
      } catch {
        throw new SyncRequestValidationError("offline command must be valid JSON");
      }
      const command = parseOfflineCommand(input);
      const result = await dependencies.sync.execute(actor, command);
      const status = result.result === "SYNC_CONFLICT" ? 409 : result.result === "REJECTED" ? 422 : 200;
      return Object.freeze({ status, body: result });
    }
  });
}

export type OfflineSyncEndpoint = ReturnType<typeof createOfflineSyncEndpoint>;

/** M16 wires the live Supabase/Postgres request adapters. Until then the endpoint fails closed. */
export function offlineSyncEndpoint(): OfflineSyncEndpoint | null {
  return null;
}
