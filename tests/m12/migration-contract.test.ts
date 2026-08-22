import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(import.meta.dirname, "../../supabase/migrations/20260822001100_m12_research_note.sql"), "utf8");

describe("M12 ResearchNote migration contract", () => {
  it("registers the exact canonical machine without Representative Approval", () => {
    for (const state of ["DRAFT", "SENIOR_REVIEW_PENDING", "REVISION_REQUIRED", "DIRECTOR_FINALIZATION_PENDING", "FINALIZED", "CORRECTED_BY_ADDENDUM", "VOIDED_BY_POLICY"]) {
      expect(sql).toContain(`'SM-RESEARCH-NOTE-V1','${state}'`);
    }
    for (const event of ["CREATE", "SUBMIT-SENIOR", "SUBMIT-DIRECTOR", "REQUEST-REVISION", "RESUBMIT", "REVIEWED", "FINALIZE", "ADD-CORRECTION"]) {
      expect(sql).toContain(`'EVT-NOTE-${event}'`);
    }
    expect(sql).not.toMatch(/EVT-NOTE-(?:APPROVE|REPRESENTATIVE)|approval_subject_research_note/i);
  });

  it("normalizes exact Project/RndProgram, entry, review, finalization and PDF evidence", () => {
    for (const table of ["research_note", "research_note_entry_version", "research_note_entry_attachment", "research_note_senior_review", "research_note_pdf_manifest", "research_note_finalization"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
    expect(sql).toContain("project_id uuid not null references public.project(id)");
    expect(sql).toContain("rnd_program_id uuid references public.rnd_program(id)");
    expect(sql).toContain("references public.attachment(id,row_version,detected_sha256)");
    expect(sql).not.toMatch(/public_url|signed_url|download_token|storage_token/i);
  });

  it("preserves direct immutable entry lineage and finalized predecessor correction", () => {
    expect(sql).toContain("foreign key(prior_entry_version_id,research_note_id)");
    expect(sql).toContain("foreign key(corrects_entry_version_id,research_note_id)");
    expect(sql).toContain("exact direct finalized predecessor required");
    expect(sql).toContain("sealed ResearchNoteEntry is immutable");
    expect(sql).toContain("final ResearchNote evidence is append-only");
  });

  it("enforces assigned active Senior review and Lab Director-only finalization", () => {
    expect(sql).toContain("POSITION_SENIOR_RESEARCHER");
    expect(sql).toContain("POSITION_LAB_DIRECTOR");
    expect(sql).toContain("POSITION_REPRESENTATIVE");
    expect(sql).toContain("assigned active Senior review required");
    expect(sql).toContain("Lab Director exact entry finalization required");
    expect(sql).toContain("Optional Senior review evidence only; it is not official Approval authority.");
  });

  it("computes content and attachment-manifest hashes inside Postgres", () => {
    expect(sql).toContain("function app_private.m12_compute_content_checksum");
    expect(sql).toContain("function app_private.m12_compute_snapshot_checksum");
    expect(sql).toContain("app_private.canonical_json_sha256");
    expect(sql).toContain("RESEARCH_NOTE_PDF_MANIFEST_V1");
    expect(sql).toContain("manifest_checksum text not null");
    expect(sql).toContain("foreign key(finalization_id,research_note_id)");
    expect(sql.indexOf("create table public.research_note_finalization")).toBeLessThan(sql.indexOf("create table public.research_note_pdf_manifest"));
    expect(sql).not.toMatch(/\bnext\s+bigint\b|return\s+next\s*;/i);
  });

  it("forces RLS, revokes direct writes and separates worker-only PDF rendering", () => {
    expect(sql).toContain("force row level security");
    expect(sql).toContain("revoke all on table public.%I from public,youone_request,youone_privileged_writer");
    expect(sql).toContain("grant execute on function %s to youone_privileged_writer");
    expect(sql).toContain("app_private.m05_assert_worker(target_time,'DOCUMENT_ENGINE')");
    expect(sql).toContain("ADMIN_SYSTEM");
  });

  it("persists optimistic state, Audit, Transition and Outbox atomically", () => {
    expect(sql).toContain("app_private.next_version");
    expect(sql).toContain("app_private.append_audit");
    expect(sql).toContain("app_private.append_state_transition");
    expect(sql).toContain("app_private.enqueue_outbox");
  });
});
