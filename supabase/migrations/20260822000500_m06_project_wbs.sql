-- M06 Project / WBS / Formal Research Designation
-- Ordinary Project lifecycle is independent from the immutable, Lab-Director-only
-- formal research designation. RND_PROGRAM is owned by M11; M06 intentionally
-- creates no placeholder program row and no untyped UUID escape hatch.

insert into public.aggregate_type_definition(aggregate_type) values
  ('PRODUCT'),('PROJECT'),('PROJECT_MEMBER'),('PROJECT_VENDOR_GRANT'),('WBS_NODE'),
  ('RESEARCH_PROJECT_APPLICATION'),('RESEARCH_PROJECT_DESIGNATION')
on conflict do nothing;

insert into public.action_definition(action_id) values
  ('product.record.create'),('project.record.create'),('project.record.plan'),('project.record.start'),
  ('project.record.hold'),('project.record.resume'),('project.record.cancel'),('project.member.assign'),
  ('project.product.link'),('project.vendor_scope.grant'),('project.vendor_scope.revoke'),
  ('project.summary.read'),('project.wbs.create'),('project.wbs.update'),('project.wbs.read'),
  ('project.research_designation.create'),('project.research_designation.seal'),
  ('project.research_designation.submit'),('project.research_designation.consent'),
  ('project.research_designation.reject')
on conflict do nothing;

insert into public.permission(id,stable_code) values
  ('36000000-0000-4000-8000-000000000001','project.record.create'),
  ('36000000-0000-4000-8000-000000000002','project.record.update'),
  ('36000000-0000-4000-8000-000000000003','project.summary.read'),
  ('36000000-0000-4000-8000-000000000004','project.wbs.update'),
  ('36000000-0000-4000-8000-000000000005','project.wbs.read'),
  ('36000000-0000-4000-8000-000000000006','project.research_designation.submit'),
  ('36000000-0000-4000-8000-000000000007','project.vendor_scope.manage')
on conflict(stable_code) do nothing;

insert into public.domain_event_definition(event_id,payload_schema_id,payload_schema_version) values
  ('EVT-PROJECT-CREATED','PROJECT_EVENT_REF',1),('EVT-PROJECT-PLANNED','PROJECT_EVENT_REF',1),
  ('EVT-PROJECT-STARTED','PROJECT_EVENT_REF',1),('EVT-PROJECT-HELD','PROJECT_EVENT_REF',1),
  ('EVT-PROJECT-RESUMED','PROJECT_EVENT_REF',1),('EVT-PROJECT-CANCELLED','PROJECT_EVENT_REF',1),
  ('EVT-WBS-CREATED','WBS_EVENT_REF',1),('EVT-WBS-UPDATED','WBS_EVENT_REF',1),
  ('EVT-RP-APPLICATION-CREATED','RESEARCH_PROJECT_EVENT_REF',1),
  ('EVT-RP-APPLICATION-SEALED','RESEARCH_PROJECT_EVENT_REF',1),
  ('EVT-RP-APPLICATION-SUBMITTED','RESEARCH_PROJECT_EVENT_REF',1),
  ('EVT-RP-DIRECTOR-CONSENTED','RESEARCH_PROJECT_EVENT_REF',1),
  ('EVT-RP-APPLICATION-RETURNED','RESEARCH_PROJECT_EVENT_REF',1),
  ('EVT-RP-APPLICATION-REJECTED','RESEARCH_PROJECT_EVENT_REF',1)
on conflict do nothing;

insert into public.state_machine_definition(machine_id,aggregate_type) values
  ('SM-PROJECT-V1','PROJECT'),('SM-WBS-V1','WBS_NODE'),
  ('SM-RESEARCH-PROJECT-DESIGNATION-V1','RESEARCH_PROJECT_APPLICATION')
on conflict do nothing;

insert into public.state_definition(machine_id,state_id,is_terminal) values
  ('SM-PROJECT-V1','DRAFT',false),('SM-PROJECT-V1','PLANNED',false),('SM-PROJECT-V1','ACTIVE',false),
  ('SM-PROJECT-V1','ON_HOLD',false),('SM-PROJECT-V1','CLOSING',false),('SM-PROJECT-V1','CLOSED',true),
  ('SM-PROJECT-V1','CANCELLED',true),
  ('SM-WBS-V1','BACKLOG',false),('SM-WBS-V1','READY',false),('SM-WBS-V1','IN_PROGRESS',false),
  ('SM-WBS-V1','BLOCKED',false),('SM-WBS-V1','REVIEW_REQUIRED',false),('SM-WBS-V1','DONE',true),
  ('SM-WBS-V1','CANCELLED',true),
  ('SM-RESEARCH-PROJECT-DESIGNATION-V1','NOT_APPLIED',false),
  ('SM-RESEARCH-PROJECT-DESIGNATION-V1','APPLICATION_DRAFT',false),
  ('SM-RESEARCH-PROJECT-DESIGNATION-V1','DIRECTOR_REVIEW_PENDING',false),
  ('SM-RESEARCH-PROJECT-DESIGNATION-V1','APPROVED',false),
  ('SM-RESEARCH-PROJECT-DESIGNATION-V1','RETURNED',false),
  ('SM-RESEARCH-PROJECT-DESIGNATION-V1','REJECTED',false),
  ('SM-RESEARCH-PROJECT-DESIGNATION-V1','SUSPENDED',false),
  ('SM-RESEARCH-PROJECT-DESIGNATION-V1','REVOKED',true),
  ('SM-RESEARCH-PROJECT-DESIGNATION-V1','EXPIRED',true)
on conflict do nothing;

insert into public.transition_definition(machine_id,event_id,from_state,to_state) values
  ('SM-PROJECT-V1','EVT-PROJECT-CREATE',null,'DRAFT'),
  ('SM-PROJECT-V1','EVT-PROJECT-PLAN','DRAFT','PLANNED'),
  ('SM-PROJECT-V1','EVT-PROJECT-START','PLANNED','ACTIVE'),
  ('SM-PROJECT-V1','EVT-PROJECT-HOLD','ACTIVE','ON_HOLD'),
  ('SM-PROJECT-V1','EVT-PROJECT-RESUME','ON_HOLD','ACTIVE'),
  ('SM-PROJECT-V1','EVT-PROJECT-CANCEL','DRAFT','CANCELLED'),
  ('SM-PROJECT-V1','EVT-PROJECT-CANCEL','PLANNED','CANCELLED'),
  ('SM-PROJECT-V1','EVT-PROJECT-CANCEL','ACTIVE','CANCELLED'),
  ('SM-PROJECT-V1','EVT-PROJECT-CANCEL','ON_HOLD','CANCELLED'),
  ('SM-WBS-V1','EVT-WBS-CREATE',null,'BACKLOG'),
  ('SM-WBS-V1','EVT-WBS-READY','BACKLOG','READY'),
  ('SM-WBS-V1','EVT-WBS-START','READY','IN_PROGRESS'),
  ('SM-WBS-V1','EVT-WBS-BLOCK','IN_PROGRESS','BLOCKED'),
  ('SM-WBS-V1','EVT-WBS-UNBLOCK','BLOCKED','IN_PROGRESS'),
  ('SM-WBS-V1','EVT-WBS-SUBMIT-REVIEW','IN_PROGRESS','REVIEW_REQUIRED'),
  ('SM-WBS-V1','EVT-WBS-ACCEPT','REVIEW_REQUIRED','DONE'),
  ('SM-WBS-V1','EVT-WBS-REWORK','REVIEW_REQUIRED','IN_PROGRESS'),
  ('SM-WBS-V1','EVT-WBS-CANCEL','BACKLOG','CANCELLED'),
  ('SM-WBS-V1','EVT-WBS-CANCEL','READY','CANCELLED'),
  ('SM-WBS-V1','EVT-WBS-CANCEL','IN_PROGRESS','CANCELLED'),
  ('SM-WBS-V1','EVT-WBS-CANCEL','BLOCKED','CANCELLED'),
  ('SM-WBS-V1','EVT-WBS-CANCEL','REVIEW_REQUIRED','CANCELLED'),
  ('SM-RESEARCH-PROJECT-DESIGNATION-V1','EVT-RP-APPLICATION-CREATE',null,'APPLICATION_DRAFT'),
  ('SM-RESEARCH-PROJECT-DESIGNATION-V1','EVT-RP-APPLICATION-SUBMIT','APPLICATION_DRAFT','DIRECTOR_REVIEW_PENDING'),
  ('SM-RESEARCH-PROJECT-DESIGNATION-V1','EVT-RP-DIRECTOR-CONSENT','DIRECTOR_REVIEW_PENDING','APPROVED'),
  ('SM-RESEARCH-PROJECT-DESIGNATION-V1','EVT-RP-RETURN','DIRECTOR_REVIEW_PENDING','RETURNED'),
  ('SM-RESEARCH-PROJECT-DESIGNATION-V1','EVT-RP-REJECT','DIRECTOR_REVIEW_PENDING','REJECTED')
on conflict do nothing;

create table public.product (
  id uuid primary key,
  product_code text not null unique check(app_private.is_stable_code(product_code)),
  name text not null check(length(name) between 1 and 200),
  state text not null check(state in ('ACTIVE','INACTIVE')),
  version_no bigint not null default 1 check(version_no>0),
  created_by_user_id uuid not null references public.user_account(id),
  created_at timestamptz not null
);

