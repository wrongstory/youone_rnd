import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(import.meta.dirname, "../../supabase/migrations/20260822000500_m06_project_wbs.sql"), "utf8");

describe("M06 Project/WBS migration contract", () => {
  it("models Project, Product, membership and free-hierarchy WBS relationally", () => {
    for (const table of ["product", "project", "project_member", "project_product", "wbs_node"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
    expect(sql).toContain("foreign key(parent_id,project_id) references public.wbs_node(id,project_id)");
    expect(sql).toContain("create trigger wbs_tree_guard");
    expect(sql).toContain("parent WBS cannot complete before children");
  });

  it("does not invent the M11 RndProgram target or an untyped UUID link", () => {
    expect(sql).not.toContain("create table public.project_rnd_program");
    expect(sql).toContain("M11 creates project_rnd_program only after the real rnd_program FK target exists");
    expect(sql).not.toMatch(/rnd_program_id uuid(?![^\n]*references)/i);
  });

  it("keeps ordinary Project lifecycle separate and OD-014 close commands fail-closed", () => {
    expect(sql).toContain("('SM-PROJECT-V1','PROJECT')");
    expect(sql).toContain("'EVT-PROJECT-CREATE',null,'DRAFT'");
    expect(sql).toContain("OD-014 fail-closed: BEGIN_CLOSE, CLOSE and REOPEN");
    expect(sql).not.toContain("function public.close_project");
    expect(sql).not.toContain("formal_research_flag");
  });

  it("allows Project creation only through the direct active INTERNAL command", () => {
    expect(sql).toContain("function app_private.m06_assert_direct_internal");
    expect(sql).toContain("u.account_kind='INTERNAL' and u.status='ACTIVE'");
    expect(sql).toContain("function public.create_project");
    expect(sql).toContain("active organization assignment required");
  });

  it("normalizes exact VendorMembership plus Project action grants", () => {
    expect(sql).toContain("create table public.project_vendor_grant");
    expect(sql).toContain("vendor_user_id uuid not null references public.vendor_user(id)");
    expect(sql).toContain("create table public.project_vendor_grant_action");
    expect(sql).toContain("join public.project_vendor_grant_action ga on ga.grant_id=g.id");
    expect(sql).toContain("permission.stable_code=target_action");
  });

  it("limits Vendor WBS work to an exact assigned membership and reviewed transition subset", () => {
    expect(sql).toContain("node_row.assigned_vendor_user_id is not null");
    expect(sql).toContain("app_private.actor_has_project_vendor_scope(node_row.project_id,'project.wbs.update'");
    expect(sql).toContain("target_event='EVT-WBS-START'");
    expect(sql).toContain("target_event='EVT-WBS-BLOCK'");
    expect(sql).toContain("target_event='EVT-WBS-SUBMIT-REVIEW'");
    expect(sql).toContain("target_event='EVT-WBS-ACCEPT' and node_row.state='REVIEW_REQUIRED' and internal_editor");
  });

  it("uses immutable versioned structured research applications", () => {
    expect(sql).toContain("create table public.research_project_application_version");
    expect(sql).toContain("budget_amount numeric(20,2)");
    expect(sql).toContain("create table public.research_project_application_member");
    expect(sql).toContain("create table public.research_project_application_output");
    expect(sql).toContain("create table public.research_project_application_evidence");
    expect(sql).toContain("sealed_snapshot_checksum text");
    expect(sql).toContain("sealed research project application snapshot is immutable");
    expect(sql).toContain("research application revision requires exact returned/rejected head");
    expect(sql).toContain("research_application_output_immutable");
    expect(sql).toContain("research_application_evidence_immutable");
  });

  it("binds the exact sealed application version into the Approval engine", () => {
    expect(sql).toContain("create table public.approval_subject_research_project_application");
    expect(sql).toContain("references public.research_project_application_version(id,application_id,project_id,version_no,sealed_snapshot_checksum,sealed_at)");
    expect(sql).toContain("+(select count(*) from public.approval_subject_research_project_application");
    expect(sql).toContain("'RESEARCH_PROJECT_APPLICATION',l.application_version_id");
    expect(sql).toContain("exact research application version already has an active approval generation");
  });

  it("mirrors the Lab-Director-only approval policy at the DB boundary", () => {
    expect(sql).toContain("formal research designation requires exactly one Lab Director step");
    expect(sql).toContain("rule_row.sequence_no<>1 or rule_row.step_role<>'APPROVAL' or rule_row.completion_mode<>'SEQUENTIAL'");
    expect(sql).toContain("position_rule.stable_code='POSITION_LAB_DIRECTOR'");
    expect(sql).toContain("pr.selector_kind='POSITION' and pr.participant_user_id is null and pr.role_id is null");
  });

  it("creates designation only in the typed terminal command transaction", () => {
    expect(sql).toContain("function public.perform_research_project_approval_action");
    expect(sql).toContain("target_event not in ('APPROVE','REJECT','RETURN')");
    expect(sql).toContain("insert into public.research_project_designation");
    expect(sql).toContain("research_designation_exact_subject_fk");
    expect(sql).toContain("current Lab Director consent is required");
  });

  it("keeps recall typed and atomic with the application RETURNED state", () => {
    expect(sql).toContain("function public.request_research_project_approval_recall");
    expect(sql).toContain("function public.complete_research_project_approval_recall");
    expect(sql).toContain("update public.research_project_application_version set state='RETURNED'");
    expect(sql).toContain("'EVT-RP-RETURN','EVT-RP-APPLICATION-RETURNED'");
  });

  it("blocks generic Approval action paths for the typed research subject", () => {
    expect(sql).toContain("create trigger approval_action_research_project_path_guard");
    expect(sql).toContain("app.research_approval_command_instance");
    expect(sql).toContain("research Project approval actions require the typed Lab Director command path");
  });

  it("forces RLS and exposes only guarded request commands", () => {
    expect(sql.match(/force row level security/g)?.length).toBeGreaterThanOrEqual(12);
    expect(sql).toContain("create policy project_internal_scoped_read");
    expect(sql).toContain("create policy wbs_internal_or_exact_vendor_read");
    expect(sql).toContain("research_application_output_internal_or_participant_read");
    expect(sql).toContain("research_application_evidence_internal_or_participant_read");
    expect(sql).toContain("public.read_project_vendor_summary(uuid,timestamptz)");
    expect(sql).toContain("from public,youone_request,youone_privileged_writer");
  });

  it("writes audit, transition and outbox in the same guarded command", () => {
    expect(sql).toContain("function app_private.append_m06_transition");
    expect(sql).toContain("perform app_private.append_audit");
    expect(sql).toContain("perform app_private.append_state_transition");
    expect(sql).toContain("perform app_private.enqueue_outbox");
    expect(sql).toContain("app_private.next_version");
  });
});
