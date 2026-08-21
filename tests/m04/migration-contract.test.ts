import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(import.meta.dirname, "../../supabase/migrations/20260822000300_m04_approval_engine.sql"), "utf8");

describe("M04 migration contract", () => {
  it("uses an exact FK-backed typed subject snapshot", () => {
    expect(sql).toContain("create table public.approval_subject_policy_version");
    expect(sql).toContain("subject_policy_version_id uuid not null references public.approval_policy_version(id)");
    expect(sql).toContain("subject_version_no bigint not null");
    expect(sql).toContain("subject_checksum text not null");
    expect(sql).toContain("function app_private.approval_subject_snapshot");
    expect(sql).not.toMatch(/subject_type\s+text[\s\S]{0,80}subject_id\s+uuid/i);
  });

  it("seals the policy, line, participant and exact subject at submission", () => {
    expect(sql).toContain("policy_checksum_snapshot");
    expect(sql).toContain("line_checksum");
    expect(sql).toContain("),'|' order by s.sequence_no,s.step_key,ap.participant_order)");
    expect(sql).toContain("policy_step_rule_id");
    expect(sql).toContain("policy_participant_rule_id");
    expect(sql).toContain("assignment_evidence_id");
    expect(sql).toContain("required approval step has no active participant");
    expect(sql).toContain("approval participant is not an official position");
    expect(sql).not.toContain("representative approval must use ANY_ONE");
    expect(sql).toContain("governing policy subject kind mismatch");
    expect(sql).toContain("approval step snapshot is immutable");
    expect(sql).toContain("approval participant snapshot is immutable");
    expect(sql).toContain("approval policy step owner is immutable");
    expect(sql).toContain("approval participant rule owner is immutable");
  });

  it("implements canonical transitions and separate outbox event references", () => {
    for (const event of ["CREATE", "SUBMIT", "ACTIVATE", "REVIEW", "AGREE", "APPROVE", "REJECT", "REQUEST-RECALL", "RECALL", "CANCEL"]) {
      expect(sql).toContain(`EVT-APPROVAL-${event}`);
    }
    expect(sql).toContain("'EVT-APPROVAL-SUBMITTED','APPROVAL_EVENT_REF',1");
    expect(sql).toContain("'EVT-APPROVAL-COMPLETED','APPROVAL_EVENT_REF',1");
    expect(sql).toContain("'APPROVAL_EVENT_REF',1");
  });

  it("keeps actions append-only and commands optimistic/concurrency safe", () => {
    expect(sql).toContain("approval_action is append-only");
    expect(sql).toContain("approval_participant_terminal_action_unique");
    expect(sql).toContain("for update");
    expect(sql).toContain("app_private.next_version");
    expect(sql).toContain("expected_participant_version");
    expect(sql).toContain("expected_step_version");
  });

  it("revalidates direct and delegated exact participant authority", () => {
    expect(sql).toContain("participant_user_id<>app_private.current_effective_actor_user_id()");
    expect(sql).toContain("app_private.acting_authority_allows(permission_code,target_occurred_at)");
    expect(sql).toContain("authority_row.evidence_id");
    expect(sql).toContain("acting authority cannot be attached to a direct action");
    expect(sql).toContain("official approval position required");
    expect(sql).toContain("pa.revoked_at is null");
    expect(sql).toContain("pa.valid_from<=target_occurred_at");
  });

  it("implements parallel barriers and exact completion modes including reference receipt", () => {
    expect(sql).toContain("SEQUENTIAL participants require exact USER rules");
    expect(sql).toContain("required_for_completion");
    expect(sql).toContain("sequence_no=step_row.sequence_no and state='ACTIVE'");
    expect(sql).toContain("REFERENCE_RECEIPT");
    expect(sql).toContain("EVT-APPROVAL-REFERENCE-RECEIVED");
  });

  it("completes only the exact immutable subject version", () => {
    expect(sql).toContain("exact subject version changed before completion");
    expect(sql).toContain("s.subject_policy_version_id=v.id");
    expect(sql).toContain("v.version_no=s.subject_version_no");
    expect(sql).toContain("v.checksum=s.subject_checksum");
    expect(sql).toContain("app.approval_completion_instance_id");
  });

  it("writes audit, transition and outbox in each state-changing function", () => {
    expect(sql).toContain("app_private.append_approval_audit_transition");
    expect(sql).toContain("app_private.enqueue_approval_event");
    expect(sql).toContain("coalesce(target_reason_code,'APPROVAL_TRANSITION_APPLIED')");
    for (const fn of ["submit_approval_instance", "activate_approval_instance", "perform_approval_action", "request_approval_recall", "complete_approval_recall", "cancel_approval_instance"]) {
      const body = sql.slice(sql.indexOf(`function public.${fn}`));
      expect(body.slice(0, body.indexOf("end $$;") + 7)).toContain("append_approval_audit_transition");
    }
  });

  it("uses deny-first FORCE RLS and minimum command grants", () => {
    expect(sql.match(/force row level security/g)).toHaveLength(9);
    expect(sql).toContain("revoke all on table public.approval_policy");
    expect(sql).toContain("from public,youone_request,youone_privileged_writer");
    expect(sql).toContain("to youone_request");
    expect(sql).toContain("to youone_privileged_writer");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+table/i);
  });

  it("permits resubmission only after rejected/recalled predecessors", () => {
    expect(sql).toContain("p.state in ('REJECTED','RECALLED')");
    expect(sql).toContain("previous_subject.policy_id=subject_row.policy_id");
    expect(sql).toContain("previous_subject.version_no<subject_row.version_no");
  });
});
