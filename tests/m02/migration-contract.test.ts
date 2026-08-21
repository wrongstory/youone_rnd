import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(import.meta.dirname, "../../supabase/migrations/20260821000100_m02_database_audit_kernel.sql"), "utf8");

describe("M02 migration contract", () => {
  it("keeps evidence append-only and delivery state separate", () => {
    expect(migration).toContain("audit_log_append_only");
    expect(migration).toContain("state_transition_append_only");
    expect(migration).toContain("outbox_event_immutable");
    expect(migration).toContain("outbox_consumer_ledger_append_only");
    expect(migration).toContain("domain_event_definition_immutable");
    expect(migration).toContain("transition_definition_immutable");
    expect(migration).toContain("create table public.outbox_delivery");
    expect(migration).toContain("initiating_audit_log_id uuid not null references public.audit_log(id)");
    expect(migration).toContain("primary key (event_id, payload_schema_id, payload_schema_version)");
  });

  it("uses aggregate target version uniqueness, not command-only uniqueness", () => {
    expect(migration).toContain("unique (aggregate_type, aggregate_id, to_version)");
    expect(migration).not.toMatch(/unique\s*\(\s*command_id\s*\)/i);
  });

  it("keeps event payload schema versions as append-only composite rows", () => {
    expect(migration).toContain(
      "primary key (event_id, payload_schema_id, payload_schema_version)"
    );
    expect(migration).not.toContain("current_schema_version");
  });

  it("does not invent feature tables or R&D states", () => {
    expect(migration).not.toMatch(/create table public\.(project|contract|approval|document|rnd_program)\b/i);
    expect(migration).not.toContain("SM-RND-PROGRAM");
  });

  it("creates NOBYPASSRLS capability roles and deny-first RLS", () => {
    expect(migration).toMatch(/create role youone_request[\s\S]*nobypassrls/i);
    expect(migration).toMatch(/create role youone_privileged_writer[\s\S]*nobypassrls/i);
    expect(migration).toContain("alter table public.audit_log enable row level security");
    expect(migration).toContain("revoke all on all tables in schema public");
  });
});
