import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(resolve(import.meta.dirname,"../../supabase/migrations/20260821000200_m03_auth_rbac_scope.sql"),"utf8");
describe("M03 migration contract",()=>{
  it("uses normalized versioned action sets and projection fields",()=>{
    expect(sql).toContain("create table public.authorization_action_set_permission");
    expect(sql).toContain("create table public.field_projection_field");
    expect(sql).toContain("actor_kind text not null");
    expect(sql).toContain("resource_type text not null");
    expect(sql).toContain("action_id text not null");
    expect(sql).toContain("field_projection_profile_binding_idx");
    expect(sql).toContain("(actor_kind,resource_type,action_id,valid_from,valid_until)");
    expect(sql).not.toMatch(/actions\s+jsonb/i);
  });
  it("resolves identity assignments and entitlements from one server snapshot",()=>{
    expect(sql).toContain("resolve_actor_context_snapshot");
    for (const source of ["user_organization_assignment","user_department_assignment","user_position_assignment","user_role_assignment","role_permission_assignment","vendor_user","acting_authority_assignment","user_security_entitlement_assignment"]) {
      expect(sql).toContain(`public.${source}`);
    }
    expect(sql).toContain("grant execute on function app_private.resolve_actor_context_snapshot(text,timestamptz) to youone_identity_resolver");
    expect(sql).toContain("revoke all on function app_private.resolve_actor_context_snapshot(text,timestamptz) from youone_request,youone_privileged_writer");
    expect(sql).toContain("av.valid_from<=at_time and (av.valid_until is null or av.valid_until>at_time)");
  });
  it("does not create FK-less project or contract scope rows",()=>{
    expect(sql).not.toMatch(/create table public\.(project_scope|contract_scope)/i);
  });
  it("enforces account kind, exact vendor membership, RLS and audited assignment writes",()=>{
    expect(sql).toContain("account_kind text not null");
    expect(sql).toContain("target_vendor_user_id uuid,target_vendor_id uuid");
    expect(sql).toContain("actor_has_active_vendor");
    expect(sql).toContain("app_private.actor_has_vendor_membership(id,vendor_id)");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("perform app_private.append_audit");
    expect(sql).toContain("u.account_kind='VENDOR'");
    expect(sql).toContain("occurred_at must equal trusted request time");
    expect(sql).toContain("user_role_account_kind_guard");
    expect(sql).toContain("acting_authority_account_guard");
    expect(sql).toContain("user_position_primary_window_guard");
    expect(sql.match(/create or replace function app_private\.actor_has_permission/g)).toHaveLength(1);
    for (const wrapper of ["request_time","current_actor_user_id","current_effective_actor_user_id"]) {
      expect(sql).toMatch(new RegExp(`function app_private\\.${wrapper}\\(\\)[\\s\\S]*?security definer`));
    }
    expect(sql).toContain("revoke all on all functions in schema app_private from public");
    expect(sql).toContain("grant execute on function app_private.request_time() to youone_request");
    expect(sql).toContain("grant execute on function app_private.action_set_allows(uuid,bigint,text,timestamptz) to youone_request");
    expect(sql).toContain("grant execute on function app_private.acting_authority_allows(text,timestamptz) to youone_request");
  });
  it("guards audited account and vendor lifecycle commands",()=>{
    for (const fn of ["disable_user_account","disable_vendor","grant_vendor_membership","revoke_vendor_membership"]) {
      expect(sql).toContain(`function app_private.${fn}`);
    }
    for (const action of ["identity.account.disable","vendor.record.disable","vendor.membership.grant","vendor.membership.revoke"]) {
      expect(sql).toContain(`'${action}'`);
    }
    expect(sql).toContain("action_code<>'approval.step.approve' or acting_role.stable_code in ('ROLE_LAB_DIRECTOR','ROLE_REPRESENTATIVE')");
  });
  it("seeds every stable platform role without seeding feature permissions",()=>{
    for (const role of ["ROLE_HQ_VIEWER","ROLE_SAFETY_MANAGER","ROLE_ALLOWANCE_EVALUATOR","ADMIN_DOCUMENT","ADMIN_APPROVAL"]) {
      expect(sql).toContain(`'${role}'`);
    }
  });
  it("supports hosted Supabase without weakening the identity-resolver role",()=>{
    expect(sql).toMatch(/create role youone_identity_resolver[\s\S]*nobypassrls/i);
    expect(sql).toContain("unsafe or missing youone_identity_resolver attributes");
    for (const attribute of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolinherit", "rolcanlogin", "rolreplication", "rolbypassrls"]) {
      expect(sql).toContain(attribute);
    }
    expect(sql).not.toMatch(/alter\s+role\s+youone_identity_resolver\b/i);
  });
});
