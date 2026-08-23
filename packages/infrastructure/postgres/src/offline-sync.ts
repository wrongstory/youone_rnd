import {
  OfflineCommandIdempotencyError,
  minimizedJson,
  type FieldNoteDraftCommand,
  type FieldRecordDraftCommand,
  type InspectionAttemptDraftCommand,
  type OfflineApplicationCommandResult,
  type OfflineCommandEnvelope,
  type OfflineSyncTransaction,
  type OfflineSyncUnitOfWork,
  type SafetyChecklistDraftCommand,
  type SyncConflictRecord,
  type TerminalSyncCommandResult,
  type WbsNodeProgressCommand
} from "@youone/core-sync/public";
import {
  assertTrustedActorContext,
  type TrustedActorContext
} from "@youone/core-authorization/public";
import {
  sha256,
  stableCode,
  utcInstant,
  uuid,
  version,
  type JsonObject,
  type Uuid
} from "@youone/shared-kernel/public";

import type { SqlPool } from "./driver";
import type { TrustedRequestUnitOfWork } from "./request";
import type { PostgresTransactionScope } from "./transaction";

type HandlerRow = Readonly<{
  result_code: string;
  aggregate_version: string | number | null;
  server_version: string | number | null;
  safe_server_projection: JsonObject | null;
  reason_code: string | null;
}>;

type RecordedRow = Readonly<{
  payload_hash: string;
  result_code: string;
  aggregate_version: string | number | null;
  reason_code: string | null;
  conflict_id: string | null;
  command_type: string;
  aggregate_type: string;
  aggregate_id: string;
  base_version: string | number;
  server_version: string | number | null;
  local_payload: JsonObject | null;
  local_payload_hash: string | null;
  safe_server_projection: JsonObject | null;
  safe_server_projection_hash: string | null;
  detected_at: string | Date | null;
}>;

export class PostgresOfflineSyncUnitOfWork implements OfflineSyncUnitOfWork {
  public constructor(private readonly requests: TrustedRequestUnitOfWork) {}

  public transact<T>(
    actor: TrustedActorContext,
    work: (transaction: OfflineSyncTransaction) => Promise<T>
  ): Promise<T> {
    assertTrustedActorContext(actor);
    return this.requests.execute(actor, (transaction) =>
      work(new PostgresOfflineSyncTransaction(transaction))
    );
  }
}

class PostgresOfflineSyncTransaction implements OfflineSyncTransaction {
  public constructor(private readonly transaction: PostgresTransactionScope) {}

