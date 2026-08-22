import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(import.meta.dirname, "../../supabase/migrations/20260822001300_m14_controlled_copy.sql"), "utf8");

describe("M14 controlled-copy migration contract", () => {
  it("registers the exact canonical machine and transitions", () => {
    for (const state of ["REQUESTED", "APPROVAL_PENDING", "APPROVED", "RENDERED", "PRINTED", "HANDED_OVER", "RETURN_DUE", "RETURNED", "DESTROYED", "OVERDUE", "CANCELLED"])
      expect(sql).toContain(`'SM-TECHDOC-COPY-V1','${state}'`);
    expect(sql).toContain("'SM-TECHDOC-COPY-V1','RETURNED',false");
    for (const event of ["REQUEST", "SUBMIT", "APPROVE", "RENDER", "PRINT", "HANDOVER", "RETURN-DUE", "RETURN", "DESTROY", "OVERDUE"])
      expect(sql).toContain(`'EVT-TECHCOPY-${event}'`);
  });

  it("binds exact DocumentVersion, Approval and typed Project/Contract scopes", () => {
    expect(sql).toContain("references public.document_version(id,document_id,version_no,sealed_snapshot_checksum,sealed_at)");
    expect(sql).toContain("create table public.approval_subject_technical_copy_request");
    expect(sql).toContain("TECHNICAL_DOCUMENT_COPY_REQUEST");
    expect(sql).toContain("exact sealed controlled-copy request subject mismatch");
    expect(sql).toContain("create table public.technical_copy_document_project_scope");
    expect(sql).toContain("create table public.technical_copy_document_contract_scope");
    expect(sql).toContain("request owner and exact sealed copy Approval required");
    expect(sql).toContain("perform_technical_copy_approval_action");
    expect(sql).toContain("controlled-copy approval actions require typed command path");
    expect(sql).not.toMatch(/subject_type\s+text|resource_type\s+text.*resource_id/i);
  });

  it("requires Director for L3 and Director plus Representative for L4", () => {
    expect(sql).toContain("POSITION_LAB_DIRECTOR");
    expect(sql).toContain("POSITION_REPRESENTATIVE");
    expect(sql).toContain("completed exact L3/L4 Approval route required");
    expect(sql).toContain("approval_action");
  });

  it("creates concurrent-safe unique copy numbers and exact reprint lineage", () => {
    expect(sql).toContain("create sequence public.technical_copy_number_sequence");
    expect(sql).toContain("copy_no text not null unique");
    expect(sql).toContain("reprint_of_copy_id uuid unique");
    expect(sql).toContain("reprint exact predecessor and reason required");
  });

  it("stores source/output hashes and private exact artifact tuples", () => {
    expect(sql).toContain("source_snapshot_checksum text not null");
    expect(sql).toContain("source_attachment_id uuid not null");
    expect(sql).toContain("source_file_checksum text not null");
    expect(sql).toContain("output_checksum text");
    expect(sql).toContain("watermark_manifest_checksum text");
    expect(sql).toContain("references public.attachment(id,row_version,detected_sha256)");
    expect(sql).not.toMatch(/public_url|signed_url|download_token|source_storage_key/i);
  });

  it("uses append-only custody and atomic Audit/Transition/Outbox commands", () => {
    expect(sql).toContain("controlled-copy custody/evidence is append-only");
    expect(sql).toContain("app_private.append_audit");
    expect(sql).toContain("app_private.append_state_transition");
    expect(sql).toContain("app_private.enqueue_outbox");
    expect(sql).toContain("app_private.next_version");
  });

  it("requires active Vendor membership and exact Project AND Contract grants", () => {
    expect(sql).toContain("project_vendor_grant");
    expect(sql).toContain("contract_vendor_grant");
    expect(sql).toContain("actor_has_project_vendor_scope");
    expect(sql).toContain("actor_has_contract_vendor_scope");
    expect(sql).toContain("VENDOR-SCOPE-LOST-HANDOVER-DENIED");
    expect(sql).toContain("target_contract is null or exists");
  });

  it("keeps render and monitoring worker-only and Vendor projection allowlisted", () => {
    expect(sql).toContain("DOCUMENT_ENGINE");
    expect(sql).toContain("APPROVAL_ENGINE");
    expect(sql).toContain("TECHCOPY_CUSTODY_MONITOR");
    expect(sql).toContain("technical_copy_vendor_projection_allowlist");
    expect(sql).toContain("read_vendor_controlled_copy");
  });

  it("uses the public request, print, custody, return and destroy permission IDs", () => {
    for (const permission of ["request", "print", "custody", "return", "destroy"])
      expect(sql).toContain(`'technical_document.copy.${permission}'`);
    expect(sql).not.toContain("'technical_document.access.grant'");
    expect(sql).not.toContain("'technical_document.copy.handover'");
    expect(sql).not.toContain("'technical_document.copy.close'");
  });

  it("forces RLS, revokes direct writes and hard-denies Admin source operations", () => {
    expect(sql).toContain("force row level security");
    expect(sql).toContain("revoke all on table");
    expect(sql).toContain("ADMIN_SYSTEM");
    expect(sql).not.toMatch(/grant\s+(?:select|execute)[\s\S]{0,80}(?:render_technical_document_copy|technical_copy_number_sequence)\s+to\s+youone_request/i);
  });

  it("makes overdue detection idempotent without physical auto-completion", () => {
    expect(sql).toContain("technical_copy_overdue_alert");
    expect(sql).toContain("idempotency_key text not null unique");
    expect(sql).toContain("EVT-TECHCOPY-OVERDUE");
    expect(sql).not.toMatch(/mark_technical_copy_overdue[\s\S]{0,4000}set\s+state\s*=\s*'(?:RETURNED|DESTROYED)'/i);
  });
});
