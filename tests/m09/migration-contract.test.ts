import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(import.meta.dirname, "../../supabase/migrations/20260822000800_m09_ncr_car.sql"), "utf8");

describe("M09 NCR/CAR migration contract", () => {
  it("registers canonical typed machines, states and events without inventing a reopened exit", () => {
    expect(sql).toContain("('SM-NCR-V1','NON_CONFORMANCE')");
    expect(sql).toContain("('SM-CAR-V1','CORRECTIVE_ACTION')");
    for (const event of ["EVT-NCR-ISSUE", "EVT-NCR-CONTAIN", "EVT-NCR-REQUEST-ROOT-CAUSE", "EVT-NCR-SUBMIT-PLAN",
      "EVT-NCR-ACCEPT-PLAN", "EVT-NCR-READY-VERIFY", "EVT-NCR-CLOSE", "EVT-NCR-REOPEN", "EVT-CAR-ACCEPT",
      "EVT-CAR-START", "EVT-CAR-SUBMIT-VERIFY", "EVT-CAR-VERIFY-EFFECTIVE", "EVT-CAR-VERIFY-INEFFECTIVE",
      "EVT-CAR-CLOSE", "EVT-CAR-REWORK"]) expect(sql).toContain(`'${event}'`);
    expect(sql).not.toMatch(/'SM-NCR-V1'\s*,\s*'[^']+'\s*,\s*'REOPENED'\s*,/);
    expect(sql).toContain("OD-031: CLOSED to REOPENED only");
  });

  it("normalizes exact source, responsibility, containment, root cause, CAR action, verification and reopen evidence", () => {
    for (const table of ["non_conformance", "ncr_responsibility_assessment", "ncr_evidence", "ncr_containment_action",
      "ncr_root_cause_analysis", "corrective_action", "car_action_execution", "car_verification", "ncr_reopen_event"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
    expect(sql).toContain("references public.inspection_attempt(id,inspection_id,attempt_no,checksum,sealed_at,contract_id,deliverable_id,deliverable_version_id,assigned_vendor_id)");
    expect(sql).toContain("foreign key(requirement_id,project_id) references public.requirement(id,project_id)");
    expect(sql).toContain("foreign key(inspection_criterion_result_id,inspection_attempt_id)");
    expect(sql).toContain("M09 evidence and history are append-only");
    expect(sql).not.toMatch(/subject_type|generic_subject|lifecycle\s+jsonb/i);
  });

  it("separates preliminary/disputed/final responsibility history from operational Vendor assignment", () => {
    expect(sql).toContain("responsibility_status in ('PRELIMINARY','DISPUTED','FINAL')");
    expect(sql).toContain("responsibility_party in ('UNDETERMINED','VENDOR','INTERNAL','SHARED')");
    expect(sql).toContain("action_assigned_vendor_id uuid");
    expect(sql).toContain("function public.record_ncr_responsibility_assessment");
    expect(sql).toContain("NCR-RESPONSIBILITY-ASSESSED");
  });

  it("guards Vendor actions with trusted current membership, exact project/contract grant and assignment", () => {
    expect(sql).toContain("function app_private.m09_vendor_can_act");
    expect(sql).toContain("g.contract_id=n.contract_id and g.project_id=n.project_id");
    expect(sql).toContain("p.stable_code='ncr.action.perform'");
    expect(sql).toContain("vu.vendor_id=n.action_assigned_vendor_id");
    expect(sql).toContain("target_phase not in ('CONTAINMENT','ROOT_CAUSE','ACTION_PLAN','IMPLEMENTATION')");
    for (const internalOnly of ["ncr.record.issue", "ncr.plan.review", "ncr.effectiveness.verify", "ncr.record.close"]) {
      expect(sql).toContain(`target_occurred_at,'${internalOnly}'`);
    }
  });

  it("enforces independent effectiveness verification and required-CAR closure", () => {
    expect(sql).toContain("c.owner_user_id=app_private.current_effective_actor_user_id()");
    expect(sql).toContain("x.performed_by_user_id=app_private.current_effective_actor_user_id()");
    expect(sql).toContain("every required non-cancelled CAR must be effective or closed with exact close evidence");
    expect(sql).toContain("retained ineffective verification required");
    expect(sql).toContain("prior_closed_version");
  });

  it("uses optimistic guarded commands and atomic audit, transition and outbox envelopes", () => {
    expect(sql).toContain("app_private.next_version");
    expect(sql).toContain("NCR/CAR aggregate updates require a trusted command");
    expect(sql).toContain("perform app_private.append_audit");
    expect(sql).toContain("perform app_private.append_state_transition");
    expect(sql).toContain("perform app_private.enqueue_outbox");
    expect(sql).toContain("alter table public.%I force row level security");
    expect(sql).toContain("from public,youone_request,youone_privileged_writer");
  });

  it("keeps Vendor projection narrow and never mutates Contract state", () => {
    const projection = sql.slice(sql.indexOf("function public.read_ncr_vendor_action"), sql.indexOf("comment on function public.read_ncr_vendor_action"));
    for (const forbidden of ["responsibility_status", "responsibility_party", "responsible_vendor_id", "internal_owner_user_id",
      "milestone_amount", "final_approved_rate", "contract_state"]) expect(projection).not.toContain(forbidden);
    expect(sql).toContain("contract_state_unchanged_by_ncr");
    expect(sql).not.toMatch(/update\s+public\.vendor_contract/i);
  });
});