create table public.project (
  id uuid primary key,
  project_code text not null unique check(app_private.is_stable_code(project_code)),
  name text not null check(length(name) between 1 and 200),
  organization_id uuid not null references public.organization(id),
  owner_user_id uuid not null references public.user_account(id),
  objective text not null check(length(objective) between 1 and 4000),
  period_start date not null,
  period_end date not null,
  visibility_code text not null check(visibility_code in ('MEMBERS_ONLY','ORGANIZATION')),
  state text not null check(state in ('DRAFT','PLANNED','ACTIVE','ON_HOLD','CLOSING','CLOSED','CANCELLED')),
  version_no bigint not null default 1 check(version_no>0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check(period_end>=period_start)
);

create table public.project_member (
  id uuid primary key,
  project_id uuid not null references public.project(id),
  user_id uuid not null references public.user_account(id),
  project_role_id text not null check(project_role_id in ('OWNER','PROJECT_MANAGER','RESEARCHER','REVIEWER')),
  state text not null check(state in ('ACTIVE','INACTIVE')),
  valid_from timestamptz not null,
  valid_to timestamptz,
  granted_by_user_id uuid not null references public.user_account(id),
  grant_reason_code text not null check(app_private.is_stable_code(grant_reason_code)),
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.user_account(id),
  revoke_reason_code text check(revoke_reason_code is null or app_private.is_stable_code(revoke_reason_code)),
  version_no bigint not null default 1 check(version_no>0),
  check(valid_to is null or valid_to>valid_from),
  check((revoked_at is null)=(revoked_by_user_id is null))
);
create unique index project_member_active_unique on public.project_member(project_id,user_id,project_role_id)
  where state='ACTIVE' and revoked_at is null;

create table public.project_product (
  project_id uuid not null references public.project(id),
  product_id uuid not null references public.product(id),
  relationship_type text not null check(relationship_type in ('PRIMARY','RELATED','PROTOTYPE_TARGET')),
  valid_from date not null,
  valid_until date,
  linked_by_user_id uuid not null references public.user_account(id),
  linked_at timestamptz not null,
  primary key(project_id,product_id,relationship_type),
  check(valid_until is null or valid_until>=valid_from)
);

comment on table public.project_product is
  'M06 typed Product link. M11 creates project_rnd_program only after the real rnd_program FK target exists; no placeholder UUID is accepted here.';

create table public.project_vendor_grant (
  id uuid primary key,
  project_id uuid not null references public.project(id),
  vendor_user_id uuid not null references public.vendor_user(id),
  status text not null check(status in ('ACTIVE','REVOKED')),
  valid_from timestamptz not null,
  valid_until timestamptz,
  granted_by_user_id uuid not null references public.user_account(id),
  grant_reason_code text not null check(app_private.is_stable_code(grant_reason_code)),
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.user_account(id),
  revoke_reason_code text check(revoke_reason_code is null or app_private.is_stable_code(revoke_reason_code)),
  version_no bigint not null default 1 check(version_no>0),
  check(valid_until is null or valid_until>valid_from),
  check((revoked_at is null)=(revoked_by_user_id is null))
);

create table public.project_vendor_grant_action (
  grant_id uuid not null references public.project_vendor_grant(id),
  permission_id uuid not null references public.permission(id),
  primary key(grant_id,permission_id)
);
create index project_vendor_grant_active_idx on public.project_vendor_grant(project_id,vendor_user_id,valid_from,valid_until)
  where status='ACTIVE' and revoked_at is null;

create table public.wbs_node (
  id uuid primary key,
  project_id uuid not null references public.project(id),
  parent_id uuid,
  node_code text not null,
  node_kind text not null check(node_kind in ('PROJECT','MILESTONE','TASK','GROUP')),
  title text not null check(length(title) between 1 and 300),
  owner_user_id uuid references public.user_account(id),
  assignee_user_id uuid references public.user_account(id),
  assigned_vendor_id uuid references public.vendor(id),
  assigned_vendor_user_id uuid references public.vendor_user(id),
  planned_start date,
  planned_end date,
  sort_order integer not null check(sort_order>=0),
  progress_percent numeric(5,2) not null default 0 check(progress_percent between 0 and 100),
  state text not null check(state in ('BACKLOG','READY','IN_PROGRESS','BLOCKED','REVIEW_REQUIRED','DONE','CANCELLED')),
  version_no bigint not null default 1 check(version_no>0),
  created_by_user_id uuid not null references public.user_account(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(id,project_id),
  unique(project_id,node_code),
  foreign key(parent_id,project_id) references public.wbs_node(id,project_id),
  check(planned_end is null or planned_start is null or planned_end>=planned_start),
  check(not(assignee_user_id is not null and assigned_vendor_id is not null))
);
create index wbs_node_tree_idx on public.wbs_node(project_id,parent_id,sort_order,id);

create table public.research_project_application (
  id uuid primary key,
  project_id uuid not null unique references public.project(id),
  applicant_user_id uuid not null references public.user_account(id),
  current_version_id uuid not null,
  current_version_no bigint not null check(current_version_no>0),
  version_no bigint not null default 1 check(version_no>0),
  created_at timestamptz not null
);

create table public.research_project_application_version (
  id uuid primary key,
  application_id uuid not null references public.research_project_application(id),
  project_id uuid not null references public.project(id),
  version_no bigint not null check(version_no>0),
  prior_version_id uuid unique,
  purpose text not null check(length(purpose) between 1 and 4000),
  research_method text not null check(length(research_method) between 1 and 8000),
  research_start date not null,
  research_end date not null,
  budget_amount numeric(20,2) not null check(budget_amount>=0),
  budget_currency char(3) not null check(budget_currency ~ '^[A-Z]{3}$'),
  expected_outputs text not null check(length(expected_outputs) between 1 and 8000),
  allowance_applicable boolean not null,
  security_plan text not null check(length(security_plan) between 1 and 4000),
  safety_plan text not null check(length(safety_plan) between 1 and 4000),
  state text not null check(state in ('APPLICATION_DRAFT','DIRECTOR_REVIEW_PENDING','APPROVED','RETURNED','REJECTED')),
  sealed_snapshot_checksum text check(sealed_snapshot_checksum is null or app_private.is_sha256(sealed_snapshot_checksum)),
  sealed_at timestamptz,
  approval_instance_id uuid unique references public.approval_instance(id),
  row_version bigint not null default 1 check(row_version>0),
  created_by_user_id uuid not null references public.user_account(id),
  created_at timestamptz not null,
  unique(application_id,version_no),
  unique(id,application_id,project_id,version_no),
  unique(id,application_id,project_id,version_no,sealed_snapshot_checksum,sealed_at),
  foreign key(prior_version_id) references public.research_project_application_version(id),
  check(research_end>=research_start),
  check((sealed_snapshot_checksum is null)=(sealed_at is null)),
  check((state='APPLICATION_DRAFT' and approval_instance_id is null) or (state<>'APPLICATION_DRAFT' and approval_instance_id is not null))
);
alter table public.research_project_application add constraint research_application_head_fk
  foreign key(current_version_id,id,project_id,current_version_no)
  references public.research_project_application_version(id,application_id,project_id,version_no)
  deferrable initially deferred;

create table public.research_project_application_member (
  application_version_id uuid not null references public.research_project_application_version(id),
  user_id uuid not null references public.user_account(id),
  member_role text not null check(member_role in ('RESEARCH_LEAD','RESEARCHER','REVIEW_SUPPORT')),
  allocation_percent numeric(5,2) not null check(allocation_percent>0 and allocation_percent<=100),
  primary key(application_version_id,user_id,member_role)
);

create table public.research_project_application_output (
  application_version_id uuid not null references public.research_project_application_version(id),
  output_id uuid not null,
  output_type_id text not null check(app_private.is_stable_code(output_type_id)),
  title text not null check(length(title) between 1 and 500),
  primary key(application_version_id,output_id)
);

alter table public.attachment add constraint attachment_research_evidence_exact_unique unique(id,detected_sha256,detected_mime_type);

create table public.research_project_application_evidence (
  application_version_id uuid not null references public.research_project_application_version(id),
  attachment_id uuid not null,
  attachment_sha256 text not null check(app_private.is_sha256(attachment_sha256)),
  attachment_mime_type text not null,
  evidence_role text not null check(app_private.is_stable_code(evidence_role)),
  primary key(application_version_id,attachment_id,evidence_role),
  foreign key(attachment_id,attachment_sha256,attachment_mime_type)
    references public.attachment(id,detected_sha256,detected_mime_type)
);

create table public.research_project_designation (
  id uuid primary key,
  project_id uuid not null references public.project(id),
  application_version_id uuid not null unique references public.research_project_application_version(id),
  application_revision_no bigint not null check(application_revision_no>0),
  approval_instance_id uuid not null unique references public.approval_instance(id),
  approval_version bigint not null check(approval_version>0),
  application_checksum text not null check(app_private.is_sha256(application_checksum)),
  consented_by_user_id uuid not null references public.user_account(id),
  consented_at timestamptz not null,
  valid_from date not null,
  valid_until date,
  state text not null check(state in ('APPROVED','SUSPENDED','REVOKED','EXPIRED')),
  version_no bigint not null default 1 check(version_no>0),
  unique(application_version_id,application_revision_no,approval_instance_id,approval_version,application_checksum),
  check(valid_until is null or valid_until>=valid_from)
);
create unique index research_project_active_designation_unique on public.research_project_designation(project_id)
  where state='APPROVED';

alter table public.approval_subject_binding drop constraint approval_subject_binding_subject_kind_check;
alter table public.approval_subject_binding add constraint approval_subject_binding_subject_kind_check
  check(subject_kind in ('APPROVAL_POLICY_VERSION','DOCUMENT_VERSION','RESEARCH_PROJECT_APPLICATION'));

create table public.approval_subject_research_project_application (
  instance_id uuid primary key references public.approval_instance(id),
  subject_kind text not null default 'RESEARCH_PROJECT_APPLICATION' check(subject_kind='RESEARCH_PROJECT_APPLICATION'),
  application_version_id uuid not null,
  application_id uuid not null,
  project_id uuid not null,
  subject_version_no bigint not null check(subject_version_no>0),
  subject_checksum text not null check(app_private.is_sha256(subject_checksum)),
  subject_sealed_at timestamptz not null,
  unique(application_version_id,instance_id),
  unique(instance_id,application_version_id,subject_checksum),
  unique(instance_id,application_version_id,subject_version_no,subject_checksum),
  foreign key(instance_id,subject_kind) references public.approval_subject_binding(instance_id,subject_kind) deferrable initially deferred,
  foreign key(application_version_id,application_id,project_id,subject_version_no,subject_checksum,subject_sealed_at)
    references public.research_project_application_version(id,application_id,project_id,version_no,sealed_snapshot_checksum,sealed_at)
);

create trigger approval_research_project_subject_bind before insert on public.approval_subject_research_project_application
  for each row execute function app_private.bind_approval_subject();

create or replace function app_private.assert_exactly_one_approval_subject()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare target_instance uuid:=coalesce(new.instance_id,old.instance_id); subject_count integer; begin
  select (select count(*) from public.approval_subject_policy_version p where p.instance_id=target_instance)
    +(select count(*) from public.approval_subject_document_version d where d.instance_id=target_instance)
    +(select count(*) from public.approval_subject_research_project_application r where r.instance_id=target_instance) into subject_count;
  if subject_count<>1 then raise exception 'approval instance requires exactly one typed subject' using errcode='23514'; end if;
  return coalesce(new,old);
end $$;

create or replace function app_private.approval_subject_snapshot(target_instance_id uuid)
returns table(subject_kind text,subject_version_id uuid,subject_version_no bigint,subject_checksum text,subject_state text)
language sql stable security definer set search_path=pg_catalog,public
as $$
  select 'APPROVAL_POLICY_VERSION',l.subject_policy_version_id,l.subject_version_no,l.subject_checksum,v.state
  from public.approval_subject_policy_version l join public.approval_policy_version v on v.id=l.subject_policy_version_id
  where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.checksum=l.subject_checksum
  union all
  select 'DOCUMENT_VERSION',l.document_version_id,l.subject_version_no,l.subject_checksum,v.state
  from public.approval_subject_document_version l join public.document_version v on v.id=l.document_version_id and v.document_id=l.document_id
  where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.sealed_snapshot_checksum=l.subject_checksum
  union all
  select 'RESEARCH_PROJECT_APPLICATION',l.application_version_id,l.subject_version_no,l.subject_checksum,
    case when v.state='APPLICATION_DRAFT' and v.sealed_at is not null then 'SEALED' else v.state end
  from public.approval_subject_research_project_application l
  join public.research_project_application_version v on v.id=l.application_version_id and v.application_id=l.application_id and v.project_id=l.project_id
  where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.sealed_snapshot_checksum=l.subject_checksum and v.sealed_at=l.subject_sealed_at
$$;

create or replace function app_private.m06_assert_direct_internal(target_occurred_at timestamptz)
returns void language plpgsql stable security definer set search_path=pg_catalog,public,app_private
as $$ begin
  if target_occurred_at is distinct from app_private.request_time()
    or app_private.required_setting('app.actor_kind')<>'USER'
    or app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id()
    or app_private.current_acting_authority_id() is not null
    or not exists(select 1 from public.user_account u where u.id=app_private.current_actor_user_id()
      and u.account_kind='INTERNAL' and u.status='ACTIVE' and u.valid_from<=target_occurred_at
      and (u.valid_until is null or u.valid_until>target_occurred_at)) then
    raise exception 'active direct internal actor required' using errcode='42501';
  end if;
end $$;

create or replace function app_private.actor_has_project_internal_scope(target_project_id uuid,target_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select exists(select 1 from public.user_account u where u.id=app_private.current_actor_user_id() and u.account_kind='INTERNAL'
    and u.status='ACTIVE' and u.valid_from<=target_time and (u.valid_until is null or u.valid_until>target_time))
  and exists(select 1 from public.project p where p.id=target_project_id and (
    p.owner_user_id=app_private.current_effective_actor_user_id() or exists(select 1 from public.project_member m
      where m.project_id=p.id and m.user_id=app_private.current_effective_actor_user_id() and m.state='ACTIVE'
        and m.revoked_at is null and m.valid_from<=target_time and (m.valid_to is null or m.valid_to>target_time))))
$$;

create or replace function app_private.actor_can_edit_project(target_project_id uuid,target_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select app_private.actor_has_project_internal_scope(target_project_id,target_time) and exists(
    select 1 from public.project p where p.id=target_project_id and (p.owner_user_id=app_private.current_effective_actor_user_id()
      or exists(select 1 from public.project_member m where m.project_id=p.id and m.user_id=app_private.current_effective_actor_user_id()
        and m.project_role_id in ('OWNER','PROJECT_MANAGER') and m.state='ACTIVE' and m.revoked_at is null
        and m.valid_from<=target_time and (m.valid_to is null or m.valid_to>target_time))))
$$;

create or replace function app_private.actor_is_lab_director(target_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select exists(select 1 from public.user_account u join public.user_position_assignment a on a.user_id=u.id
    join public.position p on p.id=a.position_id and p.stable_code='POSITION_LAB_DIRECTOR' and p.status='ACTIVE'
    where u.id=app_private.current_effective_actor_user_id() and u.account_kind='INTERNAL' and u.status='ACTIVE'
      and u.valid_from<=target_time and (u.valid_until is null or u.valid_until>target_time)
      and a.is_primary and a.revoked_at is null and a.valid_from<=target_time and (a.valid_until is null or a.valid_until>target_time))
$$;

create or replace function app_private.actor_has_project_vendor_scope(target_project_id uuid,target_action text,target_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select exists(
    select 1 from public.project_vendor_grant g
    join public.vendor_user vu on vu.id=g.vendor_user_id and vu.status='ACTIVE' and vu.revoked_at is null
      and vu.valid_from<=target_time and (vu.valid_until is null or vu.valid_until>target_time)
    join public.vendor v on v.id=vu.vendor_id and v.status='ACTIVE'
    join public.user_account u on u.id=vu.user_id and u.account_kind='VENDOR' and u.status='ACTIVE'
      and u.valid_from<=target_time and (u.valid_until is null or u.valid_until>target_time)
    join public.project_vendor_grant_action ga on ga.grant_id=g.id
    join public.permission permission on permission.id=ga.permission_id and permission.status='ACTIVE' and permission.stable_code=target_action
    where g.project_id=target_project_id and vu.user_id=app_private.current_actor_user_id()
      and g.status='ACTIVE' and g.revoked_at is null and g.valid_from<=target_time and (g.valid_until is null or g.valid_until>target_time)
  )
$$;

create or replace function app_private.append_m06_transition(
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_action text,target_aggregate_type text,
  target_aggregate_id uuid,target_machine text,target_event text,target_outbox_event text,target_from_state text,target_to_state text,
  target_from_version bigint,target_to_version bigint,target_reason text,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare evidence_reason text:=coalesce(target_reason,target_event); schema_id text; begin
  schema_id:=case target_aggregate_type when 'PROJECT' then 'PROJECT_EVENT_REF' when 'WBS_NODE' then 'WBS_EVENT_REF' else 'RESEARCH_PROJECT_EVENT_REF' end;
  perform app_private.append_audit(target_audit_id,target_action,target_aggregate_type,target_aggregate_id,target_to_version,'SUCCEEDED',
    evidence_reason,null,null,null,null,target_occurred_at);
  perform app_private.append_state_transition(target_transition_id,target_audit_id,target_aggregate_type,target_aggregate_id,target_machine,target_event,
    target_from_state,target_to_state,target_from_version,target_to_version,evidence_reason,null,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),target_occurred_at);
  perform app_private.enqueue_outbox(target_outbox_id,target_audit_id,target_outbox_event,target_aggregate_type,target_aggregate_id,target_to_version,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),schema_id,1,
    jsonb_build_object('aggregateId',target_aggregate_id,'resourceVersion',target_to_version,'state',target_to_state),
    lower(target_aggregate_type)||':'||target_aggregate_id::text||':'||target_to_version::text,target_occurred_at,target_occurred_at);
end $$;

create or replace function app_private.enforce_project_member_internal()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  if not exists(select 1 from public.user_account u where u.id=new.user_id and u.account_kind='INTERNAL') then
    raise exception 'ProjectMember requires INTERNAL account' using errcode='23514';
  end if;
  return new;
end $$;
create trigger project_member_internal_guard before insert or update on public.project_member
  for each row execute function app_private.enforce_project_member_internal();

create or replace function app_private.enforce_project_owner_internal()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  if not exists(select 1 from public.user_account u where u.id=new.owner_user_id and u.account_kind='INTERNAL' and u.status='ACTIVE'
    and u.valid_from<=new.created_at and (u.valid_until is null or u.valid_until>new.created_at)) then
    raise exception 'Project owner must be active INTERNAL at creation' using errcode='23514';
  end if;
  return new;
end $$;
create trigger project_owner_internal_guard before insert or update of owner_user_id on public.project
  for each row execute function app_private.enforce_project_owner_internal();

create or replace function app_private.enforce_wbs_assignment_kind()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  if new.assignee_user_id is not null and not exists(select 1 from public.user_account u where u.id=new.assignee_user_id and u.account_kind='INTERNAL') then
    raise exception 'WBS user assignee must be INTERNAL' using errcode='23514';
  end if;
  if new.assigned_vendor_user_id is not null and not exists(select 1 from public.vendor_user vu where vu.id=new.assigned_vendor_user_id
    and vu.vendor_id=new.assigned_vendor_id) then raise exception 'WBS Vendor assignment must match exact VendorMembership' using errcode='23514'; end if;
  if (new.assigned_vendor_id is null)<>(new.assigned_vendor_user_id is null) then
    raise exception 'WBS Vendor and VendorMembership assignment must be paired' using errcode='23514';
  end if;
  return new;
end $$;
create trigger wbs_assignment_kind_guard before insert or update of assignee_user_id,assigned_vendor_id,assigned_vendor_user_id on public.wbs_node
  for each row execute function app_private.enforce_wbs_assignment_kind();

create or replace function app_private.guard_wbs_tree()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  if new.parent_id is null then return new; end if;
  if new.parent_id=new.id then raise exception 'WBS node cannot parent itself' using errcode='23514'; end if;
  if exists(with recursive ancestors(id,parent_id) as (
      select w.id,w.parent_id from public.wbs_node w where w.id=new.parent_id and w.project_id=new.project_id
      union all select w.id,w.parent_id from public.wbs_node w join ancestors a on w.id=a.parent_id where w.project_id=new.project_id)
    select 1 from ancestors where id=new.id) then raise exception 'WBS hierarchy cycle denied' using errcode='23514'; end if;
  return new;
end $$;
create trigger wbs_tree_guard before insert or update of parent_id,project_id on public.wbs_node
  for each row execute function app_private.guard_wbs_tree();

create or replace function app_private.protect_research_application_version()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$ begin
  if tg_op='DELETE' then raise exception 'research project application versions are immutable evidence' using errcode='55000'; end if;
  if old.sealed_at is not null then
    if app_private.optional_setting('app.research_application_transition') is null
      or new.id<>old.id or new.application_id<>old.application_id or new.project_id<>old.project_id or new.version_no<>old.version_no
      or new.prior_version_id is distinct from old.prior_version_id or new.purpose<>old.purpose or new.research_method<>old.research_method
      or new.research_start<>old.research_start or new.research_end<>old.research_end or new.budget_amount<>old.budget_amount
      or new.budget_currency<>old.budget_currency or new.expected_outputs<>old.expected_outputs
      or new.allowance_applicable<>old.allowance_applicable or new.security_plan<>old.security_plan or new.safety_plan<>old.safety_plan
      or new.sealed_snapshot_checksum<>old.sealed_snapshot_checksum or new.sealed_at<>old.sealed_at
      or new.created_by_user_id<>old.created_by_user_id or new.created_at<>old.created_at or new.row_version<>old.row_version+1 then
      raise exception 'sealed research project application snapshot is immutable' using errcode='55000';
    end if;
  end if;
  return new;
end $$;
create trigger research_application_version_immutable before update or delete on public.research_project_application_version
  for each row execute function app_private.protect_research_application_version();

create or replace function app_private.protect_research_application_members()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare target_version uuid:=coalesce(new.application_version_id,old.application_version_id); begin
  if exists(select 1 from public.research_project_application_version v where v.id=target_version and v.sealed_at is not null) then
    raise exception 'sealed research team snapshot is immutable' using errcode='55000';
  end if;
  return coalesce(new,old);
end $$;
create trigger research_application_member_immutable before insert or update or delete on public.research_project_application_member
  for each row execute function app_private.protect_research_application_members();
create trigger research_application_output_immutable before insert or update or delete on public.research_project_application_output
  for each row execute function app_private.protect_research_application_members();
create trigger research_application_evidence_immutable before insert or update or delete on public.research_project_application_evidence
  for each row execute function app_private.protect_research_application_members();

create or replace function app_private.protect_research_subject_link()
returns trigger language plpgsql set search_path=pg_catalog
as $$ begin raise exception 'research project approval subject is append-only' using errcode='55000'; end $$;
create trigger approval_research_subject_immutable before update or delete on public.approval_subject_research_project_application
  for each row execute function app_private.protect_research_subject_link();

create or replace function app_private.guard_research_subject_active()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  perform pg_advisory_xact_lock(hashtextextended(new.application_version_id::text,0));
  if exists(select 1 from public.approval_subject_research_project_application l join public.approval_instance i on i.id=l.instance_id
    where l.application_version_id=new.application_version_id and i.state not in ('REJECTED','RECALLED','CANCELLED')) then
    raise exception 'exact research application version already has an active approval generation' using errcode='23505';
  end if;
  return new;
end $$;
create trigger approval_research_subject_active_guard before insert on public.approval_subject_research_project_application
  for each row execute function app_private.guard_research_subject_active();

create or replace function app_private.protect_designation_identity()
returns trigger language plpgsql set search_path=pg_catalog
as $$ begin raise exception 'research project designation is immutable insert-only evidence' using errcode='55000'; end $$;
create trigger research_designation_identity_immutable before update or delete on public.research_project_designation
  for each row execute function app_private.protect_designation_identity();

alter table public.research_project_designation add constraint research_designation_exact_subject_fk
  foreign key(approval_instance_id,application_version_id,application_revision_no,application_checksum)
  references public.approval_subject_research_project_application(instance_id,application_version_id,subject_version_no,subject_checksum);
alter table public.approval_instance add constraint approval_instance_terminal_version_unique unique(id,version_no);
alter table public.research_project_designation add constraint research_designation_exact_approval_fk
  foreign key(approval_instance_id,approval_version) references public.approval_instance(id,version_no);

create or replace function public.create_product(
  target_product_id uuid,target_product_code text,target_display_name text,target_audit_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.m06_assert_direct_internal(target_occurred_at);
  insert into public.product(id,product_code,name,state,version_no,created_by_user_id,created_at)
    values(target_product_id,target_product_code,target_display_name,'ACTIVE',1,app_private.current_effective_actor_user_id(),target_occurred_at);
  perform app_private.append_audit(target_audit_id,'product.record.create','PRODUCT',target_product_id,1,'SUCCEEDED',
    'PRODUCT_CREATED',null,null,null,null,target_occurred_at);
  return 1;
end $$;

create or replace function public.create_project(
  target_project_id uuid,target_project_code text,target_display_name text,target_organization_id uuid,target_objective text,
  target_planned_start date,target_planned_end date,target_visibility text,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.m06_assert_direct_internal(target_occurred_at);
  if not exists(select 1 from public.organization o join public.user_organization_assignment a on a.organization_id=o.id
    where o.id=target_organization_id and o.status='ACTIVE' and a.user_id=app_private.current_effective_actor_user_id()
      and a.revoked_at is null and a.valid_from<=target_occurred_at and (a.valid_until is null or a.valid_until>target_occurred_at)) then
    raise exception 'active organization assignment required' using errcode='42501';
  end if;
  insert into public.project(id,project_code,name,organization_id,owner_user_id,objective,period_start,period_end,visibility_code,state,version_no,created_at,updated_at)
    values(target_project_id,target_project_code,target_display_name,target_organization_id,app_private.current_effective_actor_user_id(),target_objective,
      target_planned_start,target_planned_end,target_visibility,'DRAFT',1,target_occurred_at,target_occurred_at);
  insert into public.project_member(id,project_id,user_id,project_role_id,state,valid_from,granted_by_user_id,grant_reason_code,version_no)
    values(extensions.gen_random_uuid(),target_project_id,app_private.current_effective_actor_user_id(),'OWNER','ACTIVE',target_occurred_at,
      app_private.current_effective_actor_user_id(),'PROJECT_CREATOR_OWNER',1);
  perform app_private.append_m06_transition(target_audit_id,target_transition_id,target_outbox_id,'project.record.create','PROJECT',target_project_id,
    'SM-PROJECT-V1','EVT-PROJECT-CREATE','EVT-PROJECT-CREATED',null,'DRAFT',0,1,null,target_occurred_at);
  return 1;
end $$;

create or replace function public.transition_project(
  target_project_id uuid,target_event text,target_expected_version bigint,target_reason_code text,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare project_row public.project%rowtype; target_state text; action_id text; outbox_id text; next_version bigint; begin
  perform app_private.m06_assert_direct_internal(target_occurred_at);
  select * into strict project_row from public.project where id=target_project_id for update;
  next_version:=app_private.next_version(project_row.version_no,target_expected_version);
  if target_event='EVT-PROJECT-PLAN' and project_row.state='DRAFT' then target_state:='PLANNED'; action_id:='project.record.plan'; outbox_id:='EVT-PROJECT-PLANNED';
  elsif target_event='EVT-PROJECT-START' and project_row.state='PLANNED' then target_state:='ACTIVE'; action_id:='project.record.start'; outbox_id:='EVT-PROJECT-STARTED';
  elsif target_event='EVT-PROJECT-HOLD' and project_row.state='ACTIVE' and target_reason_code is not null then target_state:='ON_HOLD'; action_id:='project.record.hold'; outbox_id:='EVT-PROJECT-HELD';
  elsif target_event='EVT-PROJECT-RESUME' and project_row.state='ON_HOLD' and target_reason_code is not null then target_state:='ACTIVE'; action_id:='project.record.resume'; outbox_id:='EVT-PROJECT-RESUMED';
  elsif target_event='EVT-PROJECT-CANCEL' and project_row.state in ('DRAFT','PLANNED','ACTIVE','ON_HOLD') and target_reason_code is not null
    and app_private.actor_is_lab_director(target_occurred_at) then target_state:='CANCELLED'; action_id:='project.record.cancel'; outbox_id:='EVT-PROJECT-CANCELLED';
  else raise exception 'unsupported, disabled, or invalid Project transition' using errcode='23514'; end if;
  if not app_private.actor_can_edit_project(target_project_id,target_occurred_at) and not app_private.actor_is_lab_director(target_occurred_at) then
    raise exception 'Project transition scope denied' using errcode='42501';
  end if;
  update public.project set state=target_state,version_no=next_version,updated_at=target_occurred_at where id=target_project_id;
  perform app_private.append_m06_transition(target_audit_id,target_transition_id,target_outbox_id,action_id,'PROJECT',target_project_id,
    'SM-PROJECT-V1',target_event,outbox_id,project_row.state,target_state,project_row.version_no,next_version,target_reason_code,target_occurred_at);
  return next_version;
end $$;

create or replace function public.assign_project_member(
  target_member_id uuid,target_project_id uuid,target_user_id uuid,target_member_role text,target_valid_from timestamptz,
  target_valid_until timestamptz,target_reason_code text,target_audit_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.m06_assert_direct_internal(target_occurred_at);
  if not app_private.actor_can_edit_project(target_project_id,target_occurred_at) then raise exception 'Project member assignment denied' using errcode='42501'; end if;
  insert into public.project_member(id,project_id,user_id,project_role_id,state,valid_from,valid_to,granted_by_user_id,grant_reason_code,version_no)
    values(target_member_id,target_project_id,target_user_id,target_member_role,'ACTIVE',target_valid_from,target_valid_until,
      app_private.current_effective_actor_user_id(),target_reason_code,1);
  perform app_private.append_audit(target_audit_id,'project.member.assign','PROJECT_MEMBER',target_member_id,1,'SUCCEEDED',
    target_reason_code,null,null,null,null,target_occurred_at);
  return 1;
end $$;

create or replace function public.link_project_product(
  target_project_id uuid,target_product_id uuid,target_relationship_type text,target_valid_from date,target_valid_until date,
  target_audit_id uuid,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.m06_assert_direct_internal(target_occurred_at);
  if not app_private.actor_can_edit_project(target_project_id,target_occurred_at) then raise exception 'Project Product link denied' using errcode='42501'; end if;
  insert into public.project_product(project_id,product_id,relationship_type,valid_from,valid_until,linked_by_user_id,linked_at)
    values(target_project_id,target_product_id,target_relationship_type,target_valid_from,target_valid_until,app_private.current_effective_actor_user_id(),target_occurred_at);
  perform app_private.append_audit(target_audit_id,'project.product.link','PROJECT',target_project_id,
    (select version_no from public.project where id=target_project_id),'SUCCEEDED','PROJECT_PRODUCT_LINKED',target_product_id,null,null,null,target_occurred_at);
end $$;

create or replace function public.grant_project_vendor_scope(
  target_grant_id uuid,target_project_id uuid,target_vendor_user_id uuid,target_permission_code text,target_valid_from timestamptz,
  target_valid_until timestamptz,target_reason_code text,target_audit_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare permission_row uuid; begin
  perform app_private.m06_assert_direct_internal(target_occurred_at);
  if not app_private.actor_can_edit_project(target_project_id,target_occurred_at) then raise exception 'Project Vendor grant denied' using errcode='42501'; end if;
  if target_permission_code not in ('project.summary.read','project.wbs.read','project.wbs.update') then raise exception 'unsupported Project Vendor action' using errcode='23514'; end if;
  select p.id into strict permission_row from public.permission p where p.stable_code=target_permission_code and p.status='ACTIVE';
  if not exists(select 1 from public.vendor_user vu join public.vendor v on v.id=vu.vendor_id and v.status='ACTIVE'
    join public.user_account u on u.id=vu.user_id and u.account_kind='VENDOR' and u.status='ACTIVE'
    where vu.id=target_vendor_user_id and vu.status='ACTIVE' and vu.revoked_at is null
      and vu.valid_from<=target_occurred_at and (vu.valid_until is null or vu.valid_until>target_occurred_at)) then
    raise exception 'active exact VendorMembership required' using errcode='42501';
  end if;
  insert into public.project_vendor_grant(id,project_id,vendor_user_id,status,valid_from,valid_until,granted_by_user_id,grant_reason_code,version_no)
    values(target_grant_id,target_project_id,target_vendor_user_id,'ACTIVE',target_valid_from,target_valid_until,
      app_private.current_effective_actor_user_id(),target_reason_code,1);
  insert into public.project_vendor_grant_action(grant_id,permission_id) values(target_grant_id,permission_row);
  perform app_private.append_audit(target_audit_id,'project.vendor_scope.grant','PROJECT_VENDOR_GRANT',target_grant_id,1,'SUCCEEDED',
    target_reason_code,target_project_id,null,null,null,target_occurred_at);
  return 1;
end $$;

create or replace function public.revoke_project_vendor_scope(
  target_grant_id uuid,target_expected_version bigint,target_reason_code text,target_audit_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare grant_row public.project_vendor_grant%rowtype; next_version bigint; begin
  perform app_private.m06_assert_direct_internal(target_occurred_at);
  select * into strict grant_row from public.project_vendor_grant where id=target_grant_id for update;
  if not app_private.actor_can_edit_project(grant_row.project_id,target_occurred_at) or grant_row.status<>'ACTIVE' then raise exception 'Project Vendor revoke denied' using errcode='42501'; end if;
  next_version:=app_private.next_version(grant_row.version_no,target_expected_version);
  update public.project_vendor_grant set status='REVOKED',revoked_at=target_occurred_at,revoked_by_user_id=app_private.current_effective_actor_user_id(),
    revoke_reason_code=target_reason_code,version_no=next_version where id=target_grant_id;
  perform app_private.append_audit(target_audit_id,'project.vendor_scope.revoke','PROJECT_VENDOR_GRANT',target_grant_id,next_version,'SUCCEEDED',
    target_reason_code,grant_row.project_id,null,null,null,target_occurred_at);
  return next_version;
end $$;

create or replace function public.read_project_vendor_summary(target_project_id uuid,target_occurred_at timestamptz)
returns table(project_id uuid,project_code text,name text,state text,period_start date,period_end date)
language plpgsql stable security definer set search_path=pg_catalog,public,app_private
as $$ begin
  if target_occurred_at is distinct from app_private.request_time() or not app_private.actor_has_project_vendor_scope(target_project_id,'project.summary.read',target_occurred_at) then
    return;
  end if;
  return query select p.id,p.project_code,p.name,p.state,p.period_start,p.period_end from public.project p where p.id=target_project_id;
end $$;

create or replace function public.create_wbs_node(
  target_node_id uuid,target_project_id uuid,target_parent_id uuid,target_node_code text,target_node_kind text,target_title text,
  target_owner_user_id uuid,target_vendor_user_id uuid,target_planned_start date,target_planned_end date,target_sort_order integer,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.m06_assert_direct_internal(target_occurred_at);
  if not app_private.actor_can_edit_project(target_project_id,target_occurred_at) then raise exception 'WBS create scope denied' using errcode='42501'; end if;
  if target_vendor_user_id is not null and not exists(select 1 from public.project_vendor_grant g
    join public.project_vendor_grant_action ga on ga.grant_id=g.id join public.permission p on p.id=ga.permission_id and p.stable_code='project.wbs.update' and p.status='ACTIVE'
    where g.project_id=target_project_id and g.vendor_user_id=target_vendor_user_id and g.status='ACTIVE' and g.revoked_at is null and g.valid_from<=target_occurred_at
    and (g.valid_until is null or g.valid_until>target_occurred_at)) then raise exception 'WBS Vendor assignment requires exact active Project grant' using errcode='42501'; end if;
  insert into public.wbs_node(id,project_id,parent_id,node_code,node_kind,title,owner_user_id,assignee_user_id,assigned_vendor_id,assigned_vendor_user_id,planned_start,planned_end,
    sort_order,progress_percent,state,version_no,created_by_user_id,created_at,updated_at)
  values(target_node_id,target_project_id,target_parent_id,target_node_code,target_node_kind,target_title,target_owner_user_id,
    case when target_vendor_user_id is null then target_owner_user_id end,
    (select vu.vendor_id from public.vendor_user vu where vu.id=target_vendor_user_id),target_vendor_user_id,
    target_planned_start,target_planned_end,target_sort_order,0,'BACKLOG',1,app_private.current_effective_actor_user_id(),target_occurred_at,target_occurred_at);
  perform app_private.append_m06_transition(target_audit_id,target_transition_id,target_outbox_id,'project.wbs.create','WBS_NODE',target_node_id,
    'SM-WBS-V1','EVT-WBS-CREATE','EVT-WBS-CREATED',null,'BACKLOG',0,1,null,target_occurred_at);
  return 1;
end $$;

create or replace function public.transition_wbs_node(
  target_node_id uuid,target_event text,target_expected_version bigint,target_progress_percent numeric,target_reason_code text,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare node_row public.wbs_node%rowtype; project_row public.project%rowtype; target_state text; next_version bigint; internal_editor boolean; vendor_editor boolean; begin
  if target_occurred_at is distinct from app_private.request_time() or app_private.required_setting('app.actor_kind')<>'USER'
    or app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id()
    or app_private.current_acting_authority_id() is not null or not app_private.actor_is_active(target_occurred_at) then
    raise exception 'active direct WBS actor and trusted request time required' using errcode='42501';
  end if;
  select * into strict node_row from public.wbs_node where id=target_node_id for update;
  select * into strict project_row from public.project where id=node_row.project_id for share;
  next_version:=app_private.next_version(node_row.version_no,target_expected_version);
  internal_editor:=app_private.actor_can_edit_project(node_row.project_id,target_occurred_at)
    or node_row.owner_user_id=app_private.current_effective_actor_user_id();
  vendor_editor:=node_row.assigned_vendor_user_id is not null and app_private.actor_has_project_vendor_scope(node_row.project_id,'project.wbs.update',target_occurred_at)
    and exists(select 1 from public.vendor_user vu where vu.id=node_row.assigned_vendor_user_id and vu.user_id=app_private.current_actor_user_id());
  if target_event='EVT-WBS-READY' and node_row.state='BACKLOG' and internal_editor then target_state:='READY';
  elsif target_event='EVT-WBS-START' and node_row.state='READY' and (internal_editor or vendor_editor) and project_row.state='ACTIVE' then target_state:='IN_PROGRESS';
  elsif target_event='EVT-WBS-BLOCK' and node_row.state='IN_PROGRESS' and (internal_editor or vendor_editor) and target_reason_code is not null then target_state:='BLOCKED';
  elsif target_event='EVT-WBS-UNBLOCK' and node_row.state='BLOCKED' and internal_editor and target_reason_code is not null then target_state:='IN_PROGRESS';
  elsif target_event='EVT-WBS-SUBMIT-REVIEW' and node_row.state='IN_PROGRESS' and (internal_editor or vendor_editor) then target_state:='REVIEW_REQUIRED';
  elsif target_event='EVT-WBS-ACCEPT' and node_row.state='REVIEW_REQUIRED' and internal_editor then target_state:='DONE';
  elsif target_event='EVT-WBS-REWORK' and node_row.state='REVIEW_REQUIRED' and internal_editor and target_reason_code is not null then target_state:='IN_PROGRESS';
  elsif target_event='EVT-WBS-CANCEL' and node_row.state not in ('DONE','CANCELLED') and internal_editor and target_reason_code is not null then target_state:='CANCELLED';
  else raise exception 'WBS transition denied or invalid' using errcode='42501'; end if;
  if target_state='DONE' and exists(select 1 from public.wbs_node child where child.parent_id=node_row.id and child.state not in ('DONE','CANCELLED')) then
    raise exception 'parent WBS cannot complete before children' using errcode='23514';
  end if;
  update public.wbs_node set state=target_state,progress_percent=case when target_state='DONE' then 100 else target_progress_percent end,
    version_no=next_version,updated_at=target_occurred_at where id=target_node_id;
  perform app_private.append_m06_transition(target_audit_id,target_transition_id,target_outbox_id,'project.wbs.update','WBS_NODE',target_node_id,
    'SM-WBS-V1',target_event,'EVT-WBS-UPDATED',node_row.state,target_state,node_row.version_no,next_version,target_reason_code,target_occurred_at);
  return next_version;
end $$;

create or replace function public.create_research_project_application(
  target_application_id uuid,target_version_id uuid,target_project_id uuid,target_purpose text,target_research_method text,
  target_research_start date,target_research_end date,target_budget_amount numeric,target_budget_currency char(3),target_expected_outputs text,
  target_allowance_applicable boolean,target_security_plan text,target_safety_plan text,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.m06_assert_direct_internal(target_occurred_at);
  if not app_private.actor_can_edit_project(target_project_id,target_occurred_at) then raise exception 'research Project application create denied' using errcode='42501'; end if;
  insert into public.research_project_application(id,project_id,applicant_user_id,current_version_id,current_version_no,version_no,created_at)
    values(target_application_id,target_project_id,app_private.current_effective_actor_user_id(),target_version_id,1,1,target_occurred_at);
  insert into public.research_project_application_version(id,application_id,project_id,version_no,purpose,research_method,research_start,research_end,
    budget_amount,budget_currency,expected_outputs,allowance_applicable,security_plan,safety_plan,state,row_version,created_by_user_id,created_at)
  values(target_version_id,target_application_id,target_project_id,1,target_purpose,target_research_method,target_research_start,target_research_end,
    target_budget_amount,target_budget_currency,target_expected_outputs,target_allowance_applicable,target_security_plan,target_safety_plan,
    'APPLICATION_DRAFT',1,app_private.current_effective_actor_user_id(),target_occurred_at);
  perform app_private.append_m06_transition(target_audit_id,target_transition_id,target_outbox_id,'project.research_designation.create',
    'RESEARCH_PROJECT_APPLICATION',target_version_id,'SM-RESEARCH-PROJECT-DESIGNATION-V1','EVT-RP-APPLICATION-CREATE',
    'EVT-RP-APPLICATION-CREATED',null,'APPLICATION_DRAFT',0,1,null,target_occurred_at);
  return 1;
end $$;

create or replace function public.add_research_project_application_member(
  target_application_version_id uuid,target_user_id uuid,target_member_role text,target_allocation_percent numeric,
  target_audit_id uuid,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare version_row public.research_project_application_version%rowtype; begin
  perform app_private.m06_assert_direct_internal(target_occurred_at);
  select * into strict version_row from public.research_project_application_version where id=target_application_version_id for update;
  if version_row.state<>'APPLICATION_DRAFT' or version_row.sealed_at is not null
    or not app_private.actor_can_edit_project(version_row.project_id,target_occurred_at) then raise exception 'research team snapshot mutation denied' using errcode='42501'; end if;
  if not exists(select 1 from public.user_account u where u.id=target_user_id and u.account_kind='INTERNAL' and u.status='ACTIVE'
    and u.valid_from<=target_occurred_at and (u.valid_until is null or u.valid_until>target_occurred_at)) then
    raise exception 'research team member must be active INTERNAL' using errcode='23514';
  end if;
  insert into public.research_project_application_member(application_version_id,user_id,member_role,allocation_percent)
    values(target_application_version_id,target_user_id,target_member_role,target_allocation_percent);
  perform app_private.append_audit(target_audit_id,'project.research_designation.create','RESEARCH_PROJECT_APPLICATION',
    target_application_version_id,version_row.row_version,'SUCCEEDED','RESEARCH_TEAM_MEMBER_ADDED',target_user_id,null,null,null,target_occurred_at);
end $$;

create or replace function public.add_research_project_application_output(
  target_application_version_id uuid,target_output_id uuid,target_output_type_id text,target_title text,
  target_audit_id uuid,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare version_row public.research_project_application_version%rowtype; begin
  perform app_private.m06_assert_direct_internal(target_occurred_at);
  select * into strict version_row from public.research_project_application_version where id=target_application_version_id for update;
  if version_row.state<>'APPLICATION_DRAFT' or version_row.sealed_at is not null
    or not app_private.actor_can_edit_project(version_row.project_id,target_occurred_at) then raise exception 'research output snapshot mutation denied' using errcode='42501'; end if;
  insert into public.research_project_application_output(application_version_id,output_id,output_type_id,title)
    values(target_application_version_id,target_output_id,target_output_type_id,target_title);
  perform app_private.append_audit(target_audit_id,'project.research_designation.create','RESEARCH_PROJECT_APPLICATION',
    target_application_version_id,version_row.row_version,'SUCCEEDED','RESEARCH-OUTPUT-ADDED',target_output_id,null,null,null,target_occurred_at);
end $$;

create or replace function public.add_research_project_application_evidence(
  target_application_version_id uuid,target_attachment_id uuid,target_evidence_role text,target_audit_id uuid,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare version_row public.research_project_application_version%rowtype; begin
  perform app_private.m06_assert_direct_internal(target_occurred_at);
  select * into strict version_row from public.research_project_application_version where id=target_application_version_id for update;
  if version_row.state<>'APPLICATION_DRAFT' or version_row.sealed_at is not null
    or not app_private.actor_can_edit_project(version_row.project_id,target_occurred_at)
    or not exists(select 1 from public.attachment a where a.id=target_attachment_id and a.state='AVAILABLE') then
    raise exception 'research evidence snapshot mutation denied' using errcode='42501';
  end if;
  insert into public.research_project_application_evidence(application_version_id,attachment_id,attachment_sha256,attachment_mime_type,evidence_role)
    select target_application_version_id,a.id,a.detected_sha256,a.detected_mime_type,target_evidence_role from public.attachment a
      where a.id=target_attachment_id and a.state='AVAILABLE';
  perform app_private.append_audit(target_audit_id,'project.research_designation.create','RESEARCH_PROJECT_APPLICATION',
    target_application_version_id,version_row.row_version,'SUCCEEDED','RESEARCH-EVIDENCE-ADDED',target_attachment_id,null,null,null,target_occurred_at);
end $$;

create or replace function public.create_research_project_application_revision(
  target_prior_version_id uuid,target_new_version_id uuid,target_new_version_no bigint,target_expected_application_version bigint,
  target_purpose text,target_research_method text,target_research_start date,target_research_end date,target_budget_amount numeric,
  target_budget_currency char(3),target_expected_outputs text,target_allowance_applicable boolean,target_security_plan text,target_safety_plan text,
  target_reason_code text,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare prior_row public.research_project_application_version%rowtype; application_row public.research_project_application%rowtype; begin
  perform app_private.m06_assert_direct_internal(target_occurred_at);
  select * into strict prior_row from public.research_project_application_version where id=target_prior_version_id for update;
  select * into strict application_row from public.research_project_application where id=prior_row.application_id for update;
  perform app_private.next_version(application_row.version_no,target_expected_application_version);
  if prior_row.state not in ('RETURNED','REJECTED') or target_new_version_no<>prior_row.version_no+1
    or application_row.current_version_id<>prior_row.id or not app_private.actor_can_edit_project(prior_row.project_id,target_occurred_at) then
    raise exception 'research application revision requires exact returned/rejected head' using errcode='23514';
  end if;
  insert into public.research_project_application_version(id,application_id,project_id,version_no,prior_version_id,purpose,research_method,
    research_start,research_end,budget_amount,budget_currency,expected_outputs,allowance_applicable,security_plan,safety_plan,state,row_version,created_by_user_id,created_at)
  values(target_new_version_id,prior_row.application_id,prior_row.project_id,target_new_version_no,prior_row.id,target_purpose,target_research_method,
    target_research_start,target_research_end,target_budget_amount,target_budget_currency,target_expected_outputs,target_allowance_applicable,
    target_security_plan,target_safety_plan,'APPLICATION_DRAFT',1,app_private.current_effective_actor_user_id(),target_occurred_at);
  update public.research_project_application set current_version_id=target_new_version_id,current_version_no=target_new_version_no,
    version_no=version_no+1 where id=prior_row.application_id;
  perform app_private.append_m06_transition(target_audit_id,target_transition_id,target_outbox_id,'project.research_designation.create',
    'RESEARCH_PROJECT_APPLICATION',target_new_version_id,'SM-RESEARCH-PROJECT-DESIGNATION-V1','EVT-RP-APPLICATION-CREATE',
    'EVT-RP-APPLICATION-CREATED',null,'APPLICATION_DRAFT',0,1,target_reason_code,target_occurred_at);
  return 1;
end $$;

create or replace function public.seal_research_project_application(
  target_version_id uuid,target_expected_version bigint,target_audit_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns text language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions
as $$ declare version_row public.research_project_application_version%rowtype; computed_checksum text; next_version bigint; begin
  perform app_private.m06_assert_direct_internal(target_occurred_at);
  select * into strict version_row from public.research_project_application_version where id=target_version_id for update;
  next_version:=app_private.next_version(version_row.row_version,target_expected_version);
  if version_row.state<>'APPLICATION_DRAFT' or version_row.sealed_at is not null
    or not app_private.actor_can_edit_project(version_row.project_id,target_occurred_at) then raise exception 'research application seal denied' using errcode='42501'; end if;
  if not exists(select 1 from public.research_project_application_member m where m.application_version_id=target_version_id and m.member_role='RESEARCH_LEAD') then
    raise exception 'sealed research application requires Research Lead' using errcode='23514';
  end if;
  if not exists(select 1 from public.research_project_application_output o where o.application_version_id=target_version_id) then
    raise exception 'sealed research application requires expected output' using errcode='23514';
  end if;
  select encode(extensions.digest(convert_to(concat_ws('|',version_row.id,version_row.application_id,version_row.project_id,version_row.version_no,
    version_row.purpose,version_row.research_method,version_row.research_start,version_row.research_end,version_row.budget_amount,
    version_row.budget_currency,version_row.expected_outputs,version_row.allowance_applicable,version_row.security_plan,version_row.safety_plan,
    coalesce((select string_agg(concat_ws(':',m.user_id,m.member_role,m.allocation_percent),'|' order by m.user_id,m.member_role)
      from public.research_project_application_member m where m.application_version_id=target_version_id),''),
    coalesce((select string_agg(concat_ws(':',o.output_id,o.output_type_id,o.title),'|' order by o.output_id)
      from public.research_project_application_output o where o.application_version_id=target_version_id),''),
    coalesce((select string_agg(concat_ws(':',e.attachment_id,e.attachment_sha256,e.attachment_mime_type,e.evidence_role),'|' order by e.attachment_id,e.evidence_role)
      from public.research_project_application_evidence e where e.application_version_id=target_version_id),'')),'UTF8'),'sha256'),'hex') into computed_checksum;
  update public.research_project_application_version set sealed_snapshot_checksum=computed_checksum,sealed_at=target_occurred_at,row_version=next_version where id=target_version_id;
  perform app_private.append_audit(target_audit_id,'project.research_designation.seal','RESEARCH_PROJECT_APPLICATION',target_version_id,next_version,
    'SUCCEEDED','RESEARCH_APPLICATION_SEALED',null,null,computed_checksum,null,target_occurred_at);
  perform app_private.enqueue_outbox(target_outbox_id,target_audit_id,'EVT-RP-APPLICATION-SEALED','RESEARCH_PROJECT_APPLICATION',target_version_id,next_version,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),'RESEARCH_PROJECT_EVENT_REF',1,
    jsonb_build_object('applicationVersionId',target_version_id,'resourceVersion',next_version,'state','APPLICATION_DRAFT'),
    'research_application:'||target_version_id::text||':'||next_version::text,target_occurred_at,target_occurred_at);
  return computed_checksum;
end $$;

create or replace function public.create_research_project_approval_instance(
  target_instance_id uuid,target_policy_version_id uuid,target_policy_checksum text,target_application_version_id uuid,
  target_prior_instance_id uuid,target_generation bigint,target_action_record_id uuid,target_audit_id uuid,target_transition_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare policy_row public.approval_policy_version%rowtype; version_row public.research_project_application_version%rowtype; begin
  perform app_private.m06_assert_direct_internal(target_occurred_at);
  perform app_private.assert_approval_request(target_occurred_at,'approval.instance.submit');
  if not app_private.actor_has_permission('project.research_designation.submit',target_occurred_at) then raise exception 'designation submit permission required' using errcode='42501'; end if;
  select v.* into strict policy_row from public.approval_policy_version v join public.approval_policy p on p.id=v.policy_id
    where v.id=target_policy_version_id and p.status='ACTIVE' and v.state='PUBLISHED' and v.subject_kind='RESEARCH_PROJECT_APPLICATION'
      and v.checksum=target_policy_checksum and v.valid_from<=target_occurred_at and (v.valid_until is null or v.valid_until>target_occurred_at) for share;
  select * into strict version_row from public.research_project_application_version where id=target_application_version_id for update;
  if version_row.state<>'APPLICATION_DRAFT' or version_row.sealed_snapshot_checksum is null or version_row.sealed_at is null
    or not app_private.actor_can_edit_project(version_row.project_id,target_occurred_at) then raise exception 'exact sealed research application submission denied' using errcode='42501'; end if;
  if (target_prior_instance_id is null and target_generation<>1) or (target_prior_instance_id is not null and not exists(
    select 1 from public.approval_instance prior_instance join public.approval_subject_research_project_application prior_subject on prior_subject.instance_id=prior_instance.id
    where prior_instance.id=target_prior_instance_id and prior_instance.state in ('REJECTED','RECALLED') and prior_instance.generation+1=target_generation
      and prior_subject.application_id=version_row.application_id and prior_subject.application_version_id=version_row.prior_version_id
      and prior_subject.subject_version_no<version_row.version_no)) then raise exception 'invalid research application approval generation chain' using errcode='23514'; end if;
  insert into public.approval_instance(id,policy_version_id,policy_version_no,policy_checksum_snapshot,submitter_user_id,prior_instance_id,generation,state,version_no,created_at)
    values(target_instance_id,target_policy_version_id,policy_row.version_no,target_policy_checksum,app_private.current_effective_actor_user_id(),
      target_prior_instance_id,target_generation,'DRAFT',1,target_occurred_at);
  insert into public.approval_subject_research_project_application(instance_id,application_version_id,application_id,project_id,subject_version_no,subject_checksum,subject_sealed_at)
    values(target_instance_id,version_row.id,version_row.application_id,version_row.project_id,version_row.version_no,version_row.sealed_snapshot_checksum,version_row.sealed_at);
  perform app_private.append_approval_audit_transition(target_audit_id,target_transition_id,'approval.instance.create',target_instance_id,1,
    'EVT-APPROVAL-CREATE',null,'DRAFT','RESEARCH_PROJECT_APPLICATION',target_occurred_at);
  insert into public.approval_action(id,instance_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,occurred_at)
    values(target_action_record_id,target_instance_id,target_audit_id,'CREATE','USER',app_private.current_actor_user_id(),app_private.current_effective_actor_user_id(),target_occurred_at);
  return 1;
end $$;

create or replace function public.submit_research_project_approval_instance(
  target_instance_id uuid,target_expected_instance_version bigint,target_step_id uuid,target_participant_id uuid,
  target_action_record_id uuid,target_approval_audit_id uuid,target_approval_transition_id uuid,target_approval_outbox_id uuid,
  target_application_audit_id uuid,target_application_transition_id uuid,target_application_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions
as $$ declare instance_row public.approval_instance%rowtype; subject_row public.approval_subject_research_project_application%rowtype;
  version_row public.research_project_application_version%rowtype; rule_row public.approval_policy_step_rule%rowtype;
  participant_rule public.approval_policy_participant_rule%rowtype; director_assignment public.user_position_assignment%rowtype;
  next_instance_version bigint; next_application_version bigint; computed_line_checksum text; begin
  perform app_private.m06_assert_direct_internal(target_occurred_at);
  perform app_private.assert_approval_request(target_occurred_at,'approval.instance.submit');
  select * into strict instance_row from public.approval_instance where id=target_instance_id for update;
  select * into strict subject_row from public.approval_subject_research_project_application where instance_id=target_instance_id for share;
  select * into strict version_row from public.research_project_application_version where id=subject_row.application_version_id for update;
  next_instance_version:=app_private.next_version(instance_row.version_no,target_expected_instance_version);
  next_application_version:=version_row.row_version+1;
  if instance_row.state<>'DRAFT' or instance_row.submitter_user_id<>app_private.current_effective_actor_user_id()
    or version_row.state<>'APPLICATION_DRAFT' or version_row.sealed_snapshot_checksum<>subject_row.subject_checksum
    or version_row.sealed_at<>subject_row.subject_sealed_at then raise exception 'exact research application subject is not submit-ready' using errcode='23514'; end if;
  if (select count(*) from public.approval_policy_step_rule s where s.policy_version_id=instance_row.policy_version_id)<>1 then
    raise exception 'formal research designation requires exactly one Lab Director step' using errcode='23514';
  end if;
  select * into strict rule_row from public.approval_policy_step_rule s where s.policy_version_id=instance_row.policy_version_id;
  if rule_row.sequence_no<>1 or rule_row.step_role<>'APPROVAL' or rule_row.completion_mode<>'SEQUENTIAL' or not rule_row.required then
    raise exception 'formal research designation policy must be required sequential Lab Director approval' using errcode='23514';
  end if;
  if (select count(*) from public.approval_policy_participant_rule p where p.step_rule_id=rule_row.id)<>1 then
    raise exception 'formal research designation requires one participant rule' using errcode='23514';
  end if;
  select pr.* into strict participant_rule from public.approval_policy_participant_rule pr
    join public.position position_rule on position_rule.id=pr.position_id and position_rule.stable_code='POSITION_LAB_DIRECTOR' and position_rule.status='ACTIVE'
    where pr.step_rule_id=rule_row.id and pr.selector_kind='POSITION' and pr.participant_user_id is null and pr.role_id is null;
  if (select count(*) from public.user_position_assignment a join public.position p on p.id=a.position_id and p.stable_code='POSITION_LAB_DIRECTOR' and p.status='ACTIVE'
      join public.user_account u on u.id=a.user_id and u.account_kind='INTERNAL' and u.status='ACTIVE'
      where a.is_primary and a.revoked_at is null and a.valid_from<=target_occurred_at and (a.valid_until is null or a.valid_until>target_occurred_at)
        and u.valid_from<=target_occurred_at and (u.valid_until is null or u.valid_until>target_occurred_at))<>1 then
    raise exception 'exactly one active Lab Director must resolve' using errcode='23514';
  end if;
  select a.* into strict director_assignment from public.user_position_assignment a join public.position p on p.id=a.position_id and p.stable_code='POSITION_LAB_DIRECTOR'
    join public.user_account u on u.id=a.user_id where a.is_primary and a.revoked_at is null and a.valid_from<=target_occurred_at
      and (a.valid_until is null or a.valid_until>target_occurred_at) and u.account_kind='INTERNAL' and u.status='ACTIVE'
      and u.valid_from<=target_occurred_at and (u.valid_until is null or u.valid_until>target_occurred_at);
  insert into public.approval_step(id,instance_id,policy_step_rule_id,step_key,sequence_no,step_role,completion_mode,required,state,version_no)
    values(target_step_id,target_instance_id,rule_row.id,rule_row.step_key,1,'APPROVAL','SEQUENTIAL',true,'WAITING',0);
  insert into public.approval_participant(id,step_id,policy_participant_rule_id,participant_user_id,position_id_snapshot,assignment_evidence_id,
    participant_order,required_for_completion,state,version_no)
    values(target_participant_id,target_step_id,participant_rule.id,director_assignment.user_id,director_assignment.position_id,director_assignment.id,
      1,true,'WAITING',0);
  select encode(extensions.digest(convert_to(concat_ws(':',target_step_id,rule_row.step_key,'APPROVAL','SEQUENTIAL',target_participant_id,
    director_assignment.user_id,director_assignment.position_id,director_assignment.id),'UTF8'),'sha256'),'hex') into computed_line_checksum;
  update public.approval_instance set state='SUBMITTED',line_checksum=computed_line_checksum,version_no=next_instance_version,submitted_at=target_occurred_at where id=target_instance_id;
  perform set_config('app.research_application_transition',target_instance_id::text,true);
  update public.research_project_application_version set state='DIRECTOR_REVIEW_PENDING',approval_instance_id=target_instance_id,
    row_version=next_application_version where id=version_row.id;
  perform app_private.append_approval_audit_transition(target_approval_audit_id,target_approval_transition_id,'approval.instance.submit',target_instance_id,
    next_instance_version,'EVT-APPROVAL-SUBMIT','DRAFT','SUBMITTED','RESEARCH_PROJECT_APPLICATION',target_occurred_at);
  insert into public.approval_action(id,instance_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,occurred_at)
    values(target_action_record_id,target_instance_id,target_approval_audit_id,'SUBMIT','USER',app_private.current_actor_user_id(),app_private.current_effective_actor_user_id(),target_occurred_at);
  perform app_private.enqueue_approval_event(target_approval_outbox_id,target_approval_audit_id,'EVT-APPROVAL-SUBMITTED',target_instance_id,
    next_instance_version,'SUBMITTED',target_occurred_at);
  perform app_private.append_m06_transition(target_application_audit_id,target_application_transition_id,target_application_outbox_id,
    'project.research_designation.submit','RESEARCH_PROJECT_APPLICATION',version_row.id,'SM-RESEARCH-PROJECT-DESIGNATION-V1',
    'EVT-RP-APPLICATION-SUBMIT','EVT-RP-APPLICATION-SUBMITTED','APPLICATION_DRAFT','DIRECTOR_REVIEW_PENDING',
    version_row.row_version,next_application_version,null,target_occurred_at);
  return next_instance_version;
end $$;

create or replace function public.perform_research_project_approval_action(
  target_instance_id uuid,target_step_id uuid,target_participant_id uuid,target_event text,
  target_expected_instance_version bigint,target_expected_step_version bigint,target_expected_participant_version bigint,target_expected_application_version bigint,
  target_action_record_id uuid,target_approval_audit_id uuid,target_approval_transition_id uuid,target_approval_outbox_id uuid,
  target_application_audit_id uuid,target_application_transition_id uuid,target_application_outbox_id uuid,target_designation_id uuid,
  target_designation_audit_id uuid,target_reason_code text,target_opinion text,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare instance_row public.approval_instance%rowtype; step_row public.approval_step%rowtype; participant_row public.approval_participant%rowtype;
  subject_row public.approval_subject_research_project_application%rowtype; version_row public.research_project_application_version%rowtype;
  next_instance_version bigint; next_application_version bigint; approval_state text; application_state text; approval_event text;
  approval_outbox text; application_event text; application_outbox text; application_action text; action_event text; effective_reason text; begin
  if target_event not in ('APPROVE','REJECT','RETURN') then raise exception 'unsupported research designation action' using errcode='22023'; end if;
  effective_reason:=case when target_event='RETURN' then 'RP-RETURNED-FOR-REVISION' else target_reason_code end;
  if target_event='REJECT' and target_reason_code is null then raise exception 'rejection reason required' using errcode='23514'; end if;
  if target_event='RETURN' and target_opinion is null then raise exception 'return explanation required' using errcode='23514'; end if;
  perform app_private.m06_assert_direct_internal(target_occurred_at);
  perform app_private.assert_approval_request(target_occurred_at,case when target_event='APPROVE' then 'approval.step.approve' else 'approval.step.reject' end);
  if not app_private.actor_is_lab_director(target_occurred_at) then raise exception 'current Lab Director consent is required' using errcode='42501'; end if;
  select * into strict instance_row from public.approval_instance where id=target_instance_id for update;
  select * into strict step_row from public.approval_step where id=target_step_id and instance_id=target_instance_id for update;
  select * into strict participant_row from public.approval_participant where id=target_participant_id and step_id=target_step_id for update;
  select * into strict subject_row from public.approval_subject_research_project_application where instance_id=target_instance_id for share;
  select * into strict version_row from public.research_project_application_version where id=subject_row.application_version_id for update;
  next_instance_version:=app_private.next_version(instance_row.version_no,target_expected_instance_version);
  perform app_private.next_version(step_row.version_no,target_expected_step_version);
  perform app_private.next_version(participant_row.version_no,target_expected_participant_version);
  next_application_version:=app_private.next_version(version_row.row_version,target_expected_application_version);
  if instance_row.state<>'IN_PROGRESS' or version_row.state<>'DIRECTOR_REVIEW_PENDING' or version_row.approval_instance_id<>target_instance_id
    or step_row.state<>'ACTIVE' or step_row.step_role<>'APPROVAL' or step_row.completion_mode<>'SEQUENTIAL'
    or participant_row.state<>'ACTIVE' or participant_row.participant_user_id<>app_private.current_effective_actor_user_id()
    or not exists(select 1 from public.position p where p.id=participant_row.position_id_snapshot and p.stable_code='POSITION_LAB_DIRECTOR' and p.status='ACTIVE') then
    raise exception 'actor is not the exact active Lab Director participant' using errcode='42501';
  end if;
  if target_event='APPROVE' then
    approval_state:='COMPLETED'; application_state:='APPROVED'; approval_event:='EVT-APPROVAL-APPROVE'; approval_outbox:='EVT-APPROVAL-COMPLETED';
    application_event:='EVT-RP-DIRECTOR-CONSENT'; application_outbox:='EVT-RP-DIRECTOR-CONSENTED'; application_action:='project.research_designation.consent'; action_event:='APPROVE';
    if target_designation_id is null or target_designation_audit_id is null then raise exception 'designation identity and audit are required' using errcode='23514'; end if;
  else
    approval_state:='REJECTED'; application_state:=case when target_event='RETURN' then 'RETURNED' else 'REJECTED' end;
    approval_event:='EVT-APPROVAL-REJECT'; approval_outbox:='EVT-APPROVAL-REJECTED';
    application_event:=case when target_event='RETURN' then 'EVT-RP-RETURN' else 'EVT-RP-REJECT' end;
    application_outbox:=case when target_event='RETURN' then 'EVT-RP-APPLICATION-RETURNED' else 'EVT-RP-APPLICATION-REJECTED' end;
    application_action:='project.research_designation.reject'; action_event:='REJECT';
  end if;
  perform set_config('app.research_approval_command_instance',target_instance_id::text,true);
  perform set_config('app.research_application_transition',target_instance_id::text,true);
  update public.approval_participant set state='ACTED',version_no=version_no+1 where id=target_participant_id;
  update public.approval_step set state=case when target_event='APPROVE' then 'APPROVED' else 'REJECTED' end,version_no=version_no+1 where id=target_step_id;
  update public.approval_instance set state=approval_state,version_no=next_instance_version,
    completed_at=case when approval_state='COMPLETED' then target_occurred_at else completed_at end where id=target_instance_id;
  update public.research_project_application_version set state=application_state,row_version=next_application_version where id=version_row.id;
  if target_event='APPROVE' then
    insert into public.research_project_designation(id,project_id,application_version_id,application_revision_no,approval_instance_id,approval_version,application_checksum,
      consented_by_user_id,consented_at,valid_from,valid_until,state,version_no)
    values(target_designation_id,version_row.project_id,version_row.id,version_row.version_no,target_instance_id,next_instance_version,version_row.sealed_snapshot_checksum,
      app_private.current_effective_actor_user_id(),target_occurred_at,version_row.research_start,version_row.research_end,'APPROVED',1);
    perform app_private.append_audit(target_designation_audit_id,'project.research_designation.consent','RESEARCH_PROJECT_DESIGNATION',
      target_designation_id,1,'SUCCEEDED','LAB-DIRECTOR-CONSENT',target_instance_id,null,version_row.sealed_snapshot_checksum,null,target_occurred_at);
  end if;
  perform app_private.append_approval_audit_transition(target_approval_audit_id,target_approval_transition_id,
    case when target_event='APPROVE' then 'approval.step.approve' else 'approval.step.reject' end,target_instance_id,next_instance_version,
    approval_event,'IN_PROGRESS',approval_state,effective_reason,target_occurred_at);
  insert into public.approval_action(id,instance_id,step_id,participant_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,
    effective_actor_user_id,reason_code,opinion,occurred_at)
  values(target_action_record_id,target_instance_id,target_step_id,target_participant_id,target_approval_audit_id,action_event,'USER',
    app_private.current_actor_user_id(),app_private.current_effective_actor_user_id(),effective_reason,target_opinion,target_occurred_at);
  perform app_private.enqueue_approval_event(target_approval_outbox_id,target_approval_audit_id,approval_outbox,target_instance_id,
    next_instance_version,approval_state,target_occurred_at);
  perform app_private.append_m06_transition(target_application_audit_id,target_application_transition_id,target_application_outbox_id,
    application_action,'RESEARCH_PROJECT_APPLICATION',version_row.id,'SM-RESEARCH-PROJECT-DESIGNATION-V1',application_event,
    application_outbox,'DIRECTOR_REVIEW_PENDING',application_state,version_row.row_version,next_application_version,effective_reason,target_occurred_at);
  return next_instance_version;
end $$;

create or replace function app_private.guard_research_approval_action_path()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  if new.event_id in ('REVIEW','AGREE','APPROVE','REJECT','REFERENCE_RECEIPT','REQUEST_RECALL','RECALL')
    and exists(select 1 from public.approval_subject_research_project_application r where r.instance_id=new.instance_id)
    and app_private.optional_setting('app.research_approval_command_instance') is distinct from new.instance_id::text then
    raise exception 'research Project approval actions require the typed Lab Director command path' using errcode='42501';
  end if;
  return new;
end $$;
create trigger approval_action_research_project_path_guard before insert on public.approval_action
  for each row execute function app_private.guard_research_approval_action_path();

create or replace function app_private.assert_research_application_head()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare target_application uuid; begin
  if tg_table_name='research_project_application' then target_application:=coalesce(new.id,old.id);
  elsif tg_table_name='research_project_application_version' then target_application:=coalesce(new.application_id,old.application_id);
  else raise exception 'unsupported research application head trigger table' using errcode='23514'; end if;
  if not exists(select 1 from public.research_project_application a join public.research_project_application_version v
    on v.id=a.current_version_id and v.application_id=a.id and v.project_id=a.project_id and v.version_no=a.current_version_no
    where a.id=target_application) then raise exception 'research application head/version diverged' using errcode='23514'; end if;
  return coalesce(new,old);
end $$;
create constraint trigger research_application_head_consistency after insert or update on public.research_project_application
  deferrable initially deferred for each row execute function app_private.assert_research_application_head();
create constraint trigger research_application_version_head_consistency after insert or update on public.research_project_application_version
  deferrable initially deferred for each row execute function app_private.assert_research_application_head();

create or replace function app_private.reject_m06_delete()
returns trigger language plpgsql set search_path=pg_catalog
as $$ begin raise exception 'M06 evidence rows are retained; use guarded lifecycle commands' using errcode='55000'; end $$;
create trigger product_no_delete before delete on public.product for each row execute function app_private.reject_m06_delete();
create trigger project_no_delete before delete on public.project for each row execute function app_private.reject_m06_delete();
create trigger project_member_no_delete before delete on public.project_member for each row execute function app_private.reject_m06_delete();
create trigger project_product_no_delete before delete on public.project_product for each row execute function app_private.reject_m06_delete();
create trigger project_vendor_grant_no_delete before delete on public.project_vendor_grant for each row execute function app_private.reject_m06_delete();
create trigger project_vendor_grant_action_no_delete before delete on public.project_vendor_grant_action for each row execute function app_private.reject_m06_delete();
create trigger wbs_node_no_delete before delete on public.wbs_node for each row execute function app_private.reject_m06_delete();
create trigger research_application_no_delete before delete on public.research_project_application for each row execute function app_private.reject_m06_delete();

alter table public.product enable row level security; alter table public.product force row level security;
alter table public.project enable row level security; alter table public.project force row level security;
alter table public.project_member enable row level security; alter table public.project_member force row level security;
alter table public.project_product enable row level security; alter table public.project_product force row level security;
alter table public.project_vendor_grant enable row level security; alter table public.project_vendor_grant force row level security;
alter table public.project_vendor_grant_action enable row level security; alter table public.project_vendor_grant_action force row level security;
alter table public.wbs_node enable row level security; alter table public.wbs_node force row level security;
alter table public.research_project_application enable row level security; alter table public.research_project_application force row level security;
alter table public.research_project_application_version enable row level security; alter table public.research_project_application_version force row level security;
alter table public.research_project_application_member enable row level security; alter table public.research_project_application_member force row level security;
alter table public.research_project_application_output enable row level security; alter table public.research_project_application_output force row level security;
alter table public.research_project_application_evidence enable row level security; alter table public.research_project_application_evidence force row level security;
alter table public.research_project_designation enable row level security; alter table public.research_project_designation force row level security;
alter table public.approval_subject_research_project_application enable row level security;
alter table public.approval_subject_research_project_application force row level security;

create policy product_internal_read on public.product for select to youone_request using(
  exists(select 1 from public.user_account u where u.id=app_private.current_actor_user_id() and u.account_kind='INTERNAL'
    and u.status='ACTIVE' and u.valid_from<=app_private.request_time() and (u.valid_until is null or u.valid_until>app_private.request_time())));
create policy project_internal_scoped_read on public.project for select to youone_request using(
  app_private.actor_has_project_internal_scope(id,app_private.request_time()));
create policy project_member_internal_scoped_read on public.project_member for select to youone_request using(
  app_private.actor_has_project_internal_scope(project_id,app_private.request_time()));
create policy project_product_internal_scoped_read on public.project_product for select to youone_request using(
  app_private.actor_has_project_internal_scope(project_id,app_private.request_time()));
create policy project_vendor_grant_internal_read on public.project_vendor_grant for select to youone_request using(
  app_private.actor_can_edit_project(project_id,app_private.request_time()));
create policy project_vendor_grant_action_internal_read on public.project_vendor_grant_action for select to youone_request using(
  exists(select 1 from public.project_vendor_grant g where g.id=grant_id and app_private.actor_can_edit_project(g.project_id,app_private.request_time())));
create policy wbs_internal_or_exact_vendor_read on public.wbs_node for select to youone_request using(
  app_private.actor_has_project_internal_scope(project_id,app_private.request_time()) or
  (assigned_vendor_user_id is not null and app_private.actor_has_project_vendor_scope(project_id,'project.wbs.read',app_private.request_time())
    and exists(select 1 from public.vendor_user vu where vu.id=assigned_vendor_user_id and vu.user_id=app_private.current_actor_user_id())));
create policy research_application_internal_read on public.research_project_application for select to youone_request using(
  app_private.actor_has_project_internal_scope(project_id,app_private.request_time()));
create policy research_application_version_internal_or_participant_read on public.research_project_application_version for select to youone_request using(
  app_private.actor_has_project_internal_scope(project_id,app_private.request_time())
  or (approval_instance_id is not null and app_private.can_read_approval_instance(approval_instance_id,app_private.request_time())));
create policy research_application_member_internal_or_participant_read on public.research_project_application_member for select to youone_request using(
  exists(select 1 from public.research_project_application_version v where v.id=application_version_id and
    (app_private.actor_has_project_internal_scope(v.project_id,app_private.request_time())
      or (v.approval_instance_id is not null and app_private.can_read_approval_instance(v.approval_instance_id,app_private.request_time())))));
create policy research_application_output_internal_or_participant_read on public.research_project_application_output for select to youone_request using(
  exists(select 1 from public.research_project_application_version v where v.id=application_version_id and
    (app_private.actor_has_project_internal_scope(v.project_id,app_private.request_time())
      or (v.approval_instance_id is not null and app_private.can_read_approval_instance(v.approval_instance_id,app_private.request_time())))));
create policy research_application_evidence_internal_or_participant_read on public.research_project_application_evidence for select to youone_request using(
  exists(select 1 from public.research_project_application_version v where v.id=application_version_id and
    (app_private.actor_has_project_internal_scope(v.project_id,app_private.request_time())
      or (v.approval_instance_id is not null and app_private.can_read_approval_instance(v.approval_instance_id,app_private.request_time())))));
create policy research_designation_internal_read on public.research_project_designation for select to youone_request using(
  app_private.actor_has_project_internal_scope(project_id,app_private.request_time()));
create policy approval_research_subject_participant_read on public.approval_subject_research_project_application for select to youone_request using(
  app_private.can_read_approval_instance(instance_id,app_private.request_time()));

revoke all on public.product,public.project,public.project_member,public.project_product,public.project_vendor_grant,
  public.project_vendor_grant_action,public.wbs_node,public.research_project_application,public.research_project_application_version,
  public.research_project_application_member,public.research_project_application_output,public.research_project_application_evidence,
  public.research_project_designation,public.approval_subject_research_project_application
from public,youone_request,youone_privileged_writer;
grant select on public.product,public.project,public.project_member,public.project_product,public.project_vendor_grant,
  public.project_vendor_grant_action,public.wbs_node,public.research_project_application,public.research_project_application_version,
  public.research_project_application_member,public.research_project_application_output,public.research_project_application_evidence,
  public.research_project_designation,public.approval_subject_research_project_application
to youone_request;

revoke all on function public.create_product(uuid,text,text,uuid,timestamptz),
  public.create_project(uuid,text,text,uuid,text,date,date,text,uuid,uuid,uuid,timestamptz),
  public.transition_project(uuid,text,bigint,text,uuid,uuid,uuid,timestamptz),
  public.assign_project_member(uuid,uuid,uuid,text,timestamptz,timestamptz,text,uuid,timestamptz),
  public.link_project_product(uuid,uuid,text,date,date,uuid,timestamptz),
  public.grant_project_vendor_scope(uuid,uuid,uuid,text,timestamptz,timestamptz,text,uuid,timestamptz),
  public.revoke_project_vendor_scope(uuid,bigint,text,uuid,timestamptz),
  public.read_project_vendor_summary(uuid,timestamptz),
  public.create_wbs_node(uuid,uuid,uuid,text,text,text,uuid,uuid,date,date,integer,uuid,uuid,uuid,timestamptz),
  public.transition_wbs_node(uuid,text,bigint,numeric,text,uuid,uuid,uuid,timestamptz),
  public.create_research_project_application(uuid,uuid,uuid,text,text,date,date,numeric,character,text,boolean,text,text,uuid,uuid,uuid,timestamptz),
  public.add_research_project_application_member(uuid,uuid,text,numeric,uuid,timestamptz),
  public.add_research_project_application_output(uuid,uuid,text,text,uuid,timestamptz),
  public.add_research_project_application_evidence(uuid,uuid,text,uuid,timestamptz),
  public.create_research_project_application_revision(uuid,uuid,bigint,bigint,text,text,date,date,numeric,character,text,boolean,text,text,text,uuid,uuid,uuid,timestamptz),
  public.seal_research_project_application(uuid,bigint,uuid,uuid,timestamptz),
  public.create_research_project_approval_instance(uuid,uuid,text,uuid,uuid,bigint,uuid,uuid,uuid,timestamptz),
  public.submit_research_project_approval_instance(uuid,bigint,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz),
  public.perform_research_project_approval_action(uuid,uuid,uuid,text,bigint,bigint,bigint,bigint,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz)
from public,youone_privileged_writer;

grant execute on function public.create_product(uuid,text,text,uuid,timestamptz),
  public.create_project(uuid,text,text,uuid,text,date,date,text,uuid,uuid,uuid,timestamptz),
  public.transition_project(uuid,text,bigint,text,uuid,uuid,uuid,timestamptz),
  public.assign_project_member(uuid,uuid,uuid,text,timestamptz,timestamptz,text,uuid,timestamptz),
  public.link_project_product(uuid,uuid,text,date,date,uuid,timestamptz),
  public.grant_project_vendor_scope(uuid,uuid,uuid,text,timestamptz,timestamptz,text,uuid,timestamptz),
  public.revoke_project_vendor_scope(uuid,bigint,text,uuid,timestamptz),
  public.read_project_vendor_summary(uuid,timestamptz),
  public.create_wbs_node(uuid,uuid,uuid,text,text,text,uuid,uuid,date,date,integer,uuid,uuid,uuid,timestamptz),
  public.transition_wbs_node(uuid,text,bigint,numeric,text,uuid,uuid,uuid,timestamptz),
  public.create_research_project_application(uuid,uuid,uuid,text,text,date,date,numeric,character,text,boolean,text,text,uuid,uuid,uuid,timestamptz),
  public.add_research_project_application_member(uuid,uuid,text,numeric,uuid,timestamptz),
  public.add_research_project_application_output(uuid,uuid,text,text,uuid,timestamptz),
  public.add_research_project_application_evidence(uuid,uuid,text,uuid,timestamptz),
  public.create_research_project_application_revision(uuid,uuid,bigint,bigint,text,text,date,date,numeric,character,text,boolean,text,text,text,uuid,uuid,uuid,timestamptz),
  public.seal_research_project_application(uuid,bigint,uuid,uuid,timestamptz),
  public.create_research_project_approval_instance(uuid,uuid,text,uuid,uuid,bigint,uuid,uuid,uuid,timestamptz),
  public.submit_research_project_approval_instance(uuid,bigint,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz),
  public.perform_research_project_approval_action(uuid,uuid,uuid,text,bigint,bigint,bigint,bigint,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz)
to youone_request;

revoke all on function app_private.m06_assert_direct_internal(timestamptz),app_private.append_m06_transition(uuid,uuid,uuid,text,text,uuid,text,text,text,text,text,bigint,bigint,text,timestamptz),
  app_private.enforce_project_member_internal(),app_private.enforce_project_owner_internal(),app_private.enforce_wbs_assignment_kind(),app_private.guard_wbs_tree(),app_private.protect_research_application_version(),
  app_private.protect_research_application_members(),app_private.protect_research_subject_link(),app_private.guard_research_subject_active(),
  app_private.protect_designation_identity(),app_private.guard_research_approval_action_path(),app_private.assert_research_application_head(),app_private.reject_m06_delete(),
  app_private.approval_subject_snapshot(uuid)
from public,youone_request,youone_privileged_writer;
revoke all on function app_private.actor_has_project_internal_scope(uuid,timestamptz),app_private.actor_can_edit_project(uuid,timestamptz),
  app_private.actor_is_lab_director(timestamptz),app_private.actor_has_project_vendor_scope(uuid,text,timestamptz)
from public,youone_privileged_writer;
grant execute on function app_private.actor_has_project_internal_scope(uuid,timestamptz),app_private.actor_can_edit_project(uuid,timestamptz),
  app_private.actor_is_lab_director(timestamptz),app_private.actor_has_project_vendor_scope(uuid,text,timestamptz)
to youone_request;

comment on function public.transition_project(uuid,text,bigint,text,uuid,uuid,uuid,timestamptz) is
  'OD-014 fail-closed: BEGIN_CLOSE, CLOSE and REOPEN have no executable branch until the blocking-child policy is decided.';

create or replace function public.request_research_project_approval_recall(
  target_instance_id uuid,target_expected_version bigint,target_action_record_id uuid,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_reason_code text,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  if not exists(select 1 from public.approval_subject_research_project_application r where r.instance_id=target_instance_id) then
    raise exception 'typed research application subject required' using errcode='23514';
  end if;
  perform set_config('app.research_approval_command_instance',target_instance_id::text,true);
  return public.request_approval_recall(target_instance_id,target_expected_version,target_action_record_id,target_audit_id,target_transition_id,
    target_outbox_id,target_reason_code,target_occurred_at);
end $$;

create or replace function public.complete_research_project_approval_recall(
  target_instance_id uuid,target_expected_instance_version bigint,target_expected_application_version bigint,
  target_action_record_id uuid,target_approval_audit_id uuid,target_approval_transition_id uuid,target_approval_outbox_id uuid,
  target_application_audit_id uuid,target_application_transition_id uuid,target_application_outbox_id uuid,
  target_reason_code text,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare subject_row public.approval_subject_research_project_application%rowtype;
  version_row public.research_project_application_version%rowtype; next_instance_version bigint; next_application_version bigint; begin
  perform app_private.assert_approval_worker(target_occurred_at);
  select * into strict subject_row from public.approval_subject_research_project_application where instance_id=target_instance_id for share;
  select * into strict version_row from public.research_project_application_version where id=subject_row.application_version_id for update;
  if version_row.state<>'DIRECTOR_REVIEW_PENDING' or version_row.approval_instance_id<>target_instance_id then
    raise exception 'research application is not recall-pending capable' using errcode='23514';
  end if;
  next_application_version:=app_private.next_version(version_row.row_version,target_expected_application_version);
  perform set_config('app.research_approval_command_instance',target_instance_id::text,true);
  perform set_config('app.research_application_transition',target_instance_id::text,true);
  next_instance_version:=public.complete_approval_recall(target_instance_id,target_expected_instance_version,target_action_record_id,
    target_approval_audit_id,target_approval_transition_id,target_approval_outbox_id,'RP-APPLICANT-RECALL',target_occurred_at);
  update public.research_project_application_version set state='RETURNED',row_version=next_application_version where id=version_row.id;
  perform app_private.append_m06_transition(target_application_audit_id,target_application_transition_id,target_application_outbox_id,
    'project.research_designation.reject','RESEARCH_PROJECT_APPLICATION',version_row.id,'SM-RESEARCH-PROJECT-DESIGNATION-V1',
    'EVT-RP-RETURN','EVT-RP-APPLICATION-RETURNED','DIRECTOR_REVIEW_PENDING','RETURNED',version_row.row_version,
    next_application_version,'RP-APPLICANT-RECALL',target_occurred_at);
  return next_instance_version;
end $$;

revoke all on function public.request_research_project_approval_recall(uuid,bigint,uuid,uuid,uuid,uuid,text,timestamptz),
  public.complete_research_project_approval_recall(uuid,bigint,bigint,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz)
from public,youone_request,youone_privileged_writer;
grant execute on function public.request_research_project_approval_recall(uuid,bigint,uuid,uuid,uuid,uuid,text,timestamptz) to youone_request;
grant execute on function public.complete_research_project_approval_recall(uuid,bigint,bigint,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz)
to youone_privileged_writer;

create or replace function public.read_formal_research_status(target_project_id uuid,target_occurred_at timestamptz)
returns table(project_id uuid,status text,designation_id uuid,application_revision_no bigint,valid_from date,valid_until date)
language plpgsql stable security definer set search_path=pg_catalog,public,app_private
as $$ begin
  if target_occurred_at is distinct from app_private.request_time()
    or not app_private.actor_has_project_internal_scope(target_project_id,target_occurred_at) then return; end if;
  return query select target_project_id,
    case when d.id is null then 'ORDINARY_PROJECT' else 'FORMAL_RESEARCH_PROJECT' end,
    d.id,d.application_revision_no,d.valid_from,d.valid_until
  from (select 1) seed left join lateral (
    select designation.id,designation.application_revision_no,designation.valid_from,designation.valid_until
    from public.research_project_designation designation where designation.project_id=target_project_id and designation.state='APPROVED'
      and designation.valid_from<=target_occurred_at::date and (designation.valid_until is null or designation.valid_until>=target_occurred_at::date)
    order by designation.consented_at desc limit 1) d on true;
end $$;

revoke all on function public.read_formal_research_status(uuid,timestamptz) from public,youone_privileged_writer;
grant execute on function public.read_formal_research_status(uuid,timestamptz) to youone_request;
