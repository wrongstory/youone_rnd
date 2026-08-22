import {
  parseOfflineCommand,
  type OfflineSyncService,
  type SyncCommandResult
} from "@youone/core-sync/public";

type TrustedSyncActor = Parameters<OfflineSyncService["execute"]>[0];

export interface TrustedSyncActorResolver {
  /** Must verify the live server session and reload current identity, permission and scope records. */
  resolve(request: Request): Promise<TrustedSyncActor>;
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
      const command = parseOfflineCommand(await request.json());
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
