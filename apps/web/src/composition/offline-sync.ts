import {
  createOfflineCommandHandlers,
  minimizedJson,
  OfflineSyncService,
  parseOfflineCommand,
  type SyncCommandResult
} from "@youone/core-sync/public";
import {
  createPostgresOfflineSyncUnitOfWork,
  probePostgresOfflineSyncHandlers
} from "@youone/infra-postgres/offline-sync";
import { correlationId, sha256, uuid } from "@youone/shared-kernel/public";
import { createHash, randomUUID } from "node:crypto";

import { requestActorContextFactory } from "./request-auth";
import { getRequestDatabaseComposition } from "./request-database";

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
const maximumCommandBytes = 32 * 1024;

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
      const rawBody = await readBoundedRequestBody(request, maximumCommandBytes);
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

async function readBoundedRequestBody(request: Request, maximumBytes: number): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > maximumBytes) {
      throw new SyncRequestValidationError("offline command exceeds the request limit");
    }
  }
  if (request.body === null) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel("offline command exceeds the request limit");
        throw new SyncRequestValidationError("offline command exceeds the request limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new SyncRequestValidationError("offline command must be valid UTF-8 JSON");
  }
}

export type OfflineSyncEndpoint = ReturnType<typeof createOfflineSyncEndpoint>;

/** Composes only reviewed live Auth, request-DB and exact five-handler adapters. */
export function offlineSyncEndpoint(): OfflineSyncEndpoint | null {
  try {
    const actors = requestActorContextFactory();
    const database = getRequestDatabaseComposition();
    if (actors === null || database === null) return null;
    const sync = new OfflineSyncService(
      createPostgresOfflineSyncUnitOfWork(database.unitOfWork),
      createOfflineCommandHandlers(),
      {
        async payloadHash(payload) {
          return sha256(createHash("sha256").update(minimizedJson(payload), "utf8").digest("hex"));
        },
        async actorSessionBindingHash(actor) {
          return sha256(createHash("sha256")
            .update(`${actor.authenticatedActorId}:${actor.sessionId}`, "utf8")
            .digest("hex"));
        }
      },
      { next: () => uuid(randomUUID()) }
    );
    return createOfflineSyncEndpoint({
      actors: new LiveTrustedSyncActorResolver(actors),
      sync
    });
  } catch {
    return null;
  }
}

export async function probeOfflineSync(): Promise<Readonly<{
  ready: boolean;
  reasonCode?: "SYNC_HANDLER_CAPABILITY_UNAVAILABLE" | "SYNC_REQUEST_ADAPTER_NOT_CONFIGURED";
}>> {
  try {
    const database = getRequestDatabaseComposition();
    if (offlineSyncEndpoint() === null || database === null) {
      return Object.freeze({ ready: false, reasonCode: "SYNC_REQUEST_ADAPTER_NOT_CONFIGURED" });
    }
    return await probePostgresOfflineSyncHandlers(database.pool)
      ? Object.freeze({ ready: true })
      : Object.freeze({ ready: false, reasonCode: "SYNC_HANDLER_CAPABILITY_UNAVAILABLE" });
  } catch {
    return Object.freeze({ ready: false, reasonCode: "SYNC_HANDLER_CAPABILITY_UNAVAILABLE" });
  }
}
