import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(import.meta.dirname, "../../supabase/migrations/20260822000700_m08_quality_inspection.sql"), "utf8");

describe("M08 Quality/Inspection/Acceptance migration contract", () => {
  it("normalizes Requirement revisions, exact test-plan coverage and immutable test evidence", () => {
    for (const table of ["requirement", "requirement_revision", "test_plan_version", "test_plan_requirement_coverage", "test_result", "test_measurement", "test_result_evidence"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
    expect(sql).toContain("RequirementRevision must be direct-next on the same Requirement");
    expect(sql).toContain("foreign key(test_plan_version_id,requirement_revision_id)");
    expect(sql).toContain("references public.test_plan_requirement_coverage(test_plan_version_id,requirement_revision_id)");
    expect(sql).toContain("TestResult children require exact trusted DRAFT command");
    expect(sql).toContain("sealed TestPlanVersion children are immutable");
    expect(sql).toContain("exact sealed TestPlanVersion");
  });

  it("models inspection checklist, criteria, attempts, results, residuals and partial portions relationally", () => {
    for (const table of ["inspection", "inspection_checklist_version", "inspection_criterion", "inspection_attempt", "inspection_criterion_result", "inspection_evidence", "inspection_partial_usable_portion", "inspection_residual_condition"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
    expect(sql).toContain("total_weight_percent=100");
    expect(sql).toContain("sealed InspectionAttempt evidence is immutable");
    expect(sql).toContain("foreign key(inspection_attempt_id,inspection_checklist_version_id)");
    expect(sql).toContain("foreign key(inspection_evidence_id,inspection_id)");
    expect(sql).toContain("foreign key(inspection_attempt_id,deliverable_version_id)");
  });

  it("binds payment decisions to an exact sealed attempt and exact versioned score/payment policy", () => {
    expect(sql).toContain("create table public.acceptance_payment_decision");
    expect(sql).toContain("foreign key(inspection_attempt_id,inspection_id,inspection_attempt_no,inspection_attempt_checksum)");
    expect(sql).toContain("score_policy_version_id uuid not null");
    expect(sql).toContain("references public.acceptance_score_policy_version(id,policy_id,version_no,checksum)");
    expect(sql).toContain("score_policy_version_id=attempt_row.policy_version_id");
    expect(sql).toContain("canonical checksum mismatch");
    expect(sql).toContain("score policy bands must be non-overlapping");
    expect(sql).toContain("payment rules must be non-overlapping");
    expect(sql).not.toMatch(/insert into public\.acceptance_(?:score_policy_band|payment_rate_rule)/i);
  });

  it("uses an exact typed Approval subject and freezes approval basis without creating eligibility", () => {
    expect(sql).toContain("create table public.approval_subject_acceptance_payment_decision");
    expect(sql).toContain("references public.acceptance_payment_decision(id,decision_root_id,revision_no,version_no,sealed_snapshot_checksum,sealed_at)");
    expect(sql).toContain("create trigger approval_action_acceptance_payment_path_guard");
    expect(sql).toContain("function public.create_acceptance_payment_approval_instance");
    expect(sql).toContain("function public.bind_acceptance_payment_approval_subject");
    expect(sql).toContain("function public.submit_acceptance_payment_approval_instance");
    expect(sql).toContain("function public.perform_acceptance_payment_approval_action");
    expect(sql).toContain("function public.apply_acceptance_payment_approval_outcome");
    expect(sql).toContain("representative_completion_mode text not null");
    expect(sql).toContain("covers_upward_adjustment boolean not null");
    expect(sql).toContain("ACCEPTANCE_PAYMENT_APPROVAL_SELECTOR_V1");
    expect(sql).toContain("amount/risk/upward-adjustment Approval selector must resolve exactly one effective policy");
    expect(sql).toMatch(/revoke all on function[\s\S]*public\.create_acceptance_payment_approval_instance\(uuid,bigint,uuid,uuid,text,uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz\)[\s\S]*from public,youone_privileged_writer/);
    expect(sql).toContain("approved payment basis and final rate are frozen");
    expect(sql).toContain("approved_payable_amount numeric(20,2)");
    expect(sql).toContain("amount_rounding_decimal_places integer not null check(amount_rounding_decimal_places between 0 and 2)");
    const outcome = sql.slice(sql.indexOf("function public.apply_acceptance_payment_approval_outcome"), sql.indexOf("function public.decide_inspection"));
    expect(outcome).not.toContain("ELIGIBLE_FOR_EXTERNAL_PAYMENT");
  });

  it("preserves residual satisfaction actor/evidence and requires a separate evidence-backed release", () => {
    expect(sql).toContain("satisfied_by_user_id uuid");
    expect(sql).toContain("create table public.acceptance_payment_residual_condition_evidence");
    expect(sql).toContain("function public.satisfy_acceptance_payment_condition");
    expect(sql).toContain("function public.mark_acceptance_payment_eligible");
    expect(sql).toContain("not p.release_eligible");
    expect(sql).toContain("held_amount numeric(20,2)");
    expect(sql).toContain("unpaid_remainder numeric(20,2)");
    expect(sql).toContain("target_unpaid_remainder<>target_held_amount");
    expect(sql).toContain("post-seal evidence requires exact AVAILABLE scanned Attachment snapshot");
    expect(sql).toContain("state='ELIGIBLE_FOR_EXTERNAL_PAYMENT',held_amount=0,unpaid_remainder=0");
  });

  it("denies Vendor self-accept and keeps external and finance projections separate", () => {
    expect(sql).toContain("active VendorMembership and ContractScope required");
    expect(sql).not.toContain("USER_VENDOR");
    expect(sql).toContain("function public.decide_inspection");
    expect(sql).toContain("m08_assert_direct_internal(target_occurred_at,'inspection.record.decide')");
    expect(sql).toContain("Vendor self-accept is forbidden");
    const external = sql.slice(sql.indexOf("function public.read_inspection_external"), sql.indexOf("comment on function public.read_inspection_external"));
    for (const forbidden of ["milestone_amount", "currency", "calculated_proposed_rate", "final_approved_rate", "held_amount", "unpaid_remainder"]) {
      expect(external).not.toContain(forbidden);
    }
    expect(sql).toContain("actor_has_permission('contract.detail.finance.read'");
    expect(sql).toContain("actor_has_permission('acceptance_payment.finance.read'");
  });

  it("forces RLS, denies direct writes and records state/audit/outbox atomically", () => {
    expect(sql).toContain("alter table public.%I force row level security");
    expect(sql).toContain("from public,youone_request,youone_privileged_writer");
    expect(sql).toContain("perform app_private.append_audit");
    expect(sql).toContain("perform app_private.append_state_transition");
    expect(sql).toContain("perform app_private.enqueue_outbox");
    expect(sql).toContain("external_transfer_executed boolean not null default false check(not external_transfer_executed)");
    expect(sql).not.toMatch(/create table public\.(?:payment_transfer|accounting_entry)/i);
    expect(sql).not.toMatch(/function public\.(?:execute|send|transfer)_payment/i);
  });
});