  public async findRecordedCommand(commandId: Uuid) {
    // Claim the immutable command identity before lookup. This closes the
    // find-then-register race for two concurrent requests with the same ID.
    await this.transaction.query(
      "select pg_advisory_xact_lock(hashtextextended($1::text, 0))",
      [commandId]
    );
    const result = await this.transaction.query<RecordedRow>(
      `select c.payload_hash, c.command_type, c.aggregate_type, c.aggregate_id,
              c.base_version, r.result_code, r.aggregate_version, r.reason_code,
              r.conflict_id, s.server_version, s.local_payload,
              s.local_payload_hash, s.safe_server_projection,
              s.safe_server_projection_hash, s.detected_at
         from public.offline_command c
         join public.offline_command_result r on r.offline_command_id = c.command_id
         left join public.sync_conflict s on s.conflict_id = r.conflict_id
        where c.command_id = $1::uuid`,
      [commandId]
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    return Object.freeze({
      payloadHash: sha256(row.payload_hash),
      result: recordedTerminalResult(commandId, row)
    });
  }

  public async recordCommand(
    command: OfflineCommandEnvelope,
    actor: TrustedActorContext
  ): Promise<void> {
    assertTrustedActorContext(actor);
    try {
      await this.transaction.query(
        `select app_private.register_offline_command(
          $1::uuid,$2,$3::uuid,$4::uuid,$5,$6,$7::uuid,$8::bigint,$9::bigint,
          $10::timestamptz,$11,$12,$13::timestamptz
        )`,
        [
          command.commandId,
          command.commandType,
          command.actorBinding.authenticatedActorId,
          command.actorBinding.effectiveActorId,
          command.actorBinding.sessionBindingHash,
          command.aggregate.aggregateType,
          command.aggregate.aggregateId,
          command.baseVersion,
          command.schemaVersion,
          command.createdAt,
          command.payloadHash,
          minimizedJson(command.payload),
          actor.requestTime
        ]
      );
    } catch (error) {
      if (postgresCode(error) === "23505") {
        throw new OfflineCommandIdempotencyError("commandId was already used for different content");
      }
      throw error;
    }
  }

  public async recordResult(result: TerminalSyncCommandResult): Promise<void> {
    if (result.result === "SYNC_CONFLICT") return;
    await this.transaction.query(
      `select app_private.record_offline_command_result(
        $1::uuid,$2,$3::bigint,$4,$5::timestamptz
      )`,
      [
        result.commandId,
        result.result,
        result.result === "APPLIED" ? result.aggregateVersion : null,
        result.result === "REJECTED" ? result.reasonCode : null,
        requestTime(await this.transaction.query<{ request_time: string }>(
          "select app_private.request_time()::text as request_time"
        ))
      ]
    );
  }

  public async recordConflict(conflict: SyncConflictRecord): Promise<void> {
    await this.transaction.query(
      `select app_private.record_sync_conflict(
        $1::uuid,$2::uuid,$3::bigint,$4::jsonb,$5,$6::timestamptz
      )`,
      [
        conflict.conflictId,
        conflict.commandId,
        conflict.serverVersion,
        JSON.stringify(conflict.safeServerProjection),
        conflict.safeServerProjectionHash,
        conflict.detectedAt
      ]
    );
  }

  public upsertSafetyChecklistDraft(
    actor: TrustedActorContext,
    command: SafetyChecklistDraftCommand
  ): Promise<OfflineApplicationCommandResult> {
    assertTrustedActorContext(actor);
    return this.callHandler(
      `select * from public.r03_upsert_safety_checklist_draft(
        $1::uuid,$2::uuid,$3::uuid,$4::bigint,$5,$6::jsonb,$7::timestamptz
      )`,
      [command.commandId, command.aggregate.aggregateId, command.payload.safetyInspectionId,
        command.baseVersion, command.payload.note, JSON.stringify(command.payload.items), actor.requestTime]
    );
  }

  public upsertInspectionAttemptDraft(
    actor: TrustedActorContext,
    command: InspectionAttemptDraftCommand
  ): Promise<OfflineApplicationCommandResult> {
    assertTrustedActorContext(actor);
    return this.callHandler(
      `select * from public.r03_upsert_inspection_attempt_draft(
        $1::uuid,$2::uuid,$3::uuid,$4::bigint,$5,$6::jsonb,$7::timestamptz
      )`,
      [command.commandId, command.aggregate.aggregateId, command.payload.inspectionAttemptId,
        command.baseVersion, command.payload.summary, JSON.stringify(command.payload.results), actor.requestTime]
    );
  }

  public upsertFieldNoteDraft(
    actor: TrustedActorContext,
    command: FieldNoteDraftCommand
  ): Promise<OfflineApplicationCommandResult> {
    assertTrustedActorContext(actor);
    return this.callHandler(
      `select * from public.r03_upsert_field_note_draft(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::bigint,$6,$7::timestamptz,$8::timestamptz
      )`,
      [command.commandId, command.aggregate.aggregateId, command.payload.projectId,
        command.payload.wbsNodeId ?? null, command.baseVersion, command.payload.note,
        command.payload.observedAt, actor.requestTime]
    );
  }

  public updateWbsNodeProgress(
    actor: TrustedActorContext,
    command: WbsNodeProgressCommand
  ): Promise<OfflineApplicationCommandResult> {
    assertTrustedActorContext(actor);
    return this.callHandler(
      `select * from public.r03_update_wbs_progress(
        $1::uuid,$2::uuid,$3::bigint,$4::numeric,$5::timestamptz
      )`,
      [command.commandId, command.aggregate.aggregateId, command.baseVersion,
        command.payload.progressPercent, actor.requestTime]
    );
  }

  public upsertFieldRecordDraft(
    actor: TrustedActorContext,
    command: FieldRecordDraftCommand
  ): Promise<OfflineApplicationCommandResult> {
    assertTrustedActorContext(actor);
    return this.callHandler(
      `select * from public.r03_upsert_field_record_draft(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::bigint,$6,$7,$8::timestamptz,$9,$10::jsonb,$11::timestamptz
      )`,
      [command.commandId, command.aggregate.aggregateId, command.payload.projectId,
        command.payload.wbsNodeId ?? null, command.baseVersion, command.payload.recordType,
        command.payload.summary, command.payload.observedAt, command.payload.location ?? null,
        JSON.stringify(command.payload.measurements), actor.requestTime]
    );
  }

  private async callHandler(
    sql: string,
    parameters: readonly unknown[]
  ): Promise<OfflineApplicationCommandResult> {
    try {
      const result = await this.transaction.query<HandlerRow>(sql, parameters);
      const row = result.rows[0];
      if (row === undefined) throw new Error("offline handler returned no result");
      if (row.result_code === "APPLIED" && row.aggregate_version !== null) {
        return Object.freeze({ result: "APPLIED", aggregateVersion: version(Number(row.aggregate_version)) });
      }
      if (
        row.result_code === "STALE_BASE_VERSION" &&
        row.server_version !== null &&
        row.safe_server_projection !== null
      ) {
        const projectionHash = await this.transaction.query<{ projection_hash: string }>(
          `select encode(extensions.digest(
            convert_to(app_private.m15_canonical_json($1::jsonb), 'UTF8'), 'sha256'
          ), 'hex') as projection_hash`,
          [JSON.stringify(row.safe_server_projection)]
        );
        const exactHash = projectionHash.rows[0]?.projection_hash;
        if (exactHash === undefined) throw new Error("offline conflict projection hash is unavailable");
        return Object.freeze({
          result: "STALE_BASE_VERSION",
          serverVersion: version(Number(row.server_version)),
          safeServerProjection: row.safe_server_projection,
          safeServerProjectionHash: sha256(exactHash)
        });
      }
      if (row.result_code === "REJECTED" && row.reason_code !== null) {
        return Object.freeze({ result: "REJECTED", reasonCode: stableCode(row.reason_code) });
      }
      throw new Error("offline handler returned an invalid result contract");
    } catch (error) {
      const code = postgresCode(error);
      if (code === "42501" || code === "P0002" || code === "P0001") {
        return Object.freeze({ result: "REJECTED", reasonCode: stableCode("OFFLINE_COMMAND_NOT_ALLOWED") });
      }
      if (code === "22023" || code === "22P02" || code === "23514") {
        return Object.freeze({ result: "REJECTED", reasonCode: stableCode("OFFLINE_COMMAND_PRECONDITION_FAILED") });
      }
      throw error;
    }
  }
}

export function createPostgresOfflineSyncUnitOfWork(
  requests: TrustedRequestUnitOfWork
): PostgresOfflineSyncUnitOfWork {
  return new PostgresOfflineSyncUnitOfWork(requests);
}

export async function probePostgresOfflineSyncHandlers(pool: SqlPool): Promise<boolean> {
  const connection = await pool.connect();
  try {
    const result = await connection.query<{ installed: boolean }>(
      `select count(*) = 5 as installed
         from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = any($1::text[])`,
      [[
        "r03_upsert_safety_checklist_draft",
        "r03_upsert_inspection_attempt_draft",
        "r03_upsert_field_note_draft",
        "r03_update_wbs_progress",
        "r03_upsert_field_record_draft"
      ]]
    );
    return result.rows[0]?.installed === true;
  } finally {
    connection.release();
  }
}

function recordedTerminalResult(commandId: Uuid, row: RecordedRow): TerminalSyncCommandResult {
  if (row.result_code === "APPLIED" && row.aggregate_version !== null) {
    return Object.freeze({ result: "APPLIED", commandId, aggregateVersion: version(Number(row.aggregate_version)) });
  }
  if (row.result_code === "REJECTED" && row.reason_code !== null) {
    return Object.freeze({ result: "REJECTED", commandId, reasonCode: stableCode(row.reason_code) });
  }
  if (
    row.result_code === "SYNC_CONFLICT" && row.conflict_id !== null &&
    row.server_version !== null && row.local_payload !== null && row.local_payload_hash !== null &&
    row.safe_server_projection !== null && row.safe_server_projection_hash !== null && row.detected_at !== null
  ) {
    return Object.freeze({
      result: "SYNC_CONFLICT",
      commandId,
      conflict: Object.freeze({
        conflictId: uuid(row.conflict_id),
        commandId,
        commandType: row.command_type as SyncConflictRecord["commandType"],
        aggregateType: stableCode(row.aggregate_type),
        aggregateId: uuid(row.aggregate_id),
        baseVersion: version(Number(row.base_version)),
        serverVersion: version(Number(row.server_version)),
        localPayload: row.local_payload,
        localPayloadHash: sha256(row.local_payload_hash),
        safeServerProjection: row.safe_server_projection,
        safeServerProjectionHash: sha256(row.safe_server_projection_hash),
        state: "OPEN",
        detectedAt: utcInstant(row.detected_at instanceof Date ? row.detected_at : row.detected_at)
      })
    });
  }
  throw new Error("recorded offline result violates its terminal contract");
}

function requestTime(result: Readonly<{ rows: readonly Readonly<{ request_time: string }>[] }>): string {
  const value = result.rows[0]?.request_time;
  if (value === undefined) throw new Error("trusted request time is unavailable");
  return value;
}

function postgresCode(error: unknown): string | undefined {
  return error !== null && typeof error === "object" && "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;
}
