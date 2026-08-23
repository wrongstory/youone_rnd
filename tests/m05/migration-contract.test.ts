import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(import.meta.dirname, "../../supabase/migrations/20260822000400_m05_document_file.sql"), "utf8");

describe("M05 document/file migration contract", () => {
  it("models versioned templates, documents and private attachment metadata", () => {
    for (const table of ["template_version", "document", "document_version", "attachment", "document_attachment"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
    expect(sql).toContain("unique(template_id,version_no)");
    expect(sql).toContain("unique(document_id,version_no)");
    expect(sql).toContain("storage_provider text not null check(storage_provider='SUPABASE_PRIVATE')");
    expect(sql).toContain("bucket_code text not null check(bucket_code='PRIVATE_BUSINESS')");
    expect(sql).not.toMatch(/public_url|signed_url|access_token|refresh_token/i);
  });

  it("binds validation, seal, scan and approval evidence by exact composite foreign keys", () => {
    expect(sql).toContain("document_content_validation_evidence_fk");
    expect(sql).toContain("document_seal_evidence_exact_fk");
    expect(sql).toContain("attachment_scan_evidence_fk");
    expect(sql).toContain("create table public.approval_subject_document_version");
    expect(sql).toContain("subject_sealed_at timestamptz not null");
    expect(sql).toContain("references public.document_version(id,document_id,version_no,sealed_snapshot_checksum,sealed_at)");
    expect(sql).not.toMatch(/subject_type\s+text[\s\S]{0,80}subject_id\s+uuid/i);
  });

  it("recomputes canonical content and full manifests rather than trusting caller hashes", () => {
    expect(sql).toContain("app_private.canonical_json_sha256(target_editor_content)<>target_content_checksum");
    expect(sql).toContain("DOCUMENT_SEALED_MANIFEST");
    for (const component of ["version_row.security_level_snapshot", "a.detected_mime_type", "a.detected_size_bytes", "a.security_level", "a.scan_evidence_id"]) {
      expect(sql).toContain(component);
    }
    expect(sql).toContain("for update of a");
  });

  it("keeps failed upload evidence while allowing guarded draft-only logical removal", () => {
    expect(sql).toContain("link_state text not null default 'ACTIVE'");
    expect(sql).toContain("function public.remove_document_attachment");
    expect(sql).toContain("document attachment evidence cannot be deleted");
    expect(sql).toContain("document attachment snapshot is immutable outside guarded draft removal");
  });

  it("implements the canonical upload/scan states and exact CLEAN availability", () => {
    for (const state of ["UPLOAD_INTENDED", "UPLOADED", "SCANNING", "AVAILABLE", "QUARANTINED"]) expect(sql).toContain(`'${state}'`);
    expect(sql).toContain("target_signature_validation='MATCH' and target_scan_verdict='CLEAN'");
    expect(sql).toContain("attachment_row.expected_sha256=attachment_row.detected_sha256");
    expect(sql).toContain("m05_assert_worker(target_occurred_at,'FILE_INGEST')");
    expect(sql).toContain("m05_assert_worker(target_occurred_at,'FILE_SCANNER')");
  });

  it("uses canonical authorization identifiers and denies vendor/source shortcuts", () => {
    expect(sql).toContain("technical_document.content.preview");
    expect(sql).toContain("technical_document.content.download");
    expect(sql).toContain("ENTITLEMENT_L3_SOURCE_READ");
    expect(sql).toContain("ENTITLEMENT_L4_SOURCE_READ");
    expect(sql).not.toContain("SEC_L3_SOURCE_READ");
    expect(sql).not.toContain("file.attachment.download");
    expect(sql).toContain("app_private.approval_actor_is_internal(target_time)");
    expect(sql).toContain("case v.security_level_snapshot");
  });

  it("uses FORCE RLS, denies table writes and exposes only guarded commands", () => {
    expect(sql.match(/force row level security/g)?.length).toBeGreaterThanOrEqual(15);
    expect(sql).toContain("from public,youone_request,youone_privileged_writer");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+table/i);
    expect(sql).toContain("Returns server-only private object coordinates");
  });

  it("integrates exact DocumentVersion submission and outcome with M04 approval transactions", () => {
    expect(sql).toContain("function public.create_document_approval_instance");
    expect(sql).toContain("function public.perform_document_approval_action");
    expect(sql).toContain("function app_private.apply_document_approval_transition");
    expect(sql).toContain("approval_instance_document_subject_apply");
    expect(sql).toContain("document approval actions require the typed document command path");
    expect(sql).toContain("previous_subject.document_version_id=version_row.prior_version_id");
  });

  it("provides explicit guarded template and rejected/recalled revision paths", () => {
    expect(sql).toContain("function public.create_template_draft");
    expect(sql).toContain("function public.seal_template_version");
    expect(sql).toContain("function public.create_document_revision");
    expect(sql).toContain("prior_row.state not in ('REJECTED','RECALLED','APPROVED')");
    expect(sql).toContain("'EVT-DOCUMENT-REVISE','APPROVED','SUPERSEDED'");
  });

  it("resolves deferred head checks without cross-table NEW field access", () => {
    expect(sql).toContain("if tg_table_name='document' then");
    expect(sql).toContain("elsif tg_table_name='document_version' then");
    expect(sql).not.toMatch(/target_document uuid:=case when tg_table_name='document'/);
  });

  it("always gives successful document and attachment transition audits evidence", () => {
    const documentTransition = sql.slice(
      sql.indexOf("create or replace function app_private.append_document_transition"),
      sql.indexOf("create or replace function app_private.enqueue_document_event"),
    );
    const attachmentTransition = sql.slice(
      sql.indexOf("create or replace function app_private.append_attachment_transition"),
      sql.indexOf("create or replace function app_private.enqueue_attachment_event"),
    );
    expect(sql).toContain("evidence_reason text:=coalesce(target_reason_code,target_event_id)");
    expect(documentTransition).toContain("select v.content_checksum,v.sealed_snapshot_checksum into strict content_hash,sealed_hash");
    expect(documentTransition).toContain("evidence_reason,null,evidence_before_hash,evidence_after_hash,null,target_occurred_at");
    expect(attachmentTransition).toContain("select a.expected_sha256,a.detected_sha256 into strict expected_hash,detected_hash");
    expect(attachmentTransition).toContain("evidence_reason,null,evidence_before_hash,evidence_after_hash,null,target_occurred_at");
    expect(sql).toContain("if target_reason_code is null then raise exception 'attachment removal reason required'");
  });

  it("bootstraps a private Supabase bucket from a hosted provider default-deny baseline", () => {
    expect(sql).toContain("to_regclass('storage.objects')");
    expect(sql).toContain("storage_rls_enabled is distinct from true");
    expect(sql).toContain("youone capability roles must not access provider-owned storage.objects");
    expect(sql).toContain("storage_policy_count<>0");
    expect(sql).toContain("to_regclass('storage.buckets')");
    expect(sql).toContain("values('PRIVATE_BUSINESS','PRIVATE_BUSINESS',false,50000000");
  });
});
