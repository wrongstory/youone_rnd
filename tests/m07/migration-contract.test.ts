import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(import.meta.dirname, "../../supabase/migrations/20260822000600_m07_vendor_contract.sql"), "utf8");

describe("M07 Vendor/Contract migration contract", () => {
  it("preserves existing permission IDs while allowing the reviewed finance-detail ID", () => {
    expect(sql).toContain("alter table public.permission drop constraint permission_stable_code_check");
    expect(sql).toContain("(\\.[a-z][a-z0-9_]*){2,}");
    expect(sql).toContain("'contract.detail.finance.read'");
  });

  it("normalizes Contract, exact versions, projects and milestone finance", () => {
    for (const table of ["vendor_contract", "contract_version", "contract_project", "contract_milestone", "contract_version_legal_check_item", "contract_signature_evidence"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
    expect(sql).toContain("total_burden_amount numeric(20,2)");
    expect(sql).toContain("vat_included boolean not null check(vat_included)");
    expect(sql).toContain("planned_amount numeric(20,2)");
    expect(sql).toContain("planned_ratio numeric(7,4)");
    expect(sql).toContain("unique(id,contract_id,version_no)");
    expect(sql).toContain("foreign key(current_signed_version_id,id,current_signed_version_no)");
    expect(sql).toContain("milestones must total exact VAT-inclusive burden and 100 percent");
  });

  it("stores preset, override and reviewed legal provenance without claiming statutory defaults", () => {
    for (const marker of ["preset_policy_id", "preset_policy_version", "legal_baseline_id", "legal_baseline_version", "override_applied", "override_reason"]) {
      expect(sql).toContain(marker);
    }
    expect(sql).toContain("create table public.contract_version_legal_check_item");
    expect(sql).toContain("not statutory values");
    expect(sql).not.toContain("statutory_rate");
  });

  it("models deliverable evidence, Guarantee and Warranty separately", () => {
    for (const table of ["deliverable", "deliverable_version", "deliverable_manifest_entry", "guarantee", "warranty_issue"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
    expect(sql).toContain("acceptance_does_not_waive_responsibility boolean not null default true check(acceptance_does_not_waive_responsibility)");
    expect(sql).toContain("payment_does_not_waive_responsibility boolean not null default true check(payment_does_not_waive_responsibility)");
  });

  it("binds exact ContractVersion approval subjects and blocks the generic action path", () => {
    expect(sql).toContain("create table public.approval_subject_contract_version");
    expect(sql).toContain("references public.contract_version(id,contract_id,version_no,sealed_snapshot_checksum,sealed_at)");
    expect(sql).toContain("+(select count(*) from public.approval_subject_contract_version");
    expect(sql).toContain("'CONTRACT_VERSION',l.contract_version_id");
    expect(sql).toContain("create trigger approval_action_contract_path_guard");
    expect(sql).toContain("app.contract_approval_command_instance");
    expect(sql).toContain("exact ContractVersion already has an active approval generation");
  });

  it("makes signed versions and their normalized children immutable", () => {
    expect(sql).toContain("sealed or signed ContractVersion is immutable");
    expect(sql).toContain("sealed ContractVersion children are immutable");
    expect(sql).toContain("amendment requires a strictly older signed same-contract predecessor");
    expect(sql).toContain("create trigger contract_version_immutable");
    expect(sql).toContain("create trigger contract_milestone_immutable");
    expect(sql).toContain("function public.record_signed_contract_version");
    expect(sql).toContain("exact completed approval, sealed ContractVersion and active signatory required");
    expect(sql).toContain("app.contract_sign_command_version");
  });

  it("binds ContractScope to a real Contract, Project and active exact VendorMembership", () => {
    expect(sql).toContain("create table public.contract_vendor_grant");
    expect(sql).toContain("foreign key(contract_id,project_id) references public.contract_project(contract_id,project_id)");
    expect(sql).toContain("join public.vendor_user vu on vu.id=g.vendor_user_id and vu.vendor_id=c.vendor_id");
    expect(sql).toContain("app_private.actor_has_vendor_membership(vu.id,c.vendor_id,target_time)");
    expect(sql).toContain("inactive or cross-Vendor membership cannot receive ContractScope");
  });

  it("issues activation scope and revokes close or termination scope atomically", () => {
    expect(sql).toContain("function public.activate_vendor_contract");
    expect(sql).toContain("insert into public.contract_vendor_grant");
    expect(sql).toContain("function public.transition_vendor_contract_and_revoke_scope");
    expect(sql).toContain("update public.contract_vendor_grant set status='REVOKED'");
    expect(sql).toContain("perform app_private.append_m07_transition");
    expect(sql).toContain("perform app_private.append_audit");
    expect(sql).toContain("perform app_private.append_state_transition");
    expect(sql).toContain("perform app_private.enqueue_outbox");
  });

  it("keeps list, basic and finance projections physically separate", () => {
    const listProjection = sql.slice(sql.indexOf("function public.read_vendor_contract_list_safe"), sql.indexOf("comment on function public.read_vendor_contract_list_safe"));
    for (const forbidden of ["total_burden_amount", "currency", "payment", "guarantee", "internal_evaluation", "risk_level"]) {
      expect(listProjection).not.toContain(forbidden);
    }
    expect(sql).toContain("function public.read_vendor_contract_basic");
    expect(sql).toContain("function public.read_vendor_contract_finance");
    expect(sql).toContain("app_private.actor_has_permission('contract.detail.finance.read'");
    expect(sql).toContain("app_private.actor_has_contract_vendor_scope(c.id,'contract.detail.finance.read'");
  });

  it("forces RLS, denies base writes and never grants request commands to privileged writer", () => {
    expect(sql).toContain("alter table public.%I force row level security");
    expect(sql).toContain("revoke all on public.vendor_contract");
    expect(sql).toContain("from public,youone_request,youone_privileged_writer");
    expect(sql).toContain("from public,youone_privileged_writer");
    expect(sql).not.toMatch(/grant execute on function public\.activate_vendor_contract[\s\S]*?to youone_privileged_writer/);
  });

  it("does not implement M08 acceptance or payment execution", () => {
    expect(sql).not.toContain("create table public.inspection");
    expect(sql).not.toContain("create table public.payment");
    expect(sql).not.toContain("function public.accept_deliverable");
    expect(sql).not.toContain("function public.execute_payment");
  });
});
