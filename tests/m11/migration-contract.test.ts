import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(import.meta.dirname, "../../supabase/migrations/20260822001000_m11_purchase_rnd.sql"), "utf8");

describe("M11 Purchase/R&D migration contract", () => {
  it("registers only the canonical Purchase machine and transitions", () => {
    expect(sql).toContain("('SM-PURCHASE-V1','PURCHASE_REQUEST')");
    for (const event of ["CREATE", "DRAFT-REQUEST", "REVISE-AFTER-NEGATIVE-APPROVAL", "SUBMIT", "APPROVED", "CREATE-RESOLUTION", "RESOLVE", "AWAIT-PAYMENT",
      "CONFIRM-PAYMENT", "RECEIVE-PART", "RECEIVE", "REQUEST-INSPECTION", "INSPECTION-FAIL", "INSPECTION-PASS", "RESOLVE-CORRECTION"]) {
      expect(sql).toContain(`'EVT-PURCHASE-${event}'`);
    }
    expect(sql).not.toMatch(/state_machine_definition[^;]*RND_PROGRAM/is);
    expect(sql).not.toMatch(/SM-RND-PROGRAM|EVT-RND-PROGRAM-(CLOSE|REOPEN)|close_rnd_program|reopen_rnd_program/i);
  });

  it("separates Supplier from Vendor and uses exact private quotation evidence", () => {
    expect(sql).toContain("create table public.supplier (");
    expect(sql).toContain("create table public.supplier_vendor_link (");
    expect(sql).toContain("create table public.item (");
    expect(sql).toContain("references public.attachment(id,row_version,detected_sha256)");
    expect(sql).not.toMatch(/public_url|signed_url|storage_token/i);
  });

  it("binds an immutable exact PurchaseRequestVersion Approval subject and amount facts", () => {
    expect(sql).toContain("'PURCHASE_REQUEST_VERSION'");
    expect(sql).toContain("create table public.approval_subject_purchase_request_version");
    expect(sql).toContain("references public.purchase_request_version(id,purchase_request_id,version_no,sealed_snapshot_checksum,sealed_at)");
    expect(sql).toContain("anti_split_window_start");
    expect(sql).toContain("effective_policy_amount");
    expect(sql).toContain("create table public.purchase_approval_preset_version");
    expect(sql).toContain("INTERNAL_PRESET_NOT_STATUTORY");
    expect(sql).toContain("create table public.purchase_approval_policy_snapshot");
    expect(sql).toContain("assert_purchase_policy_selection");
    expect(sql).toContain("create or replace function public.perform_purchase_approval_action");
    expect(sql).toContain("p.stable_code<>'POSITION_SENIOR_RESEARCHER'");
  });

  it("normalizes resolution, external payment fact, Receipt lines and Purchase Inspection", () => {
    for (const table of ["purchase_resolution", "purchase_external_payment_fact", "receipt", "receipt_line", "receipt_overage_discrepancy", "purchase_inspection"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
    expect(sql).toContain("observed overage requires one quarantined discrepancy");
    expect(sql).toContain("quarantined boolean not null default true check(quarantined)");
    expect(sql).toContain("resolution_status text not null default 'PENDING'");
    expect(sql).toContain("EXTERNAL-PAYMENT-FACT-RECORDED");
    expect(sql).toContain("fully received purchase required");
  });

  it("models lifecycle-free R&D facts with immutable budgets, typed expenditure links and idempotent alerts", () => {
    for (const table of ["rnd_program", "project_rnd_program", "rnd_budget_version", "rnd_budget_line", "rnd_expenditure",
      "rnd_expenditure_project", "rnd_expenditure_contract", "rnd_expenditure_purchase", "rnd_evidence", "rnd_evidence_expenditure",
      "rnd_evidence_budget_version", "rnd_evidence_deadline", "rnd_report_deadline", "rnd_alert"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
    expect(sql).toContain("budget overrun is forbidden");
    expect(sql).toContain("on conflict(idempotency_key) do nothing");
    expect(sql).toContain("R&D evidence requires exactly one typed subject");
    expect(sql).toContain("unique(id,rnd_budget_id,version_no)");
    expect(sql).toContain("references public.contract_version(id,contract_id,version_no,sealed_snapshot_checksum,sealed_at)");
    expect(sql).toContain("No lifecycle state, transition registry, close, reopen, payment, journal, or RCMS command");
    expect(sql).not.toMatch(/create (?:or replace )?function public\.(?:pay|transfer|journal|rcms)/i);
  });

  it("forces RLS, revokes request writes, hard-denies HQ mutation and exposes explicit projections", () => {
    expect(sql).toContain("force row level security");
    expect(sql).toContain("revoke all on table public.%I from public,youone_request,youone_privileged_writer");
    expect(sql).toContain("HQ Viewer is read-only for Purchase and R&D");
    expect(sql).toContain("function public.read_purchase_hq");
    expect(sql).toContain("function public.read_rnd_program_summary");
    const projection = sql.slice(sql.indexOf("function public.read_purchase_hq"), sql.indexOf("create or replace function public.submit_approval_instance"));
    for (const forbidden of ["attachment_checksum", "external_reference", "approval_instance_id", "business_registration_no"]) {
      expect(projection).not.toContain(forbidden);
    }
  });

  it("uses optimistic state plus Audit/Transition/Outbox transaction helpers", () => {
    expect(sql).toContain("app_private.next_version");
    expect(sql).not.toMatch(/\bnext\s+bigint\b|return\s+next\s*;/i);
    expect(sql).toContain("perform app_private.append_audit");
    expect(sql).toContain("perform app_private.append_state_transition");
    expect(sql).toContain("perform app_private.enqueue_outbox");
    expect(sql).toContain("create constraint trigger receipt_line_over_receipt");
    expect(sql).toContain("create constraint trigger rnd_expenditure_budget_evidence");
    expect(sql).toContain("create or replace function public.create_purchase_request_revision");
  });
});
