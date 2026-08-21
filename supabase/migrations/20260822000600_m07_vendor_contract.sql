-- M07 Vendor / Contract / Deliverable
-- Internal contract presets are versioned comparison baselines, never statutory values.
-- M08 owns inspection, acceptance and payment eligibility/execution.

-- M03 initially allowed exactly three permission segments. M07 introduces the
-- reviewed, stable `contract.detail.finance.read` identifier while preserving
-- every existing three-segment identifier.
alter table public.permission drop constraint permission_stable_code_check;
alter table public.permission add constraint permission_stable_code_check
  check(stable_code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$');

insert into public.aggregate_type_definition(aggregate_type) values
  ('VENDOR_CONTRACT'),('CONTRACT_VERSION'),('DELIVERABLE'),('GUARANTEE'),('WARRANTY_ISSUE'),('CONTRACT_VENDOR_GRANT')
on conflict do nothing;

insert into public.action_definition(action_id) values
  ('contract.record.create'),('contract.record.update'),('contract.scope.manage'),
  ('contract.version.create'),('contract.version.seal'),('contract.version.sign'),
  ('contract.approval.bind'),('contract.lifecycle.transition'),('contract.scope.issue'),('contract.scope.revoke'),
  ('contract.list.read'),('contract.detail.read'),('contract.detail.finance.read'),
  ('deliverable.record.create'),('deliverable.version.create'),('guarantee.record.create'),('warranty.issue.create')
on conflict do nothing;

insert into public.permission(id,stable_code) values
  ('37000000-0000-4000-8000-000000000001','contract.record.create'),
  ('37000000-0000-4000-8000-000000000002','contract.record.update'),
  ('37000000-0000-4000-8000-000000000003','contract.list.read'),
  ('37000000-0000-4000-8000-000000000004','contract.detail.read'),
  ('37000000-0000-4000-8000-000000000005','contract.detail.finance.read'),
  ('37000000-0000-4000-8000-000000000006','contract.scope.manage')
on conflict(stable_code) do nothing;

insert into public.domain_event_definition(event_id,payload_schema_id,payload_schema_version) values
  ('EVT-CONTRACT-CREATE','CONTRACT_EVENT_REF',1),('EVT-CONTRACT-ACTIVATE','CONTRACT_EVENT_REF',1),
  ('EVT-CONTRACT-BEGIN-CLOSE','CONTRACT_EVENT_REF',1),('EVT-CONTRACT-CLOSE','CONTRACT_EVENT_REF',1),
  ('EVT-CONTRACT-REQUEST-TERMINATION','CONTRACT_EVENT_REF',1),('EVT-CONTRACT-TERMINATE','CONTRACT_EVENT_REF',1),
  ('EVT-CONTRACT-CREATED','CONTRACT_EVENT_REF',1),('EVT-CONTRACT-ACTIVATED','CONTRACT_EVENT_REF',1),
  ('EVT-CONTRACT-SIGNED','CONTRACT_EVENT_REF',1),
  ('EVT-CONTRACT-CLOSE-STARTED','CONTRACT_EVENT_REF',1),('EVT-CONTRACT-CLOSED','CONTRACT_EVENT_REF',1),
  ('EVT-CONTRACT-TERMINATION-REQUESTED','CONTRACT_EVENT_REF',1),('EVT-CONTRACT-TERMINATED','CONTRACT_EVENT_REF',1),
  ('EVT-CONTRACT-SCOPE-ISSUED','CONTRACT_SCOPE_EVENT_REF',1),('EVT-CONTRACT-SCOPE-REVOKED','CONTRACT_SCOPE_EVENT_REF',1),
  ('EVT-DELIVERABLE-DEFINED','DELIVERABLE_EVENT_REF',1),('EVT-WARRANTY-OPENED','WARRANTY_EVENT_REF',1)
on conflict do nothing;

insert into public.state_machine_definition(machine_id,aggregate_type) values
  ('SM-VENDOR-CONTRACT-V1','VENDOR_CONTRACT'),('SM-DELIVERABLE-V1','DELIVERABLE'),
  ('SM-GUARANTEE-V1','GUARANTEE'),('SM-WARRANTY-V1','WARRANTY_ISSUE')
on conflict do nothing;

insert into public.state_definition(machine_id,state_id,is_terminal) values
  ('SM-VENDOR-CONTRACT-V1','DRAFT',false),('SM-VENDOR-CONTRACT-V1','INTERNAL_REVIEW',false),
  ('SM-VENDOR-CONTRACT-V1','NEGOTIATION',false),('SM-VENDOR-CONTRACT-V1','APPROVAL_PENDING',false),
  ('SM-VENDOR-CONTRACT-V1','SIGNED',false),('SM-VENDOR-CONTRACT-V1','ACTIVE',false),
  ('SM-VENDOR-CONTRACT-V1','CHANGE_PENDING',false),('SM-VENDOR-CONTRACT-V1','PERFORMANCE_COMPLETE',false),
  ('SM-VENDOR-CONTRACT-V1','CLOSING',false),('SM-VENDOR-CONTRACT-V1','CLOSED',true),
  ('SM-VENDOR-CONTRACT-V1','TERMINATION_REVIEW',false),('SM-VENDOR-CONTRACT-V1','TERMINATED',true),
  ('SM-DELIVERABLE-V1','EXPECTED',false),('SM-DELIVERABLE-V1','IN_PROGRESS',false),
  ('SM-DELIVERABLE-V1','SUBMITTED',false),('SM-DELIVERABLE-V1','UNDER_REVIEW',false),
  ('SM-DELIVERABLE-V1','CORRECTION_REQUIRED',false),('SM-DELIVERABLE-V1','ACCEPTED',true),
  ('SM-DELIVERABLE-V1','REJECTED',true),('SM-DELIVERABLE-V1','SUPERSEDED',true),('SM-DELIVERABLE-V1','CANCELLED',true),
  ('SM-GUARANTEE-V1','DRAFT',false),('SM-GUARANTEE-V1','ACTIVE',false),('SM-GUARANTEE-V1','CLAIM_REVIEW',false),
  ('SM-GUARANTEE-V1','CLAIMED',true),('SM-GUARANTEE-V1','RELEASE_PENDING',false),('SM-GUARANTEE-V1','RELEASED',true),
  ('SM-GUARANTEE-V1','EXPIRED',true),('SM-GUARANTEE-V1','CANCELLED',true),
  ('SM-WARRANTY-V1','OPEN',false),('SM-WARRANTY-V1','VENDOR_NOTIFIED',false),('SM-WARRANTY-V1','PLAN_PENDING',false),
  ('SM-WARRANTY-V1','REMEDIATION',false),('SM-WARRANTY-V1','VERIFICATION',false),('SM-WARRANTY-V1','RESOLVED',false),
  ('SM-WARRANTY-V1','REOPENED',false),('SM-WARRANTY-V1','CLAIM_REVIEW',false),('SM-WARRANTY-V1','CLOSED',true)
on conflict do nothing;

insert into public.transition_definition(machine_id,event_id,from_state,to_state) values
  ('SM-VENDOR-CONTRACT-V1','EVT-CONTRACT-CREATE',null,'DRAFT'),
  ('SM-VENDOR-CONTRACT-V1','EVT-CONTRACT-ACTIVATE','SIGNED','ACTIVE'),
  ('SM-VENDOR-CONTRACT-V1','EVT-CONTRACT-APPROVED-SIGNED','APPROVAL_PENDING','SIGNED'),
  ('SM-VENDOR-CONTRACT-V1','EVT-CONTRACT-BEGIN-CLOSE','PERFORMANCE_COMPLETE','CLOSING'),
  ('SM-VENDOR-CONTRACT-V1','EVT-CONTRACT-CLOSE','CLOSING','CLOSED'),
  ('SM-VENDOR-CONTRACT-V1','EVT-CONTRACT-REQUEST-TERMINATION','ACTIVE','TERMINATION_REVIEW'),
  ('SM-VENDOR-CONTRACT-V1','EVT-CONTRACT-REQUEST-TERMINATION','CHANGE_PENDING','TERMINATION_REVIEW'),
  ('SM-VENDOR-CONTRACT-V1','EVT-CONTRACT-TERMINATE','TERMINATION_REVIEW','TERMINATED'),
  ('SM-DELIVERABLE-V1','EVT-DELIVERABLE-DEFINE',null,'EXPECTED'),
  ('SM-WARRANTY-V1','EVT-WARRANTY-OPEN',null,'OPEN')
on conflict do nothing;

create table public.vendor_contract (
  id uuid primary key,
  contract_no text not null unique check(length(contract_no) between 1 and 80),
  vendor_id uuid not null references public.vendor(id),
  manager_user_id uuid not null references public.user_account(id),
  title text not null check(length(title) between 1 and 300),
  state text not null check(state in ('DRAFT','INTERNAL_REVIEW','NEGOTIATION','APPROVAL_PENDING','SIGNED','ACTIVE','CHANGE_PENDING','PERFORMANCE_COMPLETE','CLOSING','CLOSED','TERMINATION_REVIEW','TERMINATED')),
  current_signed_version_id uuid,
  current_signed_version_no bigint,
  version_no bigint not null default 1 check(version_no>0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(id,vendor_id),
  check((current_signed_version_id is null)=(current_signed_version_no is null))
);

create table public.contract_version (
  id uuid primary key,
  contract_id uuid not null references public.vendor_contract(id),
  version_no bigint not null check(version_no>0),
  version_kind text not null check(version_kind in ('ORIGINAL','AMENDMENT')),
  prior_version_id uuid unique references public.contract_version(id),
  statement_of_work_document_version_id uuid not null references public.document_version(id),
  requirements_document_version_id uuid not null references public.document_version(id),
  effective_from date not null,
  effective_to date,
  total_burden_amount numeric(20,2) not null check(total_burden_amount>=0),
  currency char(3) not null check(currency ~ '^[A-Z]{3}$'),
  vat_included boolean not null check(vat_included),
  intellectual_property_terms_code text not null check(app_private.is_stable_code(intellectual_property_terms_code)),
  security_terms_code text not null check(app_private.is_stable_code(security_terms_code)),
  warranty_terms_code text not null check(app_private.is_stable_code(warranty_terms_code)),
  liability_terms_code text not null check(app_private.is_stable_code(liability_terms_code)),
  delay_damages_rate numeric(9,6) check(delay_damages_rate is null or delay_damages_rate>=0),
  liability_limit_amount numeric(20,2) check(liability_limit_amount is null or liability_limit_amount>=0),
  terms_text text not null check(length(terms_text) between 1 and 20000),
  preset_policy_id text not null check(app_private.is_stable_code(preset_policy_id)),
  preset_policy_version bigint not null check(preset_policy_version>0),
  legal_baseline_id text not null check(app_private.is_stable_code(legal_baseline_id)),
  legal_baseline_version bigint not null check(legal_baseline_version>0),
  override_applied boolean not null,
  override_reason text,
  state text not null check(state in ('DRAFT','SEALED','SIGNED','SUPERSEDED')),
  sealed_snapshot_checksum text check(sealed_snapshot_checksum is null or app_private.is_sha256(sealed_snapshot_checksum)),
  sealed_at timestamptz,
  signed_at timestamptz,
  created_by_user_id uuid not null references public.user_account(id),
  created_at timestamptz not null,
  unique(contract_id,version_no),
  unique(id,contract_id,version_no,sealed_snapshot_checksum,sealed_at),
  check(effective_to is null or effective_to>=effective_from),
  check((sealed_snapshot_checksum is null)=(sealed_at is null)),
  check(not override_applied or nullif(btrim(override_reason),'') is not null),
  check((state='DRAFT' and sealed_at is null and signed_at is null) or
        (state='SEALED' and sealed_at is not null and signed_at is null) or
        (state in ('SIGNED','SUPERSEDED') and sealed_at is not null and signed_at is not null))
);

alter table public.vendor_contract add constraint vendor_contract_signed_head_fk
  foreign key(current_signed_version_id,id,current_signed_version_no)
  references public.contract_version(id,contract_id,version_no)
  deferrable initially deferred;

create table public.contract_version_legal_check_item (
  contract_version_id uuid not null references public.contract_version(id),
  check_code text not null check(app_private.is_stable_code(check_code)),
  source_citation text not null check(length(source_citation) between 1 and 1000),
  result text not null check(result in ('CONFIRMED','NOT_APPLICABLE','REQUIRES_COUNSEL')),
  checked_by_user_id uuid not null references public.user_account(id),
  checked_at timestamptz not null,
  primary key(contract_version_id,check_code)
);

create table public.contract_signature_evidence (
  id uuid primary key,
  contract_version_id uuid not null unique references public.contract_version(id),
  approval_instance_id uuid not null unique references public.approval_instance(id),
  signature_method_code text not null check(app_private.is_stable_code(signature_method_code)),
  signed_attachment_id uuid references public.attachment(id),
  signature_checksum text not null check(app_private.is_sha256(signature_checksum)),
  signed_by_user_id uuid not null references public.user_account(id),
  signed_at timestamptz not null
);

create table public.contract_project (
  id uuid primary key,
  contract_id uuid not null references public.vendor_contract(id),
  project_id uuid not null references public.project(id),
  valid_from date not null,
  valid_to date,
  unique(contract_id,project_id),
  check(valid_to is null or valid_to>=valid_from)
);

create table public.contract_milestone (
  id uuid primary key,
  contract_version_id uuid not null references public.contract_version(id),
  sequence_no integer not null check(sequence_no>0),
  milestone_code text not null check(app_private.is_stable_code(milestone_code)),
  title text not null check(length(title) between 1 and 300),
  due_date date,
  planned_amount numeric(20,2) not null check(planned_amount>=0),
  planned_ratio numeric(7,4) not null check(planned_ratio>=0 and planned_ratio<=100),
  currency char(3) not null check(currency ~ '^[A-Z]{3}$'),
  unique(contract_version_id,sequence_no),
  unique(contract_version_id,milestone_code)
);

create table public.deliverable (
  id uuid primary key,
  contract_id uuid not null references public.vendor_contract(id),
  contract_milestone_id uuid references public.contract_milestone(id),
  deliverable_code text not null,
  title text not null check(length(title) between 1 and 300),
  assigned_vendor_id uuid not null references public.vendor(id),
  state text not null check(state in ('EXPECTED','IN_PROGRESS','SUBMITTED','UNDER_REVIEW','CORRECTION_REQUIRED','ACCEPTED','REJECTED','SUPERSEDED','CANCELLED')),
  version_no bigint not null default 1 check(version_no>0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(contract_id,deliverable_code),
  unique(id,contract_id)
);

create table public.deliverable_version (
  id uuid primary key,
  deliverable_id uuid not null references public.deliverable(id),
  version_no bigint not null check(version_no>0),
  manifest_checksum text not null check(app_private.is_sha256(manifest_checksum)),
  submitter_user_id uuid not null references public.user_account(id),
  created_at timestamptz not null,
  unique(deliverable_id,version_no),
  unique(id,deliverable_id,version_no,manifest_checksum)
);

create table public.deliverable_manifest_entry (
  id uuid primary key,
  deliverable_version_id uuid not null references public.deliverable_version(id),
  sequence_no integer not null check(sequence_no>0),
  attachment_id uuid not null references public.attachment(id),
  content_checksum text not null check(app_private.is_sha256(content_checksum)),
  evidence_type_code text not null check(app_private.is_stable_code(evidence_type_code)),
  unique(deliverable_version_id,sequence_no),
  unique(deliverable_version_id,attachment_id)
);

create table public.guarantee (
  id uuid primary key,
  contract_id uuid not null references public.vendor_contract(id),
  guarantee_type_code text not null check(app_private.is_stable_code(guarantee_type_code)),
  issuer_name text not null,
  instrument_no text not null,
  amount numeric(20,2) not null check(amount>=0),
  currency char(3) not null check(currency ~ '^[A-Z]{3}$'),
  valid_from date not null,
  valid_to date not null,
  state text not null check(state in ('DRAFT','ACTIVE','CLAIM_REVIEW','CLAIMED','RELEASE_PENDING','RELEASED','EXPIRED','CANCELLED')),
  version_no bigint not null default 1 check(version_no>0),
  check(valid_to>=valid_from)
);

create table public.warranty_issue (
  id uuid primary key,
  contract_id uuid not null references public.vendor_contract(id),
  deliverable_id uuid references public.deliverable(id),
  issue_code text not null,
  summary text not null check(length(summary) between 1 and 2000),
  discovered_at timestamptz not null,
  responsibility_state text not null check(responsibility_state in ('UNASSESSED','VENDOR_RESPONSIBLE','COMPANY_RESPONSIBLE','SHARED','DISPUTED')),
  state text not null check(state in ('OPEN','VENDOR_NOTIFIED','PLAN_PENDING','REMEDIATION','VERIFICATION','RESOLVED','REOPENED','CLAIM_REVIEW','CLOSED')),
  acceptance_does_not_waive_responsibility boolean not null default true check(acceptance_does_not_waive_responsibility),
  payment_does_not_waive_responsibility boolean not null default true check(payment_does_not_waive_responsibility),
  version_no bigint not null default 1 check(version_no>0),
  unique(contract_id,issue_code)
);

create table public.contract_vendor_grant (
  id uuid primary key default extensions.gen_random_uuid(),
  contract_id uuid not null,
  project_id uuid not null,
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
  foreign key(contract_id,project_id) references public.contract_project(contract_id,project_id),
  check(valid_until is null or valid_until>valid_from),
  check((revoked_at is null)=(revoked_by_user_id is null))
);
create unique index contract_vendor_grant_active_unique on public.contract_vendor_grant(contract_id,project_id,vendor_user_id)
  where status='ACTIVE' and revoked_at is null;

create table public.contract_vendor_grant_action (
  grant_id uuid not null references public.contract_vendor_grant(id),
  permission_id uuid not null references public.permission(id),
  primary key(grant_id,permission_id)
);

alter table public.approval_subject_binding drop constraint approval_subject_binding_subject_kind_check;
alter table public.approval_subject_binding add constraint approval_subject_binding_subject_kind_check
  check(subject_kind in ('APPROVAL_POLICY_VERSION','DOCUMENT_VERSION','RESEARCH_PROJECT_APPLICATION','CONTRACT_VERSION'));

create table public.approval_subject_contract_version (
  instance_id uuid primary key references public.approval_instance(id),
  subject_kind text not null default 'CONTRACT_VERSION' check(subject_kind='CONTRACT_VERSION'),
  contract_version_id uuid not null,
  contract_id uuid not null,
  subject_version_no bigint not null check(subject_version_no>0),
  subject_checksum text not null check(app_private.is_sha256(subject_checksum)),
  subject_sealed_at timestamptz not null,
  unique(contract_version_id,instance_id),
  unique(instance_id,contract_version_id,subject_version_no,subject_checksum),
  foreign key(instance_id,subject_kind) references public.approval_subject_binding(instance_id,subject_kind) deferrable initially deferred,
  foreign key(contract_version_id,contract_id,subject_version_no,subject_checksum,subject_sealed_at)
    references public.contract_version(id,contract_id,version_no,sealed_snapshot_checksum,sealed_at)
);

create trigger approval_contract_subject_bind before insert on public.approval_subject_contract_version
  for each row execute function app_private.bind_approval_subject();

create or replace function app_private.assert_exactly_one_approval_subject()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare target_instance uuid:=coalesce(new.instance_id,old.instance_id); subject_count integer; begin
  select (select count(*) from public.approval_subject_policy_version p where p.instance_id=target_instance)
    +(select count(*) from public.approval_subject_document_version d where d.instance_id=target_instance)
    +(select count(*) from public.approval_subject_research_project_application r where r.instance_id=target_instance)
    +(select count(*) from public.approval_subject_contract_version c where c.instance_id=target_instance) into subject_count;
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
  union all
  select 'CONTRACT_VERSION',l.contract_version_id,l.subject_version_no,l.subject_checksum,v.state
  from public.approval_subject_contract_version l join public.contract_version v on v.id=l.contract_version_id and v.contract_id=l.contract_id
  where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.sealed_snapshot_checksum=l.subject_checksum and v.sealed_at=l.subject_sealed_at
$$;

create or replace function app_private.m07_assert_direct_internal(target_occurred_at timestamptz,target_permission text)
returns void language plpgsql stable security definer set search_path=pg_catalog,public,app_private
as $$ begin
  if target_occurred_at is distinct from app_private.request_time()
    or app_private.required_setting('app.actor_kind')<>'USER'
    or app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id()
    or app_private.current_acting_authority_id() is not null
    or not exists(select 1 from public.user_account u where u.id=app_private.current_actor_user_id()
      and u.account_kind='INTERNAL' and u.status='ACTIVE' and u.valid_from<=target_occurred_at
      and (u.valid_until is null or u.valid_until>target_occurred_at))
    or not app_private.actor_has_permission(target_permission,target_occurred_at) then
    raise exception 'active authorized direct internal actor required' using errcode='42501';
  end if;
end $$;

create or replace function app_private.actor_has_contract_internal_scope(target_contract_id uuid,target_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$ select exists(select 1 from public.vendor_contract c where c.id=target_contract_id and
  (c.manager_user_id=app_private.current_effective_actor_user_id() or exists(select 1 from public.contract_project cp
    where cp.contract_id=c.id and app_private.actor_has_project_internal_scope(cp.project_id,target_time)))) $$;

create or replace function app_private.actor_has_contract_vendor_scope(target_contract_id uuid,target_action text,target_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$ select exists(
  select 1 from public.contract_vendor_grant g
  join public.vendor_contract c on c.id=g.contract_id
  join public.vendor_user vu on vu.id=g.vendor_user_id and vu.vendor_id=c.vendor_id
  join public.contract_vendor_grant_action ga on ga.grant_id=g.id
  join public.permission p on p.id=ga.permission_id and p.stable_code=target_action and p.status='ACTIVE'
  where g.contract_id=target_contract_id and g.status='ACTIVE' and g.revoked_at is null
    and g.valid_from<=target_time and (g.valid_until is null or g.valid_until>target_time)
    and app_private.actor_has_vendor_membership(vu.id,c.vendor_id,target_time)
) $$;

create or replace function app_private.guard_contract_grant_vendor()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  if not exists(select 1 from public.vendor_contract c join public.vendor_user vu on vu.id=new.vendor_user_id
    join public.vendor v on v.id=vu.vendor_id and v.status='ACTIVE'
    where c.id=new.contract_id and vu.vendor_id=c.vendor_id and vu.status='ACTIVE' and vu.revoked_at is null
      and vu.valid_from<=new.valid_from and (vu.valid_until is null or vu.valid_until>new.valid_from)) then
    raise exception 'ContractScope requires exact active VendorMembership for Contract Vendor' using errcode='23514';
  end if;
  return new;
end $$;
create trigger contract_vendor_grant_vendor_guard before insert or update on public.contract_vendor_grant
  for each row execute function app_private.guard_contract_grant_vendor();

create or replace function app_private.guard_contract_version_lineage()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare prior_row public.contract_version%rowtype; begin
  if new.version_kind='ORIGINAL' and (new.version_no<>1 or new.prior_version_id is not null) then
    raise exception 'original ContractVersion must be version 1 without predecessor' using errcode='23514';
  elsif new.version_kind='AMENDMENT' then
    select * into strict prior_row from public.contract_version where id=new.prior_version_id;
    if prior_row.contract_id<>new.contract_id or prior_row.version_no>=new.version_no or prior_row.state not in ('SIGNED','SUPERSEDED') then
      raise exception 'amendment requires a strictly older signed same-contract predecessor' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
create trigger contract_version_lineage_guard before insert on public.contract_version
  for each row execute function app_private.guard_contract_version_lineage();

create or replace function app_private.protect_contract_version()
returns trigger language plpgsql set search_path=pg_catalog,app_private
as $$ begin
  if tg_op='DELETE' then raise exception 'ContractVersion is retained' using errcode='55000'; end if;
  if old.state='SEALED' and new.state='SIGNED'
    and app_private.optional_setting('app.contract_sign_command_version')=old.id::text
    and new.id=old.id and new.contract_id=old.contract_id and new.version_no=old.version_no
    and new.sealed_snapshot_checksum=old.sealed_snapshot_checksum and new.sealed_at=old.sealed_at
    and new.signed_at is not null then return new; end if;
  if old.state<>'DRAFT' then raise exception 'sealed or signed ContractVersion is immutable' using errcode='55000'; end if;
  if new.id<>old.id or new.contract_id<>old.contract_id or new.version_no<>old.version_no then
    raise exception 'ContractVersion identity is immutable' using errcode='55000';
  end if;
  return new;
end $$;
create trigger contract_version_immutable before update or delete on public.contract_version
  for each row execute function app_private.protect_contract_version();

create or replace function app_private.protect_contract_child_after_seal()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare owner_version uuid:=coalesce(new.contract_version_id,old.contract_version_id); begin
  if exists(select 1 from public.contract_version v where v.id=owner_version and v.state<>'DRAFT') then
    raise exception 'sealed ContractVersion children are immutable' using errcode='55000';
  end if;
  return coalesce(new,old);
end $$;
create trigger contract_legal_check_immutable before insert or update or delete on public.contract_version_legal_check_item for each row execute function app_private.protect_contract_child_after_seal();
create trigger contract_milestone_immutable before insert or update or delete on public.contract_milestone for each row execute function app_private.protect_contract_child_after_seal();

create or replace function app_private.guard_contract_subject_active()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  perform pg_advisory_xact_lock(hashtextextended(new.contract_version_id::text,0));
  if exists(select 1 from public.approval_subject_contract_version l join public.approval_instance i on i.id=l.instance_id
    where l.contract_version_id=new.contract_version_id and i.state not in ('REJECTED','RECALLED','CANCELLED')) then
    raise exception 'exact ContractVersion already has an active approval generation' using errcode='23505';
  end if;
  return new;
end $$;
create trigger approval_contract_subject_active_guard before insert on public.approval_subject_contract_version
  for each row execute function app_private.guard_contract_subject_active();

create or replace function app_private.reject_contract_subject_mutation()
returns trigger language plpgsql set search_path=pg_catalog
as $$ begin raise exception 'ContractVersion approval subject is immutable' using errcode='55000'; end $$;
create trigger approval_contract_subject_immutable before update or delete on public.approval_subject_contract_version
  for each row execute function app_private.reject_contract_subject_mutation();

create or replace function app_private.guard_contract_approval_action_path()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  if new.event_id in ('REVIEW','AGREE','APPROVE','REJECT','REFERENCE_RECEIPT','REQUEST_RECALL','RECALL')
    and exists(select 1 from public.approval_subject_contract_version c where c.instance_id=new.instance_id)
    and app_private.optional_setting('app.contract_approval_command_instance') is distinct from new.instance_id::text then
    raise exception 'ContractVersion approval actions require the typed contract command path' using errcode='42501';
  end if;
  return new;
end $$;
create trigger approval_action_contract_path_guard before insert on public.approval_action
  for each row execute function app_private.guard_contract_approval_action_path();

create or replace function app_private.append_m07_transition(
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_action text,target_contract_id uuid,
  target_event text,target_outbox_event text,target_from_state text,target_to_state text,target_from_version bigint,
  target_to_version bigint,target_reason text,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.append_audit(target_audit_id,target_action,'VENDOR_CONTRACT',target_contract_id,target_to_version,'SUCCEEDED',coalesce(target_reason,target_event),null,null,null,null,target_occurred_at);
  perform app_private.append_state_transition(target_transition_id,target_audit_id,'VENDOR_CONTRACT',target_contract_id,'SM-VENDOR-CONTRACT-V1',target_event,
    target_from_state,target_to_state,target_from_version,target_to_version,coalesce(target_reason,target_event),null,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),target_occurred_at);
  perform app_private.enqueue_outbox(target_outbox_id,target_audit_id,target_outbox_event,'VENDOR_CONTRACT',target_contract_id,target_to_version,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),'CONTRACT_EVENT_REF',1,
    jsonb_build_object('contractId',target_contract_id,'resourceVersion',target_to_version,'state',target_to_state),
    'contract:'||target_contract_id::text||':'||target_to_version::text,target_occurred_at,target_occurred_at);
end $$;

create or replace function app_private.m07_assert_approval_worker(target_occurred_at timestamptz)
returns void language plpgsql stable security definer set search_path=pg_catalog,app_private
as $$ begin
  if target_occurred_at is distinct from app_private.request_time()
    or app_private.required_setting('app.actor_kind')<>'SYSTEM'
    or app_private.required_setting('app.system_actor_id')<>'APPROVAL_ENGINE'
    or app_private.optional_setting('app.actor_user_id') is not null
    or app_private.optional_setting('app.effective_actor_user_id') is not null then
    raise exception 'trusted Approval worker context required' using errcode='42501';
  end if;
end $$;

create or replace function public.create_vendor_contract(
  target_contract_id uuid,target_contract_no text,target_vendor_id uuid,target_title text,target_manager_user_id uuid,
  target_project_id uuid,target_valid_from date,target_valid_to date,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.m07_assert_direct_internal(target_occurred_at,'contract.record.create');
  if target_manager_user_id<>app_private.current_effective_actor_user_id() or not app_private.actor_can_edit_project(target_project_id,target_occurred_at)
    or not exists(select 1 from public.vendor v where v.id=target_vendor_id and v.status='ACTIVE') then
    raise exception 'exact active Vendor, manager and Project scope required' using errcode='42501';
  end if;
  insert into public.vendor_contract(id,contract_no,vendor_id,manager_user_id,title,state,created_at,updated_at)
    values(target_contract_id,target_contract_no,target_vendor_id,target_manager_user_id,target_title,'DRAFT',target_occurred_at,target_occurred_at);
  insert into public.contract_project(id,contract_id,project_id,valid_from,valid_to)
    values(extensions.gen_random_uuid(),target_contract_id,target_project_id,target_valid_from,target_valid_to);
  perform app_private.append_m07_transition(target_audit_id,target_transition_id,target_outbox_id,'contract.record.create',target_contract_id,
    'EVT-CONTRACT-CREATE','EVT-CONTRACT-CREATED',null,'DRAFT',0,1,'CONTRACT-CREATED',target_occurred_at);
  return 1;
end $$;

create or replace function public.seal_contract_version(
  target_contract_version_id uuid,target_expected_state text,target_checksum text,target_audit_id uuid,target_occurred_at timestamptz
) returns text language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare version_row public.contract_version%rowtype; amount_sum numeric; ratio_sum numeric; begin
  perform app_private.m07_assert_direct_internal(target_occurred_at,'contract.record.update');
  select * into strict version_row from public.contract_version where id=target_contract_version_id for update;
  if target_expected_state<>'DRAFT' or version_row.state<>'DRAFT' or not app_private.actor_has_contract_internal_scope(version_row.contract_id,target_occurred_at)
    or not app_private.is_sha256(target_checksum) then raise exception 'exact editable draft ContractVersion required' using errcode='23514'; end if;
  select coalesce(sum(planned_amount),0),coalesce(sum(planned_ratio),0) into amount_sum,ratio_sum
    from public.contract_milestone where contract_version_id=target_contract_version_id;
  if amount_sum<>version_row.total_burden_amount or ratio_sum<>100 then raise exception 'milestones must total exact VAT-inclusive burden and 100 percent' using errcode='23514'; end if;
  if not exists(select 1 from public.contract_version_legal_check_item where contract_version_id=target_contract_version_id)
    then raise exception 'versioned legal checklist is required' using errcode='23514'; end if;
  update public.contract_version set state='SEALED',sealed_snapshot_checksum=target_checksum,sealed_at=target_occurred_at where id=target_contract_version_id;
  perform app_private.append_audit(target_audit_id,'contract.version.seal','CONTRACT_VERSION',target_contract_version_id,version_row.version_no,'SUCCEEDED','CONTRACT-VERSION-SEALED',null,null,target_checksum,null,target_occurred_at);
  return target_checksum;
end $$;

create or replace function public.bind_contract_approval_subject(
  target_instance_id uuid,target_contract_version_id uuid,target_audit_id uuid,target_occurred_at timestamptz
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare version_row public.contract_version%rowtype; begin
  perform app_private.m07_assert_direct_internal(target_occurred_at,'contract.record.update');
  select * into strict version_row from public.contract_version where id=target_contract_version_id;
  if version_row.state<>'SEALED' or not app_private.actor_has_contract_internal_scope(version_row.contract_id,target_occurred_at)
    or not exists(select 1 from public.approval_instance i where i.id=target_instance_id and i.submitter_user_id=app_private.current_effective_actor_user_id() and i.state='DRAFT')
    then raise exception 'exact sealed ContractVersion and owned draft Approval required' using errcode='42501'; end if;
  insert into public.approval_subject_contract_version(instance_id,contract_version_id,contract_id,subject_version_no,subject_checksum,subject_sealed_at)
    values(target_instance_id,version_row.id,version_row.contract_id,version_row.version_no,version_row.sealed_snapshot_checksum,version_row.sealed_at);
  perform app_private.append_audit(target_audit_id,'contract.approval.bind','CONTRACT_VERSION',version_row.id,version_row.version_no,'SUCCEEDED','CONTRACT-APPROVAL-SUBJECT-BOUND',null,null,version_row.sealed_snapshot_checksum,null,target_occurred_at);
  return target_instance_id;
end $$;

create or replace function public.record_signed_contract_version(
  target_contract_version_id uuid,target_approval_instance_id uuid,target_signature_evidence_id uuid,target_signature_method_code text,
  target_signed_attachment_id uuid,target_signature_checksum text,target_signed_by_user_id uuid,target_expected_contract_version bigint,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare version_row public.contract_version%rowtype; contract_row public.vendor_contract%rowtype; next_version bigint; begin
  perform app_private.m07_assert_approval_worker(target_occurred_at);
  select * into strict version_row from public.contract_version where id=target_contract_version_id for update;
  select * into strict contract_row from public.vendor_contract where id=version_row.contract_id for update;
  next_version:=app_private.next_version(contract_row.version_no,target_expected_contract_version);
  if version_row.state<>'SEALED' or contract_row.state<>'APPROVAL_PENDING'
    or not app_private.is_sha256(target_signature_checksum)
    or not exists(select 1 from public.approval_instance i join public.approval_subject_contract_version s on s.instance_id=i.id
      where i.id=target_approval_instance_id and i.state='COMPLETED' and s.contract_version_id=version_row.id
        and s.contract_id=version_row.contract_id and s.subject_version_no=version_row.version_no
        and s.subject_checksum=version_row.sealed_snapshot_checksum and s.subject_sealed_at=version_row.sealed_at)
    or not exists(select 1 from public.user_account u where u.id=target_signed_by_user_id and u.account_kind='INTERNAL'
      and u.status='ACTIVE' and u.valid_from<=target_occurred_at and (u.valid_until is null or u.valid_until>target_occurred_at)) then
    raise exception 'exact completed approval, sealed ContractVersion and active signatory required' using errcode='23514';
  end if;
  insert into public.contract_signature_evidence(id,contract_version_id,approval_instance_id,signature_method_code,signed_attachment_id,
    signature_checksum,signed_by_user_id,signed_at) values(target_signature_evidence_id,version_row.id,target_approval_instance_id,
    target_signature_method_code,target_signed_attachment_id,target_signature_checksum,target_signed_by_user_id,target_occurred_at);
  perform set_config('app.contract_sign_command_version',version_row.id::text,true);
  update public.contract_version set state='SIGNED',signed_at=target_occurred_at where id=version_row.id;
  update public.vendor_contract set state='SIGNED',current_signed_version_id=version_row.id,current_signed_version_no=version_row.version_no,
    version_no=next_version,updated_at=target_occurred_at where id=contract_row.id;
  perform app_private.append_m07_transition(target_audit_id,target_transition_id,target_outbox_id,'contract.version.sign',contract_row.id,
    'EVT-CONTRACT-APPROVED-SIGNED','EVT-CONTRACT-SIGNED','APPROVAL_PENDING','SIGNED',contract_row.version_no,next_version,'CONTRACT-EXACT-VERSION-SIGNED',target_occurred_at);
  return next_version;
end $$;

create or replace function public.activate_vendor_contract(
  target_contract_id uuid,target_expected_version bigint,target_signed_version_id uuid,target_vendor_user_ids uuid[],
  target_valid_until timestamptz,target_reason text,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare contract_row public.vendor_contract%rowtype; signed_row public.contract_version%rowtype; next_version bigint; vendor_user_id uuid; project_row record; grant_row_id uuid; permission_row uuid; begin
  perform app_private.m07_assert_direct_internal(target_occurred_at,'contract.scope.manage');
  select * into strict contract_row from public.vendor_contract where id=target_contract_id for update;
  next_version:=app_private.next_version(contract_row.version_no,target_expected_version);
  select * into strict signed_row from public.contract_version where id=target_signed_version_id and contract_id=target_contract_id;
  if contract_row.state<>'SIGNED' or signed_row.state<>'SIGNED' or signed_row.version_no<>contract_row.current_signed_version_no
    or signed_row.id<>contract_row.current_signed_version_id or not app_private.actor_has_contract_internal_scope(target_contract_id,target_occurred_at)
    or cardinality(target_vendor_user_ids)=0 then raise exception 'exact signed ContractVersion, scope and Vendor memberships required' using errcode='23514'; end if;
  foreach vendor_user_id in array target_vendor_user_ids loop
    if not exists(select 1 from public.vendor_user vu join public.vendor v on v.id=vu.vendor_id and v.status='ACTIVE'
      where vu.id=vendor_user_id and vu.vendor_id=contract_row.vendor_id and vu.status='ACTIVE' and vu.revoked_at is null
        and vu.valid_from<=target_occurred_at and (vu.valid_until is null or vu.valid_until>target_occurred_at)) then
      raise exception 'inactive or cross-Vendor membership cannot receive ContractScope' using errcode='42501';
    end if;
    for project_row in select project_id from public.contract_project where contract_id=target_contract_id loop
      grant_row_id:=extensions.gen_random_uuid();
      insert into public.contract_vendor_grant(id,contract_id,project_id,vendor_user_id,status,valid_from,valid_until,granted_by_user_id,grant_reason_code)
        values(grant_row_id,target_contract_id,project_row.project_id,vendor_user_id,'ACTIVE',target_occurred_at,target_valid_until,
          app_private.current_effective_actor_user_id(),coalesce(target_reason,'CONTRACT-ACTIVATED'));
      foreach permission_row in array array['37000000-0000-4000-8000-000000000003'::uuid,'37000000-0000-4000-8000-000000000004'::uuid] loop
        insert into public.contract_vendor_grant_action(grant_id,permission_id) values(grant_row_id,permission_row);
      end loop;
    end loop;
  end loop;
  update public.vendor_contract set state='ACTIVE',version_no=next_version,updated_at=target_occurred_at where id=target_contract_id;
  perform app_private.append_m07_transition(target_audit_id,target_transition_id,target_outbox_id,'contract.lifecycle.transition',target_contract_id,
    'EVT-CONTRACT-ACTIVATE','EVT-CONTRACT-ACTIVATED','SIGNED','ACTIVE',contract_row.version_no,next_version,target_reason,target_occurred_at);
  return next_version;
end $$;

create or replace function public.grant_contract_vendor_finance_scope(
  target_contract_id uuid,target_vendor_user_id uuid,target_reason text,target_audit_id uuid,target_occurred_at timestamptz
) returns integer language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare changed integer; begin
  perform app_private.m07_assert_direct_internal(target_occurred_at,'contract.scope.manage');
  if not app_private.actor_has_contract_internal_scope(target_contract_id,target_occurred_at) then raise exception 'Contract scope required' using errcode='42501'; end if;
  insert into public.contract_vendor_grant_action(grant_id,permission_id)
  select g.id,'37000000-0000-4000-8000-000000000005'::uuid from public.contract_vendor_grant g
  where g.contract_id=target_contract_id and g.vendor_user_id=target_vendor_user_id and g.status='ACTIVE' and g.revoked_at is null
  on conflict do nothing;
  get diagnostics changed=row_count;
  if changed=0 then raise exception 'active exact ContractScope required for finance projection' using errcode='42501'; end if;
  perform app_private.append_audit(target_audit_id,'contract.scope.issue','VENDOR_CONTRACT',target_contract_id,null,'SUCCEEDED',coalesce(target_reason,'CONTRACT-FINANCE-SCOPE-ISSUED'),null,null,null,null,target_occurred_at);
  return changed;
end $$;

create or replace function public.transition_vendor_contract_and_revoke_scope(
  target_contract_id uuid,target_event text,target_expected_version bigint,target_reason text,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare contract_row public.vendor_contract%rowtype; next_state text; next_version bigint; outbox_event text; begin
  perform app_private.m07_assert_direct_internal(target_occurred_at,'contract.scope.manage');
  select * into strict contract_row from public.vendor_contract where id=target_contract_id for update;
  next_state:=case
    when target_event='EVT-CONTRACT-BEGIN-CLOSE' and contract_row.state='PERFORMANCE_COMPLETE' then 'CLOSING'
    when target_event='EVT-CONTRACT-CLOSE' and contract_row.state='CLOSING' then 'CLOSED'
    when target_event='EVT-CONTRACT-REQUEST-TERMINATION' and contract_row.state in ('ACTIVE','CHANGE_PENDING') then 'TERMINATION_REVIEW'
    when target_event='EVT-CONTRACT-TERMINATE' and contract_row.state='TERMINATION_REVIEW' then 'TERMINATED'
    else null end;
  if next_state is null or not app_private.actor_has_contract_internal_scope(target_contract_id,target_occurred_at) then raise exception 'invalid Contract transition or scope' using errcode='23514'; end if;
  next_version:=app_private.next_version(contract_row.version_no,target_expected_version);
  if next_state in ('CLOSED','TERMINATED') then
    update public.contract_vendor_grant set status='REVOKED',revoked_at=target_occurred_at,revoked_by_user_id=app_private.current_effective_actor_user_id(),
      revoke_reason_code=coalesce(target_reason,next_state),version_no=version_no+1 where contract_id=target_contract_id and status='ACTIVE' and revoked_at is null;
  end if;
  update public.vendor_contract set state=next_state,version_no=next_version,updated_at=target_occurred_at where id=target_contract_id;
  outbox_event:=case next_state when 'CLOSING' then 'EVT-CONTRACT-CLOSE-STARTED' when 'CLOSED' then 'EVT-CONTRACT-CLOSED'
    when 'TERMINATION_REVIEW' then 'EVT-CONTRACT-TERMINATION-REQUESTED' else 'EVT-CONTRACT-TERMINATED' end;
  perform app_private.append_m07_transition(target_audit_id,target_transition_id,target_outbox_id,'contract.lifecycle.transition',target_contract_id,
    target_event,outbox_event,contract_row.state,next_state,contract_row.version_no,next_version,target_reason,target_occurred_at);
  return next_version;
end $$;

create or replace function public.read_vendor_contract_list_safe(target_occurred_at timestamptz)
returns table(contract_id uuid,contract_no text,vendor_id uuid,vendor_name text,title text,state text,project_ids uuid[],current_version_no bigint,resource_version bigint)
language sql stable security definer set search_path=pg_catalog,public,app_private
as $$ select c.id,c.contract_no,c.vendor_id,v.legal_name,c.title,c.state,array_agg(distinct g.project_id),c.current_signed_version_no,c.version_no
  from public.vendor_contract c join public.vendor v on v.id=c.vendor_id join public.contract_vendor_grant g on g.contract_id=c.id
  where target_occurred_at=app_private.request_time() and app_private.actor_has_contract_vendor_scope(c.id,'contract.list.read',target_occurred_at)
  group by c.id,v.legal_name $$;

comment on function public.read_vendor_contract_list_safe(timestamptz) is
  'CONTRACT_LIST_VENDOR_V1: contains no amount, currency, payment, guarantee amount, internal evaluation or risk fields.';

create or replace function public.read_vendor_contract_basic(target_contract_id uuid,target_occurred_at timestamptz)
returns table(contract_id uuid,contract_no text,vendor_id uuid,vendor_name text,title text,state text,effective_from date,effective_to date,project_ids uuid[],current_version_no bigint,resource_version bigint)
language sql stable security definer set search_path=pg_catalog,public,app_private
as $$ select c.id,c.contract_no,c.vendor_id,v.legal_name,c.title,c.state,cv.effective_from,cv.effective_to,
  array(select cp.project_id from public.contract_project cp where cp.contract_id=c.id order by cp.project_id),c.current_signed_version_no,c.version_no
  from public.vendor_contract c join public.vendor v on v.id=c.vendor_id left join public.contract_version cv on cv.id=c.current_signed_version_id
  where c.id=target_contract_id and target_occurred_at=app_private.request_time() and
    (app_private.actor_has_contract_internal_scope(c.id,target_occurred_at) or app_private.actor_has_contract_vendor_scope(c.id,'contract.detail.read',target_occurred_at)) $$;

create or replace function public.read_vendor_contract_finance(target_contract_id uuid,target_occurred_at timestamptz)
returns table(contract_id uuid,contract_version_id uuid,total_burden_amount numeric,currency character,preset_policy_id text,preset_policy_version bigint,
  legal_baseline_id text,legal_baseline_version bigint,override_applied boolean,override_reason text)
language sql stable security definer set search_path=pg_catalog,public,app_private
as $$ select c.id,cv.id,cv.total_burden_amount,cv.currency,cv.preset_policy_id,cv.preset_policy_version,cv.legal_baseline_id,cv.legal_baseline_version,cv.override_applied,cv.override_reason
  from public.vendor_contract c join public.contract_version cv on cv.id=c.current_signed_version_id
  where c.id=target_contract_id and target_occurred_at=app_private.request_time() and
    ((app_private.actor_has_contract_internal_scope(c.id,target_occurred_at) and app_private.actor_has_permission('contract.detail.finance.read',target_occurred_at))
      or app_private.actor_has_contract_vendor_scope(c.id,'contract.detail.finance.read',target_occurred_at)) $$;

-- Base tables remain inaccessible to Vendor request roles. Only explicit projections are executable.
do $rls$ declare table_name text; begin
  foreach table_name in array array['vendor_contract','contract_version','contract_version_legal_check_item','contract_signature_evidence','contract_project','contract_milestone','deliverable','deliverable_version','deliverable_manifest_entry','guarantee','warranty_issue','contract_vendor_grant','contract_vendor_grant_action','approval_subject_contract_version'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
  end loop;
end $rls$;

create policy vendor_contract_internal_read on public.vendor_contract for select to youone_request using(app_private.actor_has_contract_internal_scope(id,app_private.request_time()));
create policy contract_version_internal_read on public.contract_version for select to youone_request using(app_private.actor_has_contract_internal_scope(contract_id,app_private.request_time()));
create policy contract_project_internal_read on public.contract_project for select to youone_request using(app_private.actor_has_contract_internal_scope(contract_id,app_private.request_time()));
create policy contract_milestone_internal_read on public.contract_milestone for select to youone_request using(exists(select 1 from public.contract_version v where v.id=contract_version_id and app_private.actor_has_contract_internal_scope(v.contract_id,app_private.request_time())));
create policy deliverable_internal_read on public.deliverable for select to youone_request using(app_private.actor_has_contract_internal_scope(contract_id,app_private.request_time()));
create policy approval_contract_subject_participant_read on public.approval_subject_contract_version for select to youone_request using(app_private.can_read_approval_instance(instance_id,app_private.request_time()));

revoke all on public.vendor_contract,public.contract_version,public.contract_version_legal_check_item,public.contract_signature_evidence,
  public.contract_project,public.contract_milestone,public.deliverable,public.deliverable_version,public.deliverable_manifest_entry,
  public.guarantee,public.warranty_issue,public.contract_vendor_grant,public.contract_vendor_grant_action,public.approval_subject_contract_version
from public,youone_request,youone_privileged_writer;
grant select on public.vendor_contract,public.contract_version,public.contract_project,public.contract_milestone,public.deliverable,public.approval_subject_contract_version to youone_request;

revoke all on function public.create_vendor_contract(uuid,text,uuid,text,uuid,uuid,date,date,uuid,uuid,uuid,timestamptz),
  public.seal_contract_version(uuid,text,text,uuid,timestamptz),public.bind_contract_approval_subject(uuid,uuid,uuid,timestamptz),
  public.activate_vendor_contract(uuid,bigint,uuid,uuid[],timestamptz,text,uuid,uuid,uuid,timestamptz),
  public.grant_contract_vendor_finance_scope(uuid,uuid,text,uuid,timestamptz),
  public.transition_vendor_contract_and_revoke_scope(uuid,text,bigint,text,uuid,uuid,uuid,timestamptz),
  public.read_vendor_contract_list_safe(timestamptz),public.read_vendor_contract_basic(uuid,timestamptz),public.read_vendor_contract_finance(uuid,timestamptz)
from public,youone_privileged_writer;
grant execute on function public.create_vendor_contract(uuid,text,uuid,text,uuid,uuid,date,date,uuid,uuid,uuid,timestamptz),
  public.seal_contract_version(uuid,text,text,uuid,timestamptz),public.bind_contract_approval_subject(uuid,uuid,uuid,timestamptz),
  public.activate_vendor_contract(uuid,bigint,uuid,uuid[],timestamptz,text,uuid,uuid,uuid,timestamptz),
  public.grant_contract_vendor_finance_scope(uuid,uuid,text,uuid,timestamptz),
  public.transition_vendor_contract_and_revoke_scope(uuid,text,bigint,text,uuid,uuid,uuid,timestamptz),
  public.read_vendor_contract_list_safe(timestamptz),public.read_vendor_contract_basic(uuid,timestamptz),public.read_vendor_contract_finance(uuid,timestamptz)
to youone_request;

revoke all on function public.record_signed_contract_version(uuid,uuid,uuid,text,uuid,text,uuid,bigint,uuid,uuid,uuid,timestamptz)
from public,youone_request;
grant execute on function public.record_signed_contract_version(uuid,uuid,uuid,text,uuid,text,uuid,bigint,uuid,uuid,uuid,timestamptz)
to youone_privileged_writer;

revoke all on function app_private.m07_assert_direct_internal(timestamptz,text),app_private.actor_has_contract_internal_scope(uuid,timestamptz),
  app_private.actor_has_contract_vendor_scope(uuid,text,timestamptz),app_private.guard_contract_grant_vendor(),app_private.guard_contract_version_lineage(),
  app_private.protect_contract_version(),app_private.protect_contract_child_after_seal(),app_private.guard_contract_subject_active(),
  app_private.reject_contract_subject_mutation(),app_private.guard_contract_approval_action_path(),
  app_private.append_m07_transition(uuid,uuid,uuid,text,uuid,text,text,text,text,bigint,bigint,text,timestamptz),app_private.m07_assert_approval_worker(timestamptz),app_private.approval_subject_snapshot(uuid)
from public,youone_request,youone_privileged_writer;

comment on table public.contract_version is 'Exact immutable negotiated snapshot. Preset and legal baseline are provenance, not statutory values.';
comment on table public.warranty_issue is 'Acceptance and payment never waive professional, latent-defect, warranty, indemnity or other Vendor responsibility.';
