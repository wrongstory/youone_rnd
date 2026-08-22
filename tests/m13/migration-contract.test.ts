import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(import.meta.dirname, "../../supabase/migrations/20260822001200_m13_safety_light.sql"), "utf8");

describe("M13 Safety Light migration contract", () => {
  it("registers the canonical inspection and incident state machines", () => {
    for (const state of ["PLANNED", "IN_PROGRESS", "FINDINGS_OPEN", "STOP_WORK", "CORRECTION_PENDING", "VERIFICATION", "CANCELLED"])
      expect(sql).toContain(`'SM-SAFETY-INSPECTION-V1','${state}'`);
    for (const state of ["REPORTED", "EMERGENCY_RESPONSE", "SITE_SECURED", "INVESTIGATION", "RECURRENCE_ACTION", "VERIFICATION", "CLOSED"])
      expect(sql).toContain(`'SM-SAFETY-INCIDENT-V1','${state}'`);
    for (const event of ["INSPECTION-START", "INSPECTION-CLOSE-CLEAR", "INSPECTION-CANCEL", "FINDINGS-ISSUE", "STOP-WORK", "CORRECTION-ASSIGN", "SUBMIT-VERIFY", "VERIFY-CLOSE", "VERIFY-FAIL"])
      expect(sql).toContain(`'EVT-SAFETY-${event}'`);
    for (const event of ["INCIDENT-REPORT", "EMERGENCY-RESPOND", "SECURE-SITE", "START-INVESTIGATION", "SET-RECURRENCE-ACTION", "CLOSE"])
      expect(sql).toContain(`'EVT-SAFETY-${event}'`);
  });

  it("normalizes assignment, inspection, training, incident and immutable evidence", () => {
    for (const table of [
      "safety_manager_assignment", "safety_inspection", "safety_inspection_item", "safety_finding",
      "safety_correction_evidence", "safety_correction_verification", "safety_training_session",
      "safety_training_attendance", "safety_training_remedial", "safety_incident",
      "safety_incident_investigation", "safety_recurrence_action", "safety_recurrence_verification", "safety_alert",
    ]) expect(sql).toContain(`create table public.${table}`);
    expect(sql).toContain("references public.attachment(id,row_version,detected_sha256)");
    expect(sql).toContain("Safety evidence/history is append-only");
  });

  it("keeps P1 safety modules absent", () => {
    expect(sql).not.toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(?:msds|safety_msds|waste|safety_waste|emergency_drill|safety_drill)\b/i);
  });

  it("enforces Director-only designation and exact stop-work release evidence", () => {
    expect(sql).toContain("POSITION_LAB_DIRECTOR");
    expect(sql).toContain("EVT-SAFETY-MANAGER-ASSIGN");
    expect(sql).toContain("Safety assignee must be active INTERNAL");
    expect(sql).toContain("stop-work release requires Safety Manager or Lab Director");
    expect(sql).toContain("exact submitted correction required");
    expect(sql).toContain("coalesce(e.submitted_by_user_id,vu.user_id)=app_private.current_effective_actor_user_id()");
    expect(sql).toContain("x.state not in ('CORRECTION_SUBMITTED','CLOSED')");
    expect(sql).toContain("STOP-WORK-RELEASE-EXACT-VERIFICATION");
  });

  it("requires exact active Vendor project/contract grants plus an allowlist", () => {
    expect(sql).toContain("safety_vendor_project_allowlist");
    expect(sql).toContain("safety_vendor_contract_allowlist");
    expect(sql).toContain("foreign key(contract_id,vendor_id) references public.vendor_contract(id,vendor_id)");
    expect(sql).toContain("from public.project_vendor_grant g where g.vendor_user_id=vu");
    expect(sql).toContain("from public.contract_vendor_grant g where g.vendor_user_id=vu");
    expect(sql).toContain("base exact Project grant required");
    expect(sql).toContain("base exact Contract grant required");
  });

  it("uses optimistic commands with atomic Audit, Transition and Outbox", () => {
    expect(sql).toContain("app_private.next_version");
    expect(sql).toContain("app_private.append_audit");
    expect(sql).toContain("app_private.append_state_transition");
    expect(sql).toContain("app_private.enqueue_outbox");
    expect(sql).toContain("app.m13_command");
    expect(sql).not.toMatch(/\bnext\s+bigint\b|return\s+next\s*;/i);
  });

  it("models the 48-hour SLA as idempotent alerting without auto-completion", () => {
    expect(sql).toContain("reported_at+interval '48 hours'");
    expect(sql).toContain("INVESTIGATION_48H_OVERDUE");
    expect(sql).toContain("EVT-SAFETY-INCIDENT-SLA-ALERT");
    expect(sql).toContain("on conflict(idempotency_key) do nothing");
    expect(sql).toContain("alerts never fabricate investigation completion");
  });

  it("forces RLS, removes direct writes and denies Admin source access", () => {
    expect(sql).toContain("force row level security");
    expect(sql).toContain("revoke all on table public.%I from public,youone_request,youone_privileged_writer");
    expect(sql).toContain("ADMIN_SYSTEM");
    expect(sql).toContain("read_vendor_safety_tasks");
  });

  it("enforces five-year retention and irreversible legal hold", () => {
    expect(sql).toContain("interval '5 years'");
    expect(sql).toContain("Safety retention/legal hold cannot be shortened");
    expect(sql).toContain("Safety record retention forbids deletion");
  });
});
