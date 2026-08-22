import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql=readFileSync(resolve(import.meta.dirname,"../../supabase/migrations/20260823001400_m15_pwa_offline_sync.sql"),"utf8");

describe("M15 offline synchronization migration contract",()=>{
  it("persists an explicit reviewed allowlist and an explicit online-only deny registry",()=>{
    for(const type of ["CMD-OFFLINE-CHECKLIST-DRAFT-UPSERT","CMD-OFFLINE-INSPECTION-DRAFT-UPSERT","CMD-OFFLINE-FIELD-NOTE-DRAFT-UPSERT","CMD-OFFLINE-WORK-ITEM-PROGRESS-UPDATE","CMD-OFFLINE-FIELD-RECORD-DRAFT-UPSERT"])
      expect(sql).toContain(`('${type}','OFFLINE_ALLOWED',1)`);
    for(const type of ["CMD-APPROVAL-ACTION","CMD-AUTHORIZATION-ASSIGNMENT-CHANGE","CMD-SCOPE-GRANT-CHANGE","CMD-TECHNICAL-DOCUMENT-L2-L4-ACCESS","CMD-TECHNICAL-DOCUMENT-CONTROLLED-COPY","CMD-CONTRACT-SIGN","CMD-CONTRACT-TERMINATE","CMD-PAYMENT-CONFIRM"])
      expect(sql).toContain(`('${type}','ONLINE_ONLY',1)`);
  });

  it("stores structured immutable command, result, conflict, and resolution records",()=>{
    for(const table of ["offline_command","offline_command_result","sync_conflict","sync_conflict_resolution"])
      expect(sql).toContain(`create table public.${table}`);
    expect(sql).toContain("offline command and conflict evidence is append-only");
    expect(sql).toContain("create trigger sync_conflict_resolution_immutable");
    expect(sql).not.toMatch(/last.write.wins|auto.?merge|auto.?overwrite/i);
  });

  it("binds actor and session snapshots without storing raw sessions or credentials",()=>{
    expect(sql).toContain("authenticated_actor_user_id uuid not null references public.user_account(id)");
    expect(sql).toContain("effective_actor_user_id uuid not null references public.user_account(id)");
    expect(sql).toContain("session_binding_hash text not null");
    expect(sql).toContain("target_session_binding_hash<>expected_binding");
    expect(sql).not.toMatch(/session_id\s+text|access_token|refresh_token|bearer_token/i);
  });

  it("requires canonical minimized payload bytes and exact SHA-256",()=>{
    expect(sql).toContain("app_private.m15_canonical_json");
    expect(sql).toContain("payload_json=app_private.m15_canonical_json(payload_json::jsonb)");
    expect(sql).toContain("payload_hash=encode(extensions.digest(convert_to(payload_json,'UTF8'),'sha256'),'hex')");
    expect(sql).toContain("payload_contains_forbidden_key");
  });

  it("preserves both conflict sides and permits only explicit terminal resolution records",()=>{
    expect(sql).toContain("sync conflict must preserve exact local payload");
    expect(sql).toContain("safe_server_projection jsonb not null");
    expect(sql).toContain("server_version bigint not null check(server_version>base_version)");
    expect(sql).toContain("RESOLVED_DISCARD_LOCAL");
    expect(sql).toContain("RESOLVED_RETRY_AS_NEW");
    expect(sql).toContain("successor.authenticated_actor_user_id=owner_id");
    expect(sql).toContain("successor.command_type=conflict_record.command_type");
    expect(sql).toContain("successor.aggregate_id=conflict_record.aggregate_id");
    expect(sql).toContain("successor.base_version=conflict_record.server_version");
    expect(sql).toContain("s.conflict_id=sync_conflict_resolution.conflict_id");
    expect(sql).not.toContain("RESOLVED_MERGED");
  });

  it("forces RLS, denies direct writes, and exposes controlled functions by principal",()=>{
    expect(sql).toContain("force row level security");
    expect(sql).toContain("revoke all on table");
    expect(sql).toContain("grant execute on function app_private.register_offline_command");
    expect(sql).toContain("to youone_request");
    expect(sql).toContain("from public,youone_request,youone_privileged_writer");
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete)\s+on\s+public\.(?:offline_command|sync_conflict)/i);
  });
});
