import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(import.meta.dirname, "../../supabase/migrations/20260822000900_m10_ecr_eco.sql"), "utf8");

describe("M10 ECR/ECO migration contract", () => {
  it("registers the canonical machines, transitions and stable change permissions", () => {
    expect(sql).toContain("('SM-ECR-V1','CHANGE_REQUEST')");
    expect(sql).toContain("('SM-ECO-V1','CHANGE_ORDER')");
    for (const event of ["EVT-ECR-CREATE", "EVT-ECR-START-ANALYSIS", "EVT-ECR-SUBMIT-REVIEW", "EVT-ECR-REVIEWED",
      "EVT-ECR-APPROVE", "EVT-ECR-REJECT", "EVT-ECR-CREATE-ECO", "EVT-ECO-CREATE", "EVT-ECO-SUBMIT",
      "EVT-ECO-RELEASE", "EVT-ECO-START", "EVT-ECO-IMPLEMENT-TARGET", "EVT-ECO-SUBMIT-VERIFY", "EVT-ECO-VERIFY",
      "EVT-ECO-CLOSE", "EVT-ECO-SUSPEND", "EVT-ECO-RECORD-RETROSPECTIVE-APPROVAL"]) expect(sql).toContain(`'${event}'`);
    for (const permission of ["change.request.create", "change.request.manage", "change.impact.analyze", "change.request.review",
      "change.request.approve", "change.order.manage", "change.order.emergency_release", "change.order.implement", "change.order.verify"]) {
      expect(sql).toContain(`'${permission}'`);
    }
    expect(sql).not.toMatch(/ecr\.record\.|eco\.record\.|eco\.implementation\./);
  });

  it("requires exactly one evidence-backed result for all six normalized impact dimensions", () => {
    expect(sql).toContain("impact_kind in ('COST','SCHEDULE','QUALITY','SAFETY','SECURITY','REGULATORY')");
    expect(sql).toContain("effect in ('NO_IMPACT','AFFECTED')");
    expect(sql).toContain("unique(change_request_version_id,impact_kind)");
    expect(sql).toContain("create table public.ecr_impact_analysis");
    expect(sql).toContain("create table public.change_impact_evidence");
    expect(sql).toContain("all six impact dimensions require one assessment");
    expect(sql).toContain("'evidence',coalesce");
  });

  it("uses a controlled target index with exactly one of six typed FK relations and no BOM persistence", () => {
    expect(sql).toContain("create table public.change_target");
    for (const table of ["change_order_requirement_target", "change_order_document_target", "change_order_deliverable_target",
      "change_order_inspection_checklist_target", "change_order_test_plan_target", "change_order_contract_target"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
    expect(sql).toContain("change target requires exactly one typed FK relation");
    expect(sql).toContain("after_revision_id<>before_revision_id");
    expect(sql).not.toMatch(/create table public\.(bom|change_order_bom_target)/i);
    expect(sql).not.toMatch(/subject_type|generic_subject|target_payload\s+jsonb/i);
  });

  it("binds exact immutable ECR/ECO subject versions and official outcomes", () => {
    expect(sql).toContain("'CHANGE_REQUEST_VERSION','CHANGE_ORDER_VERSION'");
    expect(sql).toContain("create table public.approval_subject_change_request_version");
    expect(sql).toContain("create table public.approval_subject_change_order_version");
    expect(sql).toContain("references public.change_request_version(id,change_request_id,version_no,snapshot_checksum,sealed_at)");
    expect(sql).toContain("references public.change_order_version(id,change_order_id,version_no,snapshot_checksum,sealed_at)");
    expect(sql).toContain("p.stable_code<>'POSITION_SENIOR_RESEARCHER'");
    expect(sql).toContain("OD-033: no canonical ECO negative-outcome state transition exists");
    expect(sql).toContain("create or replace function public.create_change_approval_instance");
    expect(sql).toContain("create or replace function public.perform_change_approval_action");
    expect(sql).toContain("s.subject_kind in ('CHANGE_REQUEST_VERSION','CHANGE_ORDER_VERSION') and s.subject_state='SEALED'");
    expect(sql).toContain("create constraint trigger approval_instance_m10_subject_apply");
    expect(sql).toContain("create table public.change_approval_negative_outcome");
    expect(sql).toContain("outcome text not null check(outcome in ('REJECTED','RECALLED','CANCELLED'))");
  });

  it("gates ECO creation and effectiveness on exact origin, contract amendment, scope and independent evidence", () => {
    expect(sql).toContain("exact approved ECR or audited emergency exception required");
    expect(sql).toContain("create table public.emergency_change_exception");
    expect(sql).toContain("retrospective_approval_due_at");
    expect(sql).toContain("signed executed change-contract amendment required");
    expect(sql).toContain("create table public.change_order_applied_serial");
    expect(sql).toContain("create table public.change_order_applied_lot");
    expect(sql).toContain("create table public.change_order_verification_test_result");
    expect(sql).toContain("create table public.change_order_verification_inspection_attempt");
    expect(sql).toContain("i.performed_by_user_id=app_private.current_effective_actor_user_id()");
    expect(sql).toContain("original_overwritten boolean not null default false check(not original_overwritten)");
  });

  it("forces deny-first RLS, guarded writes, append-only history and narrow Vendor projections", () => {
    expect(sql).toContain("alter table public.%I force row level security");
    expect(sql).toContain("M10 evidence, target and history rows are append-only");
    expect(sql).toContain("ECR/ECO updates require a trusted command");
    expect(sql).toContain("app_private.actor_has_project_vendor_scope");
    expect(sql).toContain("app_private.actor_has_contract_vendor_scope");
    expect(sql).toContain("from public,youone_request,youone_privileged_writer");
    const vendorProjection = sql.slice(sql.indexOf("function public.read_vendor_change_request"), sql.indexOf("create index change_request_scope_idx"));
    for (const forbidden of ["cost_delta", "currency", "reviewer_user_id", "approval_instance_id", "policy_checksum", "risk_summary"]) {
      expect(vendorProjection).not.toContain(forbidden);
    }
  });

  it("writes optimistic transition, Audit and Outbox envelopes in one guarded transaction path", () => {
    expect(sql).toContain("app_private.next_version");
    expect(sql).toContain("perform app_private.append_audit");
    expect(sql).toContain("perform app_private.append_state_transition");
    expect(sql).toContain("perform app_private.enqueue_outbox");
    expect(sql).toContain("target_event||':'||target_aggregate_id::text||':'||target_to_version::text");
  });
});
