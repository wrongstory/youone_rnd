-- M03 Auth/RBAC/Scope
-- ProjectScope, ContractScope, and DocumentVersion grants are added with their real FK targets in M06/M07/M05.

do $$ begin
  if not exists (select 1 from pg_roles where rolname='youone_identity_resolver') then
    create role youone_identity_resolver nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  end if;
end $$;
alter role youone_identity_resolver nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
grant usage on schema app_private to youone_identity_resolver;

insert into public.aggregate_type_definition(aggregate_type) values
  ('USER_ACCOUNT'), ('IDENTITY_ASSIGNMENT'), ('VENDOR'), ('VENDOR_MEMBERSHIP')
on conflict do nothing;

insert into public.action_definition(action_id) values
  ('auth.login.succeeded'), ('auth.login.failed'), ('identity.account.disable'),
  ('identity.assignment.grant'), ('identity.assignment.revoke'),
  ('vendor.record.disable'), ('vendor.membership.grant'), ('vendor.membership.revoke'),
  ('authorization.assignment.manage'), ('audit.security.read')
on conflict do nothing;

create table public.organization (
  id uuid primary key,
  stable_code text not null unique check (app_private.is_stable_code(stable_code)),
  legal_name text not null,
  status text not null check (status in ('ACTIVE','DISABLED')),
  version_no bigint not null default 0 check (version_no >= 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table public.department (
  id uuid primary key,
  organization_id uuid not null references public.organization(id),
  parent_id uuid references public.department(id),
  stable_code text not null unique check (app_private.is_stable_code(stable_code)),
  status text not null check (status in ('ACTIVE','DISABLED')),
  version_no bigint not null default 0 check (version_no >= 0)
);

create table public.position (
  id uuid primary key,
  stable_code text not null unique check (app_private.is_stable_code(stable_code)),
  approval_capability text not null check (approval_capability in ('NONE','OFFICIAL','REPRESENTATIVE')),
  approval_rank integer not null check (approval_rank >= 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DISABLED'))
);

create table public.user_account (
  id uuid primary key,
  auth_subject text not null unique check (length(auth_subject) between 1 and 255),
  account_kind text not null check (account_kind in ('INTERNAL','VENDOR')),
  status text not null check (status in ('ACTIVE','DISABLED','PENDING')),
  valid_from timestamptz not null,
  valid_until timestamptz,
  version_no bigint not null default 0 check (version_no >= 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (valid_until is null or valid_until > valid_from)
);

create table public.role (
  id uuid primary key,
  stable_code text not null unique check (app_private.is_stable_code(stable_code)),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DISABLED'))
);

create table public.permission (
  id uuid primary key,
  stable_code text not null unique check (stable_code ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DISABLED'))
);

create table public.security_entitlement (
  id uuid primary key,
  stable_code text not null unique check (app_private.is_stable_code(stable_code)),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DISABLED'))
);

create table public.authorization_action_set (
  id uuid primary key,
  stable_code text not null unique check (app_private.is_stable_code(stable_code))
);

create table public.authorization_action_set_version (
  action_set_id uuid not null references public.authorization_action_set(id),
  version_no bigint not null check (version_no > 0),
  valid_from timestamptz not null,
  valid_until timestamptz,
  created_by_user_id uuid references public.user_account(id),
  primary key (action_set_id, version_no),
  check (valid_until is null or valid_until > valid_from)
);

create table public.authorization_action_set_permission (
  action_set_id uuid not null,
  action_set_version bigint not null,
  permission_id uuid not null references public.permission(id),
  primary key (action_set_id, action_set_version, permission_id),
  foreign key (action_set_id, action_set_version)
    references public.authorization_action_set_version(action_set_id, version_no)
);

create table public.field_projection_profile (
  id uuid primary key,
  stable_code text not null unique check (app_private.is_stable_code(stable_code))
);

create table public.field_projection_profile_version (
  profile_id uuid not null references public.field_projection_profile(id),
  version_no bigint not null check (version_no > 0),
  actor_kind text not null check (actor_kind in ('INTERNAL','VENDOR')),
  resource_type text not null check (app_private.is_stable_code(resource_type)),
  action_id text not null check (action_id ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  valid_from timestamptz not null,
  valid_until timestamptz,
  primary key (profile_id, version_no),
  check (valid_until is null or valid_until > valid_from)
);

create table public.field_projection_field (
  profile_id uuid not null,
  profile_version bigint not null,
  field_id text not null check (field_id ~ '^[A-Za-z][A-Za-z0-9_.]{0,127}$'),
  primary key (profile_id, profile_version, field_id),
  foreign key (profile_id, profile_version)
    references public.field_projection_profile_version(profile_id, version_no)
);

create index field_projection_profile_binding_idx
  on public.field_projection_profile_version(actor_kind,resource_type,action_id,valid_from,valid_until);

create table public.user_organization_assignment (
  id uuid primary key, user_id uuid not null references public.user_account(id),
  organization_id uuid not null references public.organization(id),
  valid_from timestamptz not null, valid_until timestamptz,
  granted_by_user_id uuid references public.user_account(id), grant_reason_code text not null check (app_private.is_stable_code(grant_reason_code)),
  revoked_at timestamptz, revoked_by_user_id uuid references public.user_account(id), revoke_reason_code text check (revoke_reason_code is null or app_private.is_stable_code(revoke_reason_code)),
  version_no bigint not null default 0 check (version_no >= 0),
  check (valid_until is null or valid_until > valid_from), check ((revoked_at is null) = (revoked_by_user_id is null))
);

create table public.user_department_assignment (
  id uuid primary key, user_id uuid not null references public.user_account(id),
  department_id uuid not null references public.department(id),
  valid_from timestamptz not null, valid_until timestamptz,
  granted_by_user_id uuid references public.user_account(id), grant_reason_code text not null check (app_private.is_stable_code(grant_reason_code)),
  revoked_at timestamptz, revoked_by_user_id uuid references public.user_account(id), revoke_reason_code text check (revoke_reason_code is null or app_private.is_stable_code(revoke_reason_code)),
  version_no bigint not null default 0 check (version_no >= 0),
  check (valid_until is null or valid_until > valid_from), check ((revoked_at is null) = (revoked_by_user_id is null))
);

create table public.user_position_assignment (
  id uuid primary key, user_id uuid not null references public.user_account(id),
  position_id uuid not null references public.position(id),
  valid_from timestamptz not null, valid_until timestamptz, is_primary boolean not null default true,
  granted_by_user_id uuid references public.user_account(id), grant_reason_code text not null check (app_private.is_stable_code(grant_reason_code)),
  revoked_at timestamptz, revoked_by_user_id uuid references public.user_account(id), revoke_reason_code text check (revoke_reason_code is null or app_private.is_stable_code(revoke_reason_code)),
  version_no bigint not null default 0 check (version_no >= 0),
  check (valid_until is null or valid_until > valid_from), check ((revoked_at is null) = (revoked_by_user_id is null))
);

create table public.user_role_assignment (
  id uuid primary key, user_id uuid not null references public.user_account(id),
  role_id uuid not null references public.role(id),
  valid_from timestamptz not null, valid_until timestamptz,
  granted_by_user_id uuid references public.user_account(id), grant_reason_code text not null check (app_private.is_stable_code(grant_reason_code)),
  revoked_at timestamptz, revoked_by_user_id uuid references public.user_account(id), revoke_reason_code text check (revoke_reason_code is null or app_private.is_stable_code(revoke_reason_code)),
  version_no bigint not null default 0 check (version_no >= 0),
  check (valid_until is null or valid_until > valid_from), check ((revoked_at is null) = (revoked_by_user_id is null))
);

create or replace function app_private.enforce_role_account_kind()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare account_kind text; role_code text; begin
  select u.account_kind into strict account_kind from public.user_account u where u.id=new.user_id;
  select r.stable_code into strict role_code from public.role r where r.id=new.role_id;
  if (account_kind='VENDOR' and role_code<>'ROLE_VENDOR_USER') or (account_kind='INTERNAL' and role_code='ROLE_VENDOR_USER') then
    raise exception 'role is incompatible with account kind' using errcode='23514';
  end if;
  return new;
end $$;
create trigger user_role_account_kind_guard before insert or update on public.user_role_assignment for each row execute function app_private.enforce_role_account_kind();

create table public.role_permission_assignment (
  id uuid primary key, role_id uuid not null references public.role(id), permission_id uuid not null references public.permission(id),
  valid_from timestamptz not null, valid_until timestamptz,
  granted_by_user_id uuid references public.user_account(id), grant_reason_code text not null check (app_private.is_stable_code(grant_reason_code)),
  revoked_at timestamptz, revoked_by_user_id uuid references public.user_account(id), revoke_reason_code text check (revoke_reason_code is null or app_private.is_stable_code(revoke_reason_code)),
  version_no bigint not null default 0 check (version_no >= 0),
  check (valid_until is null or valid_until > valid_from), check ((revoked_at is null) = (revoked_by_user_id is null))
);

create table public.user_security_entitlement_assignment (
  id uuid primary key,
  user_id uuid not null references public.user_account(id),
  entitlement_id uuid not null references public.security_entitlement(id),
  valid_from timestamptz not null, valid_until timestamptz,
  granted_by_user_id uuid references public.user_account(id),
  grant_reason_code text not null check (app_private.is_stable_code(grant_reason_code)),
  revoked_at timestamptz, revoked_by_user_id uuid references public.user_account(id),
  revoke_reason_code text check (revoke_reason_code is null or app_private.is_stable_code(revoke_reason_code)),
  version_no bigint not null default 0 check (version_no >= 0),
  check (valid_until is null or valid_until > valid_from),
  check ((revoked_at is null) = (revoked_by_user_id is null))
);

create table public.vendor (
  id uuid primary key,
  vendor_code text not null unique check (app_private.is_stable_code(vendor_code)),
  legal_name text not null,
  status text not null check (status in ('ACTIVE','DISABLED')),
  version_no bigint not null default 0 check (version_no >= 0)
);

create table public.vendor_user (
  id uuid primary key,
  vendor_id uuid not null references public.vendor(id),
  user_id uuid not null references public.user_account(id),
  status text not null check (status in ('ACTIVE','REVOKED')),
  valid_from timestamptz not null, valid_until timestamptz,
  granted_by_user_id uuid references public.user_account(id), grant_reason_code text not null check (app_private.is_stable_code(grant_reason_code)),
  revoked_at timestamptz, revoked_by_user_id uuid references public.user_account(id), revoke_reason_code text check (revoke_reason_code is null or app_private.is_stable_code(revoke_reason_code)),
  version_no bigint not null default 0 check (version_no >= 0),
  check (valid_until is null or valid_until > valid_from), check ((revoked_at is null) = (revoked_by_user_id is null))
);

create unique index vendor_user_active_unique on public.vendor_user(vendor_id,user_id) where revoked_at is null and status='ACTIVE';

create or replace function app_private.enforce_vendor_membership_account()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  if not exists(select 1 from public.user_account u where u.id=new.user_id and u.account_kind='VENDOR') then
    raise exception 'vendor membership requires VENDOR account' using errcode='23514';
  end if;
  return new;
end $$;
create trigger vendor_membership_account_guard before insert or update on public.vendor_user for each row execute function app_private.enforce_vendor_membership_account();

create table public.acting_authority_assignment (
  id uuid primary key,
  authenticated_user_id uuid not null references public.user_account(id),
  effective_actor_user_id uuid not null references public.user_account(id),
  role_id uuid not null references public.role(id),
  action_set_id uuid not null, action_set_version bigint not null,
  valid_from timestamptz not null, valid_until timestamptz not null,
  evidence_id uuid not null,
  granted_by_user_id uuid not null references public.user_account(id),
  grant_reason_code text not null check (app_private.is_stable_code(grant_reason_code)),
  revoked_at timestamptz, revoked_by_user_id uuid references public.user_account(id),
  version_no bigint not null default 0 check (version_no >= 0),
  foreign key (action_set_id,action_set_version) references public.authorization_action_set_version(action_set_id,version_no),
  check (valid_until > valid_from), check ((revoked_at is null) = (revoked_by_user_id is null))
);

create index user_role_effective_idx on public.user_role_assignment(user_id,valid_from,valid_until) where revoked_at is null;
create index user_security_entitlement_effective_idx on public.user_security_entitlement_assignment(user_id,valid_from,valid_until) where revoked_at is null;
create index vendor_user_effective_idx on public.vendor_user(user_id,vendor_id,valid_from,valid_until) where revoked_at is null;
create index acting_authority_effective_idx on public.acting_authority_assignment(authenticated_user_id,valid_from,valid_until) where revoked_at is null;

create or replace function app_private.enforce_internal_assignment_account()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  if not exists(select 1 from public.user_account u where u.id=new.user_id and u.account_kind='INTERNAL') then
    raise exception 'internal assignment requires INTERNAL account' using errcode='23514';
  end if;
  return new;
end $$;
create trigger user_organization_internal_guard before insert or update on public.user_organization_assignment for each row execute function app_private.enforce_internal_assignment_account();
create trigger user_department_internal_guard before insert or update on public.user_department_assignment for each row execute function app_private.enforce_internal_assignment_account();
create trigger user_position_internal_guard before insert or update on public.user_position_assignment for each row execute function app_private.enforce_internal_assignment_account();

create or replace function app_private.enforce_primary_position_window()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  if new.is_primary and new.revoked_at is null then
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
    if exists(select 1 from public.user_position_assignment p where p.user_id=new.user_id and p.id<>new.id and p.is_primary and p.revoked_at is null
      and tstzrange(p.valid_from,coalesce(p.valid_until,'infinity'::timestamptz),'[)') && tstzrange(new.valid_from,coalesce(new.valid_until,'infinity'::timestamptz),'[)')) then
      raise exception 'overlapping active primary position' using errcode='23P01';
    end if;
  end if;
  return new;
end $$;
create trigger user_position_primary_window_guard before insert or update on public.user_position_assignment for each row execute function app_private.enforce_primary_position_window();

create or replace function app_private.enforce_acting_authority_accounts()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  if not exists(select 1 from public.user_account u where u.id=new.authenticated_user_id and u.account_kind='INTERNAL' and u.status='ACTIVE' and u.valid_from<=new.valid_from and (u.valid_until is null or u.valid_until>=new.valid_until))
    or not exists(select 1 from public.user_account u where u.id=new.effective_actor_user_id and u.account_kind='INTERNAL' and u.status='ACTIVE' and u.valid_from<=new.valid_from and (u.valid_until is null or u.valid_until>=new.valid_until)) then
    raise exception 'acting authority requires active INTERNAL authenticated/effective accounts' using errcode='23514';
  end if;
  return new;
end $$;
create trigger acting_authority_account_guard before insert or update on public.acting_authority_assignment for each row execute function app_private.enforce_acting_authority_accounts();

insert into public.position(id,stable_code,approval_capability,approval_rank) values
  ('10000000-0000-4000-8000-000000000001','POSITION_JUNIOR_RESEARCHER','NONE',10),
  ('10000000-0000-4000-8000-000000000002','POSITION_SENIOR_RESEARCHER','NONE',20),
  ('10000000-0000-4000-8000-000000000003','POSITION_LAB_DIRECTOR','OFFICIAL',30),
  ('10000000-0000-4000-8000-000000000004','POSITION_REPRESENTATIVE','REPRESENTATIVE',40);

insert into public.role(id,stable_code) values
  ('20000000-0000-4000-8000-000000000001','ROLE_RESEARCHER'),
  ('20000000-0000-4000-8000-000000000002','ROLE_PROJECT_MANAGER'),
  ('20000000-0000-4000-8000-000000000003','ROLE_LAB_DIRECTOR'),
  ('20000000-0000-4000-8000-000000000004','ROLE_REPRESENTATIVE'),
  ('20000000-0000-4000-8000-000000000005','ROLE_VENDOR_USER'),
  ('20000000-0000-4000-8000-000000000006','ADMIN_SYSTEM'),
  ('20000000-0000-4000-8000-000000000007','ADMIN_SECURITY'),
  ('20000000-0000-4000-8000-000000000008','ROLE_HQ_VIEWER'),
  ('20000000-0000-4000-8000-000000000009','ROLE_SAFETY_MANAGER'),
  ('20000000-0000-4000-8000-000000000010','ROLE_ALLOWANCE_EVALUATOR'),
  ('20000000-0000-4000-8000-000000000011','ADMIN_DOCUMENT'),
  ('20000000-0000-4000-8000-000000000012','ADMIN_APPROVAL');

insert into public.permission(id,stable_code) values
  ('30000000-0000-4000-8000-000000000001','authorization.assignment.manage'),
  ('30000000-0000-4000-8000-000000000002','audit.security.read'),
  ('30000000-0000-4000-8000-000000000003','identity.account.read'),
  ('30000000-0000-4000-8000-000000000004','identity.account.disable'),
  ('30000000-0000-4000-8000-000000000005','vendor.record.disable'),
  ('30000000-0000-4000-8000-000000000006','vendor.membership.manage');

create or replace function app_private.request_time()
returns timestamptz language sql stable security definer set search_path=pg_catalog,app_private
as $$ select app_private.required_setting('app.request_time')::timestamptz $$;

create or replace function app_private.current_actor_user_id()
returns uuid language sql stable security definer set search_path=pg_catalog,app_private
as $$ select app_private.required_setting('app.actor_user_id')::uuid $$;

create or replace function app_private.current_effective_actor_user_id()
returns uuid language sql stable security definer set search_path=pg_catalog,app_private
as $$ select app_private.required_setting('app.effective_actor_user_id')::uuid $$;

create or replace function app_private.current_acting_authority_id()
returns uuid language sql stable security invoker set search_path=pg_catalog
as $$ select nullif(current_setting('app.acting_authority_id',true),'')::uuid $$;

create or replace function app_private.actor_is_active(at_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$ select exists(select 1 from public.user_account u where u.id=app_private.current_actor_user_id() and u.status='ACTIVE' and u.valid_from<=at_time and (u.valid_until is null or u.valid_until>at_time)) $$;

create or replace function app_private.actor_has_vendor_membership(target_vendor_user_id uuid,target_vendor_id uuid,at_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select app_private.actor_is_active(at_time) and exists(
    select 1 from public.vendor_user vu
    join public.vendor v on v.id=vu.vendor_id and v.status='ACTIVE'
    join public.user_account u on u.id=vu.user_id and u.account_kind='VENDOR'
    where vu.id=target_vendor_user_id and vu.vendor_id=target_vendor_id and vu.user_id=app_private.current_actor_user_id()
      and vu.status='ACTIVE' and vu.revoked_at is null and vu.valid_from<=at_time and (vu.valid_until is null or vu.valid_until>at_time)
  )
$$;

create or replace function app_private.actor_has_active_vendor(target_vendor_id uuid,at_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select app_private.actor_is_active(at_time) and exists(
    select 1 from public.vendor_user vu
    join public.vendor v on v.id=vu.vendor_id and v.status='ACTIVE'
    join public.user_account u on u.id=vu.user_id and u.account_kind='VENDOR' and u.status='ACTIVE'
    where vu.vendor_id=target_vendor_id and vu.user_id=app_private.current_actor_user_id()
      and vu.status='ACTIVE' and vu.revoked_at is null and vu.valid_from<=at_time and (vu.valid_until is null or vu.valid_until>at_time)
  )
$$;

create or replace function app_private.action_set_allows(target_action_set_id uuid,target_version bigint,action_code text,at_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select exists(
    select 1 from public.authorization_action_set_version av
    join public.authorization_action_set_permission ap on ap.action_set_id=av.action_set_id and ap.action_set_version=av.version_no
    join public.permission p on p.id=ap.permission_id and p.status='ACTIVE'
    where av.action_set_id=target_action_set_id and av.version_no=target_version and av.valid_from<=at_time and (av.valid_until is null or av.valid_until>at_time) and p.stable_code=action_code
  )
$$;

create or replace function app_private.acting_authority_allows(action_code text,at_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select exists(
    select 1 from public.acting_authority_assignment aa
    join public.role acting_role on acting_role.id=aa.role_id and acting_role.status='ACTIVE'
    join public.user_account authenticated on authenticated.id=aa.authenticated_user_id and authenticated.account_kind='INTERNAL' and authenticated.status='ACTIVE'
    join public.user_account effective on effective.id=aa.effective_actor_user_id and effective.account_kind='INTERNAL' and effective.status='ACTIVE'
    where aa.id=app_private.current_acting_authority_id()
      and aa.authenticated_user_id=app_private.current_actor_user_id()
      and aa.effective_actor_user_id=app_private.current_effective_actor_user_id()
      and aa.revoked_at is null and aa.valid_from<=at_time and aa.valid_until>at_time
      and authenticated.valid_from<=at_time and (authenticated.valid_until is null or authenticated.valid_until>at_time)
      and effective.valid_from<=at_time and (effective.valid_until is null or effective.valid_until>at_time)
      and (action_code<>'approval.step.approve' or acting_role.stable_code in ('ROLE_LAB_DIRECTOR','ROLE_REPRESENTATIVE'))
      and app_private.action_set_allows(aa.action_set_id,aa.action_set_version,action_code,at_time)
  )
$$;

create or replace function app_private.actor_has_permission(action_code text, at_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select app_private.actor_is_active(at_time) and (
    exists(
      select 1 from public.user_role_assignment ur
      join public.role r on r.id=ur.role_id and r.status='ACTIVE'
      join public.role_permission_assignment rp on rp.role_id=r.id and rp.revoked_at is null and rp.valid_from<=at_time and (rp.valid_until is null or rp.valid_until>at_time)
      join public.permission p on p.id=rp.permission_id and p.status='ACTIVE'
      where ur.user_id=app_private.current_actor_user_id() and ur.revoked_at is null and ur.valid_from<=at_time and (ur.valid_until is null or ur.valid_until>at_time) and p.stable_code=action_code
    ) or app_private.acting_authority_allows(action_code,at_time)
  )
$$;

create or replace function app_private.resolve_user_account(verified_auth_subject text,at_time timestamptz)
returns table(user_id uuid,account_kind text,status text,valid_from timestamptz,valid_until timestamptz,version_no bigint)
language sql stable security definer set search_path=pg_catalog,public
as $$ select id,account_kind,status,valid_from,valid_until,version_no from public.user_account where auth_subject=verified_auth_subject and valid_from<=at_time $$;

create or replace function app_private.resolve_actor_context_snapshot(verified_auth_subject text,at_time timestamptz)
returns jsonb language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select jsonb_build_object(
    'userId',u.id,'authSubject',u.auth_subject,'accountKind',u.account_kind,'accountStatus',u.status,
    'accountValidFrom',u.valid_from,'accountValidUntil',u.valid_until,'accountVersion',u.version_no,
    'organizations',coalesce((select jsonb_agg(jsonb_build_object('assignmentId',a.id,'stableCode',o.stable_code,'validFrom',a.valid_from,'validUntil',a.valid_until,'evidenceId',a.id) order by o.stable_code)
      from public.user_organization_assignment a join public.organization o on o.id=a.organization_id and o.status='ACTIVE'
      where a.user_id=u.id and a.revoked_at is null and a.valid_from<=at_time and (a.valid_until is null or a.valid_until>at_time)),'[]'::jsonb),
    'departments',coalesce((select jsonb_agg(jsonb_build_object('assignmentId',a.id,'stableCode',d.stable_code,'validFrom',a.valid_from,'validUntil',a.valid_until,'evidenceId',a.id) order by d.stable_code)
      from public.user_department_assignment a join public.department d on d.id=a.department_id and d.status='ACTIVE'
      where a.user_id=u.id and a.revoked_at is null and a.valid_from<=at_time and (a.valid_until is null or a.valid_until>at_time)),'[]'::jsonb),
    'positions',coalesce((select jsonb_agg(jsonb_build_object('assignmentId',a.id,'stableCode',p.stable_code,'validFrom',a.valid_from,'validUntil',a.valid_until,'evidenceId',a.id) order by p.stable_code)
      from public.user_position_assignment a join public.position p on p.id=a.position_id and p.status='ACTIVE'
      where a.user_id=u.id and a.is_primary and a.revoked_at is null and a.valid_from<=at_time and (a.valid_until is null or a.valid_until>at_time)),'[]'::jsonb),
    'roles',coalesce((select jsonb_agg(jsonb_build_object('assignmentId',a.id,'stableCode',r.stable_code,'validFrom',a.valid_from,'validUntil',a.valid_until,'evidenceId',a.id) order by r.stable_code)
      from public.user_role_assignment a join public.role r on r.id=a.role_id and r.status='ACTIVE'
      where a.user_id=u.id and a.revoked_at is null and a.valid_from<=at_time and (a.valid_until is null or a.valid_until>at_time)),'[]'::jsonb),
    'permissions',coalesce((select jsonb_agg(distinct jsonb_build_object('assignmentId',rp.id,'stableCode',p.stable_code,'validFrom',greatest(ur.valid_from,rp.valid_from),'validUntil',least(ur.valid_until,rp.valid_until),'evidenceId',rp.id))
      from public.user_role_assignment ur join public.role_permission_assignment rp on rp.role_id=ur.role_id
      join public.permission p on p.id=rp.permission_id and p.status='ACTIVE'
      where ur.user_id=u.id and ur.revoked_at is null and rp.revoked_at is null
        and ur.valid_from<=at_time and (ur.valid_until is null or ur.valid_until>at_time)
        and rp.valid_from<=at_time and (rp.valid_until is null or rp.valid_until>at_time)),'[]'::jsonb),
    'vendorMemberships',coalesce((select jsonb_agg(jsonb_build_object('vendorUserId',vu.id,'vendorId',vu.vendor_id,'status',vu.status,'validFrom',vu.valid_from,'validUntil',vu.valid_until,'evidenceId',vu.id) order by vu.id)
      from public.vendor_user vu join public.vendor v on v.id=vu.vendor_id and v.status='ACTIVE'
      where vu.user_id=u.id and vu.status='ACTIVE' and vu.revoked_at is null and vu.valid_from<=at_time and (vu.valid_until is null or vu.valid_until>at_time)),'[]'::jsonb),
    'actingAuthorities',coalesce((select jsonb_agg(jsonb_build_object('assignmentId',aa.id,'roleId',r.stable_code,'effectiveActorId',aa.effective_actor_user_id,
        'allowedActions',coalesce((select jsonb_agg(p.stable_code order by p.stable_code)
          from public.authorization_action_set_version av
          join public.authorization_action_set_permission ap on ap.action_set_id=av.action_set_id and ap.action_set_version=av.version_no
          join public.permission p on p.id=ap.permission_id and p.status='ACTIVE'
          where av.action_set_id=aa.action_set_id and av.version_no=aa.action_set_version
            and av.valid_from<=at_time and (av.valid_until is null or av.valid_until>at_time)),'[]'::jsonb),
        'validFrom',aa.valid_from,'validUntil',aa.valid_until,'evidenceId',aa.evidence_id) order by aa.id)
      from public.acting_authority_assignment aa join public.role r on r.id=aa.role_id and r.status='ACTIVE'
      join public.user_account authenticated on authenticated.id=aa.authenticated_user_id and authenticated.account_kind='INTERNAL' and authenticated.status='ACTIVE'
      join public.user_account effective on effective.id=aa.effective_actor_user_id and effective.account_kind='INTERNAL' and effective.status='ACTIVE'
      where aa.authenticated_user_id=u.id and aa.revoked_at is null and aa.valid_from<=at_time and aa.valid_until>at_time
        and authenticated.valid_from<=at_time and (authenticated.valid_until is null or authenticated.valid_until>at_time)
        and effective.valid_from<=at_time and (effective.valid_until is null or effective.valid_until>at_time)),'[]'::jsonb),
    'securityEntitlements',coalesce((select jsonb_agg(se.stable_code order by se.stable_code)
      from public.user_security_entitlement_assignment usa join public.security_entitlement se on se.id=usa.entitlement_id and se.status='ACTIVE'
      where usa.user_id=u.id and usa.revoked_at is null and usa.valid_from<=at_time and (usa.valid_until is null or usa.valid_until>at_time)),'[]'::jsonb),
    'evidenceIds',jsonb_build_array(u.id)
  )
  from public.user_account u where u.auth_subject=verified_auth_subject and u.valid_from<=at_time
$$;

create or replace function app_private.grant_user_role(
  assignment_id uuid,target_user_id uuid,target_role_id uuid,starts_at timestamptz,ends_at timestamptz,
  reason_code text,audit_id uuid,after_hash text,occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare trusted_time timestamptz := app_private.request_time(); begin
  if occurred_at is distinct from trusted_time then raise exception 'occurred_at must equal trusted request time' using errcode='22023'; end if;
  if not app_private.actor_has_permission('authorization.assignment.manage',trusted_time) then raise exception 'assignment management denied' using errcode='42501'; end if;
  insert into public.user_role_assignment(id,user_id,role_id,valid_from,valid_until,granted_by_user_id,grant_reason_code)
  values(assignment_id,target_user_id,target_role_id,starts_at,ends_at,app_private.current_actor_user_id(),reason_code);
  perform app_private.append_audit(audit_id,'identity.assignment.grant','IDENTITY_ASSIGNMENT',assignment_id,0,'SUCCEEDED',reason_code,null,null,after_hash,null,occurred_at);
end $$;

create or replace function app_private.revoke_user_role(
  assignment_id uuid,expected_version bigint,reason_code text,audit_id uuid,before_hash text,after_hash text,occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare trusted_time timestamptz := app_private.request_time(); begin
  if occurred_at is distinct from trusted_time then raise exception 'occurred_at must equal trusted request time' using errcode='22023'; end if;
  if not app_private.actor_has_permission('authorization.assignment.manage',trusted_time) then raise exception 'assignment management denied' using errcode='42501'; end if;
  update public.user_role_assignment set revoked_at=occurred_at,revoked_by_user_id=app_private.current_actor_user_id(),revoke_reason_code=reason_code,
    version_no=app_private.next_version(version_no,expected_version)
  where id=assignment_id and revoked_at is null;
  if not found then raise exception 'assignment missing or stale' using errcode='40001'; end if;
  perform app_private.append_audit(audit_id,'identity.assignment.revoke','IDENTITY_ASSIGNMENT',assignment_id,expected_version+1,'SUCCEEDED',reason_code,null,before_hash,after_hash,null,occurred_at);
end $$;

create or replace function app_private.disable_user_account(
  target_user_id uuid,expected_version bigint,reason_code text,audit_id uuid,before_hash text,after_hash text,occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare trusted_time timestamptz := app_private.request_time(); begin
  if occurred_at is distinct from trusted_time then raise exception 'occurred_at must equal trusted request time' using errcode='22023'; end if;
  if not app_private.actor_has_permission('identity.account.disable',trusted_time) then raise exception 'account disable denied' using errcode='42501'; end if;
  update public.user_account set status='DISABLED',updated_at=trusted_time,version_no=app_private.next_version(version_no,expected_version)
  where id=target_user_id and status='ACTIVE';
  if not found then raise exception 'account missing, inactive, or stale' using errcode='40001'; end if;
  perform app_private.append_audit(audit_id,'identity.account.disable','USER_ACCOUNT',target_user_id,expected_version+1,'SUCCEEDED',reason_code,null,before_hash,after_hash,null,trusted_time);
end $$;

create or replace function app_private.disable_vendor(
  target_vendor_id uuid,expected_version bigint,reason_code text,audit_id uuid,before_hash text,after_hash text,occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare trusted_time timestamptz := app_private.request_time(); begin
  if occurred_at is distinct from trusted_time then raise exception 'occurred_at must equal trusted request time' using errcode='22023'; end if;
  if not app_private.actor_has_permission('vendor.record.disable',trusted_time) then raise exception 'vendor disable denied' using errcode='42501'; end if;
  update public.vendor set status='DISABLED',version_no=app_private.next_version(version_no,expected_version)
  where id=target_vendor_id and status='ACTIVE';
  if not found then raise exception 'vendor missing, inactive, or stale' using errcode='40001'; end if;
  perform app_private.append_audit(audit_id,'vendor.record.disable','VENDOR',target_vendor_id,expected_version+1,'SUCCEEDED',reason_code,null,before_hash,after_hash,null,trusted_time);
end $$;

create or replace function app_private.grant_vendor_membership(
  membership_id uuid,target_vendor_id uuid,target_user_id uuid,starts_at timestamptz,ends_at timestamptz,
  reason_code text,audit_id uuid,after_hash text,occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare trusted_time timestamptz := app_private.request_time(); begin
  if occurred_at is distinct from trusted_time then raise exception 'occurred_at must equal trusted request time' using errcode='22023'; end if;
  if not app_private.actor_has_permission('vendor.membership.manage',trusted_time) then raise exception 'vendor membership grant denied' using errcode='42501'; end if;
  if not exists(select 1 from public.user_account u where u.id=target_user_id and u.account_kind='VENDOR' and u.status='ACTIVE' and u.valid_from<=trusted_time and (u.valid_until is null or u.valid_until>trusted_time)) then
    raise exception 'vendor membership requires active VENDOR account' using errcode='23514';
  end if;
  if not exists(select 1 from public.vendor v where v.id=target_vendor_id and v.status='ACTIVE') then raise exception 'active vendor required' using errcode='23514'; end if;
  insert into public.vendor_user(id,vendor_id,user_id,status,valid_from,valid_until,granted_by_user_id,grant_reason_code)
  values(membership_id,target_vendor_id,target_user_id,'ACTIVE',starts_at,ends_at,app_private.current_actor_user_id(),reason_code);
  perform app_private.append_audit(audit_id,'vendor.membership.grant','VENDOR_MEMBERSHIP',membership_id,0,'SUCCEEDED',reason_code,null,null,after_hash,null,trusted_time);
end $$;

create or replace function app_private.revoke_vendor_membership(
  membership_id uuid,expected_version bigint,reason_code text,audit_id uuid,before_hash text,after_hash text,occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare trusted_time timestamptz := app_private.request_time(); begin
  if occurred_at is distinct from trusted_time then raise exception 'occurred_at must equal trusted request time' using errcode='22023'; end if;
  if not app_private.actor_has_permission('vendor.membership.manage',trusted_time) then raise exception 'vendor membership revoke denied' using errcode='42501'; end if;
  update public.vendor_user set status='REVOKED',revoked_at=trusted_time,revoked_by_user_id=app_private.current_actor_user_id(),revoke_reason_code=reason_code,
    version_no=app_private.next_version(version_no,expected_version)
  where id=membership_id and status='ACTIVE' and revoked_at is null;
  if not found then raise exception 'vendor membership missing, inactive, or stale' using errcode='40001'; end if;
  perform app_private.append_audit(audit_id,'vendor.membership.revoke','VENDOR_MEMBERSHIP',membership_id,expected_version+1,'SUCCEEDED',reason_code,null,before_hash,after_hash,null,trusted_time);
end $$;

alter table public.audit_log add constraint audit_actor_user_fk foreign key(actor_user_id) references public.user_account(id) not valid;
alter table public.audit_log add constraint audit_effective_actor_user_fk foreign key(effective_actor_user_id) references public.user_account(id) not valid;

do $rls$ declare table_name text; begin
  foreach table_name in array array['organization','department','position','user_account','role','permission','security_entitlement','authorization_action_set','authorization_action_set_version','authorization_action_set_permission','field_projection_profile','field_projection_profile_version','field_projection_field','user_organization_assignment','user_department_assignment','user_position_assignment','user_role_assignment','role_permission_assignment','user_security_entitlement_assignment','vendor','vendor_user','acting_authority_assignment']
  loop execute format('alter table public.%I enable row level security',table_name); execute format('alter table public.%I force row level security',table_name); end loop;
end $rls$;

revoke all on public.organization,public.department,public.position,public.user_account,public.role,public.permission,public.security_entitlement,
  public.authorization_action_set,public.authorization_action_set_version,public.authorization_action_set_permission,
  public.field_projection_profile,public.field_projection_profile_version,public.field_projection_field,
  public.user_organization_assignment,public.user_department_assignment,public.user_position_assignment,public.user_role_assignment,
  public.role_permission_assignment,public.user_security_entitlement_assignment,public.vendor,public.vendor_user,public.acting_authority_assignment
from public,youone_request,youone_privileged_writer;

grant select on public.user_account,public.user_position_assignment,public.user_role_assignment,public.role,public.permission,public.role_permission_assignment,public.vendor_user,public.vendor to youone_request;

create policy user_account_self on public.user_account for select to youone_request using(id=app_private.current_actor_user_id() and app_private.actor_is_active());
create policy user_position_self on public.user_position_assignment for select to youone_request using(user_id=app_private.current_actor_user_id() and app_private.actor_is_active() and revoked_at is null and valid_from<=app_private.request_time() and (valid_until is null or valid_until>app_private.request_time()));
create policy user_role_self on public.user_role_assignment for select to youone_request using(user_id=app_private.current_actor_user_id() and app_private.actor_is_active() and revoked_at is null and valid_from<=app_private.request_time() and (valid_until is null or valid_until>app_private.request_time()));
create policy vendor_user_self on public.vendor_user for select to youone_request using(
  app_private.actor_has_vendor_membership(id,vendor_id)
);
create policy vendor_visible_via_membership on public.vendor for select to youone_request using(
  app_private.actor_has_active_vendor(vendor.id)
);
create policy assigned_role_lookup on public.role for select to youone_request using(app_private.actor_is_active() and exists(select 1 from public.user_role_assignment ur where ur.role_id=role.id and ur.user_id=app_private.current_actor_user_id() and ur.revoked_at is null and ur.valid_from<=app_private.request_time() and (ur.valid_until is null or ur.valid_until>app_private.request_time())));
create policy assigned_permission_lookup on public.permission for select to youone_request using(app_private.actor_is_active() and app_private.actor_has_permission(permission.stable_code));
create policy assigned_role_permission_lookup on public.role_permission_assignment for select to youone_request using(app_private.actor_is_active() and revoked_at is null and valid_from<=app_private.request_time() and (valid_until is null or valid_until>app_private.request_time()) and exists(select 1 from public.user_role_assignment ur where ur.role_id=role_permission_assignment.role_id and ur.user_id=app_private.current_actor_user_id() and ur.revoked_at is null and ur.valid_from<=app_private.request_time() and (ur.valid_until is null or ur.valid_until>app_private.request_time())));

revoke all on all functions in schema app_private from public;
revoke all on function app_private.resolve_user_account(text,timestamptz) from public;
revoke all on function app_private.resolve_actor_context_snapshot(text,timestamptz) from public;
revoke all on function app_private.resolve_user_account(text,timestamptz) from youone_request,youone_privileged_writer;
revoke all on function app_private.resolve_actor_context_snapshot(text,timestamptz) from youone_request,youone_privileged_writer;
revoke all on function app_private.grant_user_role(uuid,uuid,uuid,timestamptz,timestamptz,text,uuid,text,timestamptz) from public;
revoke all on function app_private.revoke_user_role(uuid,bigint,text,uuid,text,text,timestamptz) from public;
revoke all on function app_private.disable_user_account(uuid,bigint,text,uuid,text,text,timestamptz) from public;
revoke all on function app_private.disable_vendor(uuid,bigint,text,uuid,text,text,timestamptz) from public;
revoke all on function app_private.grant_vendor_membership(uuid,uuid,uuid,timestamptz,timestamptz,text,uuid,text,timestamptz) from public;
revoke all on function app_private.revoke_vendor_membership(uuid,bigint,text,uuid,text,text,timestamptz) from public;
grant execute on function app_private.resolve_user_account(text,timestamptz) to youone_identity_resolver;
grant execute on function app_private.resolve_actor_context_snapshot(text,timestamptz) to youone_identity_resolver;
grant execute on function app_private.request_time() to youone_request;
grant execute on function app_private.current_actor_user_id() to youone_request;
grant execute on function app_private.current_effective_actor_user_id() to youone_request;
grant execute on function app_private.current_acting_authority_id() to youone_request;
grant execute on function app_private.actor_is_active(timestamptz) to youone_request;
grant execute on function app_private.actor_has_vendor_membership(uuid,uuid,timestamptz) to youone_request;
grant execute on function app_private.actor_has_active_vendor(uuid,timestamptz) to youone_request;
grant execute on function app_private.actor_has_permission(text,timestamptz) to youone_request;
grant execute on function app_private.grant_user_role(uuid,uuid,uuid,timestamptz,timestamptz,text,uuid,text,timestamptz) to youone_request;
grant execute on function app_private.revoke_user_role(uuid,bigint,text,uuid,text,text,timestamptz) to youone_request;
grant execute on function app_private.disable_user_account(uuid,bigint,text,uuid,text,text,timestamptz) to youone_request;
grant execute on function app_private.disable_vendor(uuid,bigint,text,uuid,text,text,timestamptz) to youone_request;
grant execute on function app_private.grant_vendor_membership(uuid,uuid,uuid,timestamptz,timestamptz,text,uuid,text,timestamptz) to youone_request;
grant execute on function app_private.revoke_vendor_membership(uuid,bigint,text,uuid,text,text,timestamptz) to youone_request;

comment on table public.authorization_action_set_permission is 'Normalized versioned action set. Wildcards and JSON action arrays are prohibited.';
comment on table public.field_projection_field is 'Named server-side projection fields. Request callers provide profile ID/version, never an arbitrary field list.';
comment on function app_private.actor_has_vendor_membership is 'M06/M07 typed scope RLS must additionally require this exact vendor_user/vendor match.';
