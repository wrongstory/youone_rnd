-- M09 NCR/CAR: exact non-conformance sources, corrective action, evidence and independent effectiveness verification.
-- NCR/CAR outcomes are review facts only. No command in this migration changes Contract, acceptance, warranty or payment state.

insert into public.permission(id,stable_code,status) values
  ('39000000-0000-4000-8000-000000000001','ncr.record.issue','ACTIVE'),
  ('39000000-0000-4000-8000-000000000002','ncr.action.perform','ACTIVE'),
  ('39000000-0000-4000-8000-000000000003','ncr.plan.review','ACTIVE'),
  ('39000000-0000-4000-8000-000000000004','ncr.effectiveness.verify','ACTIVE'),
  ('39000000-0000-4000-8000-000000000005','ncr.record.close','ACTIVE')
on conflict do nothing;

insert into public.action_definition(action_id) values
  ('ncr.record.issue'),('ncr.action.perform'),('ncr.plan.review'),('ncr.effectiveness.verify'),('ncr.record.close')
on conflict do nothing;

insert into public.aggregate_type_definition(aggregate_type) values ('NON_CONFORMANCE'),('CORRECTIVE_ACTION') on conflict do nothing;

insert into public.domain_event_definition(event_id,payload_schema_id,payload_schema_version) values
  ('EVT-NCR-CREATE','NCR_EVENT_REF',1),('EVT-NCR-ASSESS-RESPONSIBILITY','NCR_EVENT_REF',1),
  ('EVT-NCR-ISSUE','NCR_EVENT_REF',1),('EVT-NCR-CONTAIN','NCR_EVENT_REF',1),
  ('EVT-NCR-REQUEST-ROOT-CAUSE','NCR_EVENT_REF',1),('EVT-NCR-SUBMIT-PLAN','NCR_EVENT_REF',1),
  ('EVT-NCR-ACCEPT-PLAN','NCR_EVENT_REF',1),('EVT-NCR-READY-VERIFY','NCR_EVENT_REF',1),
  ('EVT-NCR-CLOSE','NCR_EVENT_REF',1),('EVT-NCR-REOPEN','NCR_EVENT_REF',1),
  ('EVT-CAR-PROPOSE','CAR_EVENT_REF',1),('EVT-CAR-ACCEPT','CAR_EVENT_REF',1),('EVT-CAR-START','CAR_EVENT_REF',1),
  ('EVT-CAR-SUBMIT-VERIFY','CAR_EVENT_REF',1),('EVT-CAR-VERIFY-EFFECTIVE','CAR_EVENT_REF',1),
  ('EVT-CAR-VERIFY-INEFFECTIVE','CAR_EVENT_REF',1),('EVT-CAR-CLOSE','CAR_EVENT_REF',1),
  ('EVT-CAR-REWORK','CAR_EVENT_REF',1)
on conflict do nothing;

insert into public.state_machine_definition(machine_id,aggregate_type) values
  ('SM-NCR-V1','NON_CONFORMANCE'),('SM-CAR-V1','CORRECTIVE_ACTION')
on conflict do nothing;

insert into public.state_definition(machine_id,state_id,is_terminal) values
  ('SM-NCR-V1','DRAFT',false),('SM-NCR-V1','ISSUED',false),('SM-NCR-V1','CONTAINMENT',false),
  ('SM-NCR-V1','ROOT_CAUSE_REQUIRED',false),('SM-NCR-V1','ACTION_PLAN_REVIEW',false),
  ('SM-NCR-V1','IMPLEMENTING',false),('SM-NCR-V1','VERIFICATION',false),('SM-NCR-V1','CLOSED',true),
  ('SM-NCR-V1','REOPENED',false),('SM-NCR-V1','CANCELLED',true),
  ('SM-CAR-V1','PROPOSED',false),('SM-CAR-V1','ACCEPTED',false),('SM-CAR-V1','IN_PROGRESS',false),
  ('SM-CAR-V1','VERIFICATION_REQUIRED',false),('SM-CAR-V1','EFFECTIVE',false),
  ('SM-CAR-V1','INEFFECTIVE',false),('SM-CAR-V1','CLOSED',true),('SM-CAR-V1','CANCELLED',true)
on conflict do nothing;

insert into public.transition_definition(machine_id,event_id,from_state,to_state) values
  ('SM-NCR-V1','EVT-NCR-CREATE',null,'DRAFT'),
  ('SM-NCR-V1','EVT-NCR-ISSUE','DRAFT','ISSUED'),
  ('SM-NCR-V1','EVT-NCR-CONTAIN','ISSUED','CONTAINMENT'),
  ('SM-NCR-V1','EVT-NCR-REQUEST-ROOT-CAUSE','CONTAINMENT','ROOT_CAUSE_REQUIRED'),
  ('SM-NCR-V1','EVT-NCR-SUBMIT-PLAN','ROOT_CAUSE_REQUIRED','ACTION_PLAN_REVIEW'),
  ('SM-NCR-V1','EVT-NCR-ACCEPT-PLAN','ACTION_PLAN_REVIEW','IMPLEMENTING'),
  ('SM-NCR-V1','EVT-NCR-READY-VERIFY','IMPLEMENTING','VERIFICATION'),
  ('SM-NCR-V1','EVT-NCR-CLOSE','VERIFICATION','CLOSED'),
  ('SM-NCR-V1','EVT-NCR-REOPEN','CLOSED','REOPENED'),
  ('SM-CAR-V1','EVT-CAR-PROPOSE',null,'PROPOSED'),
  ('SM-CAR-V1','EVT-CAR-ACCEPT','PROPOSED','ACCEPTED'),
  ('SM-CAR-V1','EVT-CAR-START','ACCEPTED','IN_PROGRESS'),
  ('SM-CAR-V1','EVT-CAR-SUBMIT-VERIFY','IN_PROGRESS','VERIFICATION_REQUIRED'),
  ('SM-CAR-V1','EVT-CAR-VERIFY-EFFECTIVE','VERIFICATION_REQUIRED','EFFECTIVE'),
  ('SM-CAR-V1','EVT-CAR-VERIFY-INEFFECTIVE','VERIFICATION_REQUIRED','INEFFECTIVE'),
  ('SM-CAR-V1','EVT-CAR-CLOSE','EFFECTIVE','CLOSED'),
  ('SM-CAR-V1','EVT-CAR-REWORK','INEFFECTIVE','IN_PROGRESS')
on conflict do nothing;
insert into public.transition_definition(machine_id,event_id,from_state,to_state)
  select 'SM-NCR-V1','EVT-NCR-ASSESS-RESPONSIBILITY',state_id,state_id
  from public.state_definition where machine_id='SM-NCR-V1'
on conflict do nothing;

alter table public.inspection_attempt add constraint inspection_attempt_m09_exact_unique
  unique(id,inspection_id,attempt_no,checksum,sealed_at,contract_id,deliverable_id,deliverable_version_id,assigned_vendor_id);

create table public.non_conformance (
  id uuid primary key,
  ncr_no text not null unique check(length(ncr_no) between 1 and 100),
  inspection_attempt_id uuid not null,
  inspection_id uuid not null,
  inspection_attempt_no integer not null check(inspection_attempt_no>0),
  inspection_attempt_checksum text not null check(app_private.is_sha256(inspection_attempt_checksum)),
  inspection_attempt_sealed_at timestamptz not null,
  contract_id uuid not null,
  project_id uuid not null,
  deliverable_id uuid not null,
  deliverable_version_id uuid not null,
  assigned_vendor_id uuid not null references public.vendor(id),
  requirement_id uuid,
  requirement_revision_id uuid,
  inspection_criterion_result_id uuid,
  title text not null check(length(title) between 1 and 500),
  observed_non_conformance text not null check(length(observed_non_conformance) between 1 and 10000),
  affected_scope text not null check(length(affected_scope) between 1 and 5000),
  impact_summary text not null check(length(impact_summary) between 1 and 5000),
  severity text not null check(severity in ('MINOR','MAJOR','CRITICAL')),
  responsibility_status text check(responsibility_status in ('PRELIMINARY','DISPUTED','FINAL')),
  responsibility_party text check(responsibility_party in ('UNDETERMINED','VENDOR','INTERNAL','SHARED')),
  responsible_vendor_id uuid references public.vendor(id),
  action_assigned_vendor_id uuid references public.vendor(id),
  internal_owner_user_id uuid not null references public.user_account(id),
  current_responsibility_assessment_id uuid,
  state text not null check(state in ('DRAFT','ISSUED','CONTAINMENT','ROOT_CAUSE_REQUIRED','ACTION_PLAN_REVIEW','IMPLEMENTING','VERIFICATION','CLOSED','REOPENED','CANCELLED')),
  version_no bigint not null default 1 check(version_no>0),
  acceptance_does_not_waive_responsibility boolean not null default true check(acceptance_does_not_waive_responsibility),
  payment_does_not_waive_responsibility boolean not null default true check(payment_does_not_waive_responsibility),
  contract_state_unchanged_by_ncr boolean not null default true check(contract_state_unchanged_by_ncr),
  created_by_user_id uuid not null references public.user_account(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(id,contract_id,project_id,assigned_vendor_id),
  unique(id,current_responsibility_assessment_id),
  foreign key(inspection_attempt_id,inspection_id,inspection_attempt_no,inspection_attempt_checksum,inspection_attempt_sealed_at,
    contract_id,deliverable_id,deliverable_version_id,assigned_vendor_id)
    references public.inspection_attempt(id,inspection_id,attempt_no,checksum,sealed_at,contract_id,deliverable_id,deliverable_version_id,assigned_vendor_id),
  foreign key(contract_id,project_id) references public.contract_project(contract_id,project_id),
  foreign key(requirement_id,project_id) references public.requirement(id,project_id),
  foreign key(requirement_revision_id,requirement_id) references public.requirement_revision(id,requirement_id),
  foreign key(inspection_criterion_result_id,inspection_attempt_id)
    references public.inspection_criterion_result(id,inspection_attempt_id),
  check((requirement_id is null)=(requirement_revision_id is null)),
  check((responsibility_status is null)=(responsibility_party is null)
    and (responsibility_status is null)=(current_responsibility_assessment_id is null)),
  check(responsible_vendor_id is null or responsible_vendor_id=assigned_vendor_id),
  check(action_assigned_vendor_id is null or action_assigned_vendor_id=assigned_vendor_id),
  check((responsibility_party is not null) and ((responsibility_party in ('VENDOR','SHARED'))=(responsible_vendor_id is not null))
    or responsibility_party is null and responsible_vendor_id is null)
);

create table public.ncr_responsibility_assessment (
  id uuid primary key,
  ncr_id uuid not null references public.non_conformance(id) deferrable initially deferred,
  sequence_no integer not null check(sequence_no>0),
  status text not null check(status in ('PRELIMINARY','DISPUTED','FINAL')),
  party text not null check(party in ('UNDETERMINED','VENDOR','INTERNAL','SHARED')),
  responsible_vendor_id uuid references public.vendor(id),
  rationale text not null check(length(rationale) between 1 and 5000),
  assessed_by_user_id uuid not null references public.user_account(id),
  assessed_at timestamptz not null,
  unique(ncr_id,sequence_no),
  unique(id,ncr_id),
  check((party in ('VENDOR','SHARED'))=(responsible_vendor_id is not null))
);
alter table public.non_conformance add constraint ncr_current_responsibility_fk
  foreign key(current_responsibility_assessment_id,id)
  references public.ncr_responsibility_assessment(id,ncr_id) deferrable initially deferred;

create table public.ncr_evidence (
  id uuid primary key,
  ncr_id uuid not null references public.non_conformance(id),
  evidence_phase text not null check(evidence_phase in ('ISSUE','RESPONSIBILITY','CONTAINMENT','ROOT_CAUSE','ACTION_PLAN','PLAN_REVIEW','IMPLEMENTATION','VERIFICATION','CLOSE','REOPEN')),
  evidence_type_code text not null check(app_private.is_stable_code(evidence_type_code)),
  attachment_id uuid not null,
  attachment_row_version bigint not null check(attachment_row_version>=0),
  content_checksum text not null check(app_private.is_sha256(content_checksum)),
  submitted_by_user_id uuid not null references public.user_account(id),
  created_at timestamptz not null,
  unique(id,ncr_id),
  unique(ncr_id,attachment_id,evidence_phase),
  foreign key(attachment_id,attachment_row_version,content_checksum)
    references public.attachment(id,row_version,detected_sha256)
);

create table public.ncr_responsibility_assessment_evidence (
  responsibility_assessment_id uuid not null,
  ncr_id uuid not null,
  ncr_evidence_id uuid not null,
  primary key(responsibility_assessment_id,ncr_evidence_id),
  foreign key(responsibility_assessment_id,ncr_id) references public.ncr_responsibility_assessment(id,ncr_id),
  foreign key(ncr_evidence_id,ncr_id) references public.ncr_evidence(id,ncr_id)
);

create table public.ncr_containment_action (
  id uuid primary key,
  ncr_id uuid not null references public.non_conformance(id),
  sequence_no integer not null check(sequence_no>0),
  action_description text not null check(length(action_description) between 1 and 5000),
  performed_by_user_id uuid not null references public.user_account(id),
  performed_at timestamptz not null,
  unique(ncr_id,sequence_no),
  unique(id,ncr_id)
);
create table public.ncr_containment_evidence (
  containment_action_id uuid not null,
  ncr_id uuid not null,
  ncr_evidence_id uuid not null,
  primary key(containment_action_id,ncr_evidence_id),
  foreign key(containment_action_id,ncr_id) references public.ncr_containment_action(id,ncr_id),
  foreign key(ncr_evidence_id,ncr_id) references public.ncr_evidence(id,ncr_id)
);

create table public.ncr_root_cause_analysis (
  id uuid primary key,
  ncr_id uuid not null references public.non_conformance(id),
  sequence_no integer not null check(sequence_no>0),
  method_code text not null check(app_private.is_stable_code(method_code)),
  analysis text not null check(length(analysis) between 1 and 10000),
  submitted_by_user_id uuid not null references public.user_account(id),
  submitted_at timestamptz not null,
  unique(ncr_id,sequence_no),
  unique(id,ncr_id)
);
create table public.ncr_root_cause_request (
  id uuid primary key,
  ncr_id uuid not null references public.non_conformance(id),
  reason text not null check(length(reason) between 1 and 5000),
  requested_by_user_id uuid not null references public.user_account(id),
  requested_at timestamptz not null,
  unique(id,ncr_id)
);
create table public.ncr_root_cause_evidence (
  root_cause_analysis_id uuid not null,
  ncr_id uuid not null,
  ncr_evidence_id uuid not null,
  primary key(root_cause_analysis_id,ncr_evidence_id),
  foreign key(root_cause_analysis_id,ncr_id) references public.ncr_root_cause_analysis(id,ncr_id),
  foreign key(ncr_evidence_id,ncr_id) references public.ncr_evidence(id,ncr_id)
);

create table public.corrective_action (
  id uuid primary key,
  ncr_id uuid not null references public.non_conformance(id),
  car_no text not null unique check(length(car_no) between 1 and 100),
  root_cause_analysis_id uuid not null,
  action_plan text not null check(length(action_plan) between 1 and 10000),
  acceptance_criteria text not null check(length(acceptance_criteria) between 1 and 5000),
  owner_kind text not null check(owner_kind in ('INTERNAL','VENDOR')),
  owner_user_id uuid references public.user_account(id),
  owner_vendor_id uuid references public.vendor(id),
  is_required boolean not null,
  due_date date not null,
  state text not null check(state in ('PROPOSED','ACCEPTED','IN_PROGRESS','VERIFICATION_REQUIRED','EFFECTIVE','INEFFECTIVE','CLOSED','CANCELLED')),
  effectiveness_cycle integer not null default 1 check(effectiveness_cycle>0),
  version_no bigint not null default 1 check(version_no>0),
  created_by_user_id uuid not null references public.user_account(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique(id,ncr_id),
  foreign key(root_cause_analysis_id,ncr_id) references public.ncr_root_cause_analysis(id,ncr_id),
  check((owner_kind='INTERNAL' and owner_user_id is not null and owner_vendor_id is null)
    or (owner_kind='VENDOR' and owner_user_id is null and owner_vendor_id is not null))
);

create table public.car_plan_evidence (
  corrective_action_id uuid not null,
  ncr_id uuid not null,
  ncr_evidence_id uuid not null,
  primary key(corrective_action_id,ncr_evidence_id),
  foreign key(corrective_action_id,ncr_id) references public.corrective_action(id,ncr_id),
  foreign key(ncr_evidence_id,ncr_id) references public.ncr_evidence(id,ncr_id)
);

create table public.car_action_execution (
  id uuid primary key,
  corrective_action_id uuid not null references public.corrective_action(id),
  ncr_id uuid not null,
  sequence_no integer not null check(sequence_no>0),
  action_description text not null check(length(action_description) between 1 and 10000),
  performed_by_user_id uuid not null references public.user_account(id),
  performed_at timestamptz not null,
  unique(corrective_action_id,sequence_no),
  unique(id,corrective_action_id,ncr_id),
  foreign key(corrective_action_id,ncr_id) references public.corrective_action(id,ncr_id)
);
create table public.car_action_execution_evidence (
  execution_id uuid not null,
  corrective_action_id uuid not null,
  ncr_id uuid not null,
  ncr_evidence_id uuid not null,
  primary key(execution_id,ncr_evidence_id),
  foreign key(execution_id,corrective_action_id,ncr_id)
    references public.car_action_execution(id,corrective_action_id,ncr_id),
  foreign key(ncr_evidence_id,ncr_id) references public.ncr_evidence(id,ncr_id)
);

create table public.car_verification (
  id uuid primary key,
  corrective_action_id uuid not null references public.corrective_action(id),
  ncr_id uuid not null,
  sequence_no integer not null check(sequence_no>0),
  result text not null check(result in ('EFFECTIVE','INEFFECTIVE')),
  verification_summary text not null check(length(verification_summary) between 1 and 10000),
  verifier_user_id uuid not null references public.user_account(id),
  verified_at timestamptz not null,
  unique(corrective_action_id,sequence_no),
  unique(id,corrective_action_id,ncr_id),
  foreign key(corrective_action_id,ncr_id) references public.corrective_action(id,ncr_id)
);
create table public.car_verification_evidence (
  verification_id uuid not null,
  corrective_action_id uuid not null,
  ncr_id uuid not null,
  ncr_evidence_id uuid not null,
  primary key(verification_id,ncr_evidence_id),
  foreign key(verification_id,corrective_action_id,ncr_id)
    references public.car_verification(id,corrective_action_id,ncr_id),
  foreign key(ncr_evidence_id,ncr_id) references public.ncr_evidence(id,ncr_id)
);

create table public.car_rework_event (
  id uuid primary key,
  corrective_action_id uuid not null,
  ncr_id uuid not null,
  effectiveness_cycle integer not null check(effectiveness_cycle>1),
  reason text not null check(length(reason) between 1 and 5000),
  reworked_by_user_id uuid not null references public.user_account(id),
  reworked_at timestamptz not null,
  unique(corrective_action_id,effectiveness_cycle),
  unique(id,corrective_action_id,ncr_id),
  foreign key(corrective_action_id,ncr_id) references public.corrective_action(id,ncr_id)
);
create table public.car_rework_evidence (
  rework_event_id uuid not null,
  corrective_action_id uuid not null,
  ncr_id uuid not null,
  ncr_evidence_id uuid not null,
  primary key(rework_event_id,ncr_evidence_id),
  foreign key(rework_event_id,corrective_action_id,ncr_id) references public.car_rework_event(id,corrective_action_id,ncr_id),
  foreign key(ncr_evidence_id,ncr_id) references public.ncr_evidence(id,ncr_id)
);
create table public.car_close_event (
  id uuid primary key,
  corrective_action_id uuid not null,
  ncr_id uuid not null,
  closed_version bigint not null check(closed_version>0),
  closed_by_user_id uuid not null references public.user_account(id),
  closed_at timestamptz not null,
  unique(corrective_action_id,closed_version),
  unique(id,corrective_action_id,ncr_id),
  foreign key(corrective_action_id,ncr_id) references public.corrective_action(id,ncr_id)
);
create table public.car_close_evidence (
  close_event_id uuid not null,
  corrective_action_id uuid not null,
  ncr_id uuid not null,
  ncr_evidence_id uuid not null,
  primary key(close_event_id,ncr_evidence_id),
  foreign key(close_event_id,corrective_action_id,ncr_id) references public.car_close_event(id,corrective_action_id,ncr_id),
  foreign key(ncr_evidence_id,ncr_id) references public.ncr_evidence(id,ncr_id)
);

create table public.ncr_reopen_event (
  id uuid primary key,
  ncr_id uuid not null references public.non_conformance(id),
  reopen_count integer not null check(reopen_count>0),
  prior_close_event_id uuid not null,
  prior_closed_version bigint not null check(prior_closed_version>0),
  prior_closed_at timestamptz not null,
  reason text not null check(length(reason) between 1 and 5000),
  reopened_by_user_id uuid not null references public.user_account(id),
  reopened_at timestamptz not null,
  unique(ncr_id,reopen_count),
  unique(id,ncr_id)
);

create table public.ncr_close_event (
  id uuid primary key,
  ncr_id uuid not null references public.non_conformance(id),
  closed_version bigint not null check(closed_version>0),
  reason text not null check(length(reason) between 1 and 5000),
  closed_by_user_id uuid not null references public.user_account(id),
  closed_at timestamptz not null,
  unique(ncr_id,closed_version),
  unique(id,ncr_id,closed_version,closed_at)
);
alter table public.ncr_reopen_event add constraint ncr_reopen_prior_close_fk
  foreign key(prior_close_event_id,ncr_id,prior_closed_version,prior_closed_at)
  references public.ncr_close_event(id,ncr_id,closed_version,closed_at);
create table public.ncr_close_evidence (
  close_event_id uuid not null,
  ncr_id uuid not null,
  ncr_evidence_id uuid not null,
  primary key(close_event_id,ncr_evidence_id),
  foreign key(close_event_id,ncr_id) references public.ncr_close_event(id,ncr_id),
  foreign key(ncr_evidence_id,ncr_id) references public.ncr_evidence(id,ncr_id)
);
create table public.ncr_reopen_evidence (
  reopen_event_id uuid not null,
  ncr_id uuid not null,
  ncr_evidence_id uuid not null,
  primary key(reopen_event_id,ncr_evidence_id),
  foreign key(reopen_event_id,ncr_id) references public.ncr_reopen_event(id,ncr_id),
  foreign key(ncr_evidence_id,ncr_id) references public.ncr_evidence(id,ncr_id)
);

create index ncr_source_attempt_idx on public.non_conformance(inspection_attempt_id);
create index ncr_scope_idx on public.non_conformance(contract_id,project_id,assigned_vendor_id,state);
create index car_ncr_state_idx on public.corrective_action(ncr_id,state,is_required);

create or replace function app_private.reject_m09_append_only_change()
returns trigger language plpgsql set search_path=pg_catalog
as $$ begin raise exception 'M09 evidence and history are append-only' using errcode='55000'; end $$;

do $triggers$ declare table_name text; begin
  foreach table_name in array array[
    'ncr_responsibility_assessment','ncr_responsibility_assessment_evidence','ncr_evidence','ncr_containment_action','ncr_containment_evidence',
    'ncr_root_cause_request','ncr_root_cause_analysis','ncr_root_cause_evidence','car_plan_evidence','car_action_execution',
    'car_action_execution_evidence','car_verification','car_verification_evidence','car_rework_event','car_rework_evidence',
    'car_close_event','car_close_evidence','ncr_close_event','ncr_close_evidence','ncr_reopen_event','ncr_reopen_evidence'
  ] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function app_private.reject_m09_append_only_change()',
      table_name||'_append_only',table_name);
  end loop;
end $triggers$;

create or replace function app_private.protect_m09_aggregate()
returns trigger language plpgsql set search_path=pg_catalog,app_private
as $$ begin
  if tg_op='DELETE' then raise exception 'NCR/CAR aggregate is retained' using errcode='55000'; end if;
  if app_private.optional_setting('app.m09_command') is distinct from old.id::text then
    raise exception 'NCR/CAR aggregate updates require a trusted command' using errcode='42501';
  end if;
  return new;
end $$;
create trigger non_conformance_trusted_update before update or delete on public.non_conformance
  for each row execute function app_private.protect_m09_aggregate();
create trigger corrective_action_trusted_update before update or delete on public.corrective_action
  for each row execute function app_private.protect_m09_aggregate();

create or replace function app_private.m09_assert_direct_internal(
  target_contract_id uuid,target_occurred_at timestamptz,target_permission text
) returns void language plpgsql stable security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.m08_assert_direct_internal(target_occurred_at,target_permission);
  if not app_private.actor_has_contract_internal_scope(target_contract_id,target_occurred_at) then
    raise exception 'exact internal Contract Scope required' using errcode='42501';
  end if;
end $$;

create or replace function app_private.m09_vendor_can_act(
  target_ncr_id uuid,target_occurred_at timestamptz
) returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$ select app_private.required_setting('app.actor_kind')='USER'
  and app_private.current_actor_user_id()=app_private.current_effective_actor_user_id()
  and app_private.current_acting_authority_id() is null
  and target_occurred_at=app_private.request_time()
  and exists(
    select 1 from public.non_conformance n
    join public.user_account u on u.id=app_private.current_actor_user_id() and u.account_kind='VENDOR'
      and u.status='ACTIVE' and u.valid_from<=target_occurred_at and (u.valid_until is null or u.valid_until>target_occurred_at)
    join public.vendor_user vu on vu.user_id=u.id and vu.vendor_id=n.action_assigned_vendor_id
    join public.contract_vendor_grant g on g.vendor_user_id=vu.id and g.contract_id=n.contract_id and g.project_id=n.project_id
      and g.status='ACTIVE' and g.revoked_at is null and g.valid_from<=target_occurred_at
      and (g.valid_until is null or g.valid_until>target_occurred_at)
    join public.contract_vendor_grant_action ga on ga.grant_id=g.id
    join public.permission p on p.id=ga.permission_id and p.stable_code='ncr.action.perform' and p.status='ACTIVE'
    where n.id=target_ncr_id and app_private.actor_has_vendor_membership(vu.id,n.action_assigned_vendor_id,target_occurred_at)
  ) $$;

create or replace function app_private.m09_assert_responsible_actor(
  target_ncr_id uuid,target_occurred_at timestamptz
) returns void language plpgsql stable security definer set search_path=pg_catalog,public,app_private
as $$ declare n public.non_conformance%rowtype; account_type text; begin
  if target_occurred_at is distinct from app_private.request_time() or app_private.required_setting('app.actor_kind')<>'USER'
    or app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id()
    or app_private.current_acting_authority_id() is not null then
    raise exception 'direct user ActorContext required' using errcode='42501';
  end if;
  select * into strict n from public.non_conformance where id=target_ncr_id;
  select account_kind into strict account_type from public.user_account where id=app_private.current_actor_user_id() and status='ACTIVE'
    and valid_from<=target_occurred_at and (valid_until is null or valid_until>target_occurred_at);
  if account_type='INTERNAL' then
    perform app_private.m09_assert_direct_internal(n.contract_id,target_occurred_at,'ncr.action.perform');
  elsif account_type='VENDOR' then
    if not app_private.m09_vendor_can_act(n.id,target_occurred_at) then
      raise exception 'active assigned VendorMembership and exact Project/Contract grant required' using errcode='42501';
    end if;
  else raise exception 'NCR responsible actor denied' using errcode='42501'; end if;
end $$;

create or replace function app_private.append_m09_transition(
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_action text,target_aggregate_type text,
  target_aggregate_id uuid,target_machine text,target_event text,target_schema text,target_from_state text,target_to_state text,
  target_from_version bigint,target_to_version bigint,target_reason_code text,target_reason_ref uuid,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.append_audit(target_audit_id,target_action,target_aggregate_type,target_aggregate_id,target_to_version,'SUCCEEDED',
    target_reason_code,target_reason_ref,null,null,null,target_occurred_at);
  perform app_private.append_state_transition(target_transition_id,target_audit_id,target_aggregate_type,target_aggregate_id,target_machine,target_event,
    target_from_state,target_to_state,target_from_version,target_to_version,target_reason_code,target_reason_ref,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),target_occurred_at);
  perform app_private.enqueue_outbox(target_outbox_id,target_audit_id,target_event,target_aggregate_type,target_aggregate_id,target_to_version,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),target_schema,1,
    jsonb_build_object('aggregateId',target_aggregate_id,'resourceVersion',target_to_version,'eventId',target_event),
    target_event||':'||target_aggregate_id::text||':'||target_to_version::text,target_occurred_at,target_occurred_at);
end $$;

create or replace function public.create_ncr_draft(
  target_ncr_id uuid,target_ncr_no text,target_inspection_attempt_id uuid,target_project_id uuid,
  target_requirement_revision_id uuid,target_criterion_result_id uuid,target_title text,target_observed text,target_scope text,target_impact text,
  target_severity text,target_action_assigned_vendor_id uuid,target_internal_owner_user_id uuid,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare a public.inspection_attempt%rowtype; criterion public.inspection_criterion_result%rowtype; target_requirement_id uuid; begin
  select * into strict a from public.inspection_attempt where id=target_inspection_attempt_id and state='SEALED' for share;
  perform app_private.m09_assert_direct_internal(a.contract_id,target_occurred_at,'ncr.record.issue');
  if not exists(select 1 from public.contract_project cp where cp.contract_id=a.contract_id and cp.project_id=target_project_id
      and cp.valid_from<=target_occurred_at::date and (cp.valid_to is null or cp.valid_to>=target_occurred_at::date))
    or not exists(select 1 from public.user_account u where u.id=target_internal_owner_user_id and u.account_kind='INTERNAL'
      and u.status='ACTIVE' and u.valid_from<=target_occurred_at and (u.valid_until is null or u.valid_until>target_occurred_at)) then
    raise exception 'exact active Project/Contract source and internal owner required' using errcode='23514';
  end if;
  if target_requirement_revision_id is not null then
    select rr.requirement_id into target_requirement_id from public.requirement_revision rr join public.requirement r
      on r.id=rr.requirement_id where rr.id=target_requirement_revision_id and r.project_id=target_project_id;
    if target_requirement_id is null then
      raise exception 'RequirementRevision must belong to NCR Project' using errcode='23514';
    end if;
  end if;
  if target_criterion_result_id is not null then
    select * into strict criterion from public.inspection_criterion_result where id=target_criterion_result_id and inspection_attempt_id=a.id;
    if criterion.requirement_revision_id is distinct from target_requirement_revision_id then
      raise exception 'criterion and RequirementRevision source mismatch' using errcode='23514';
    end if;
  end if;
  insert into public.non_conformance(id,ncr_no,inspection_attempt_id,inspection_id,inspection_attempt_no,inspection_attempt_checksum,
    inspection_attempt_sealed_at,contract_id,project_id,deliverable_id,deliverable_version_id,assigned_vendor_id,
    requirement_id,requirement_revision_id,inspection_criterion_result_id,title,observed_non_conformance,affected_scope,impact_summary,severity,
    responsibility_status,responsibility_party,responsible_vendor_id,action_assigned_vendor_id,internal_owner_user_id,
    current_responsibility_assessment_id,state,version_no,created_by_user_id,created_at,updated_at)
  values(target_ncr_id,target_ncr_no,a.id,a.inspection_id,a.attempt_no,a.checksum,a.sealed_at,a.contract_id,target_project_id,a.deliverable_id,
    a.deliverable_version_id,a.assigned_vendor_id,target_requirement_id,target_requirement_revision_id,target_criterion_result_id,
    target_title,target_observed,target_scope,target_impact,target_severity,null,null,
    null,target_action_assigned_vendor_id,target_internal_owner_user_id,null,
    'DRAFT',1,app_private.current_effective_actor_user_id(),target_occurred_at,target_occurred_at);
  perform app_private.append_m09_transition(target_audit_id,target_transition_id,target_outbox_id,'ncr.record.issue','NON_CONFORMANCE',target_ncr_id,
    'SM-NCR-V1','EVT-NCR-CREATE','NCR_EVENT_REF',null,'DRAFT',0,1,'NCR-DRAFT-CREATED',null,target_occurred_at);
  return target_ncr_id;
end $$;

create or replace function public.append_ncr_evidence(
  target_ncr_id uuid,target_evidence_id uuid,target_phase text,target_evidence_type text,target_attachment_id uuid,
  target_attachment_row_version bigint,target_content_checksum text,target_audit_id uuid,target_occurred_at timestamptz
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare n public.non_conformance%rowtype; account_type text; target_action text; begin
  select * into strict n from public.non_conformance where id=target_ncr_id for share;
  if app_private.required_setting('app.actor_kind')<>'USER' or app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id()
    or app_private.current_acting_authority_id() is not null
    or target_occurred_at is distinct from app_private.request_time() then raise exception 'direct user ActorContext required' using errcode='42501'; end if;
  select account_kind into strict account_type from public.user_account where id=app_private.current_actor_user_id() and status='ACTIVE'
    and valid_from<=target_occurred_at and (valid_until is null or valid_until>target_occurred_at);
  if account_type='VENDOR' then
    if target_phase not in ('CONTAINMENT','ROOT_CAUSE','ACTION_PLAN','IMPLEMENTATION') or not app_private.m09_vendor_can_act(n.id,target_occurred_at) then
      raise exception 'Vendor evidence phase or exact assignment denied' using errcode='42501';
    end if;
    target_action:='ncr.action.perform';
  else
    target_action:=case target_phase when 'ISSUE' then 'ncr.record.issue'
      when 'RESPONSIBILITY' then case when app_private.actor_has_permission('ncr.record.close',target_occurred_at)
        then 'ncr.record.close' else 'ncr.record.issue' end
      when 'ACTION_PLAN' then 'ncr.action.perform' when 'PLAN_REVIEW' then 'ncr.plan.review' when 'VERIFICATION' then 'ncr.effectiveness.verify'
      when 'CLOSE' then 'ncr.record.close' when 'REOPEN' then 'ncr.record.close' else 'ncr.action.perform' end;
    perform app_private.m09_assert_direct_internal(n.contract_id,target_occurred_at,target_action);
  end if;
  if not exists(select 1 from public.attachment a where a.id=target_attachment_id and a.row_version=target_attachment_row_version
      and a.detected_sha256=target_content_checksum and a.state='AVAILABLE' and a.scan_verdict='CLEAN') then
    raise exception 'exact AVAILABLE scanned Attachment snapshot required' using errcode='23514';
  end if;
  insert into public.ncr_evidence(id,ncr_id,evidence_phase,evidence_type_code,attachment_id,attachment_row_version,content_checksum,
    submitted_by_user_id,created_at) values(target_evidence_id,n.id,target_phase,target_evidence_type,target_attachment_id,
    target_attachment_row_version,target_content_checksum,app_private.current_effective_actor_user_id(),target_occurred_at);
  perform app_private.append_audit(target_audit_id,target_action,'NON_CONFORMANCE',n.id,n.version_no,'SUCCEEDED',
    'NCR-EVIDENCE-APPENDED',target_evidence_id,null,null,null,target_occurred_at);
  return target_evidence_id;
end $$;

create or replace function public.record_ncr_responsibility_assessment(
  target_ncr_id uuid,target_assessment_id uuid,target_status text,target_party text,target_responsible_vendor_id uuid,
  target_rationale text,target_evidence_ids uuid[],target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare n public.non_conformance%rowtype; next_version bigint; next_sequence integer; target_action text; begin
  select * into strict n from public.non_conformance where id=target_ncr_id for update;
  target_action:=case when target_status='FINAL' then 'ncr.record.close' else 'ncr.record.issue' end;
  perform app_private.m09_assert_direct_internal(n.contract_id,target_occurred_at,target_action);
  if (target_status in ('DISPUTED','FINAL') and n.current_responsibility_assessment_id is null)
    or coalesce(cardinality(target_evidence_ids),0)=0
    or exists(select 1 from unnest(target_evidence_ids) evidence_id where not exists(
      select 1 from public.ncr_evidence e where e.id=evidence_id and e.ncr_id=n.id and e.evidence_phase='RESPONSIBILITY')) then
    raise exception 'prior assessment and exact responsibility evidence required' using errcode='23514';
  end if;
  next_version:=app_private.next_version(n.version_no,target_expected_version);
  select coalesce(max(sequence_no),0)+1 into next_sequence from public.ncr_responsibility_assessment where ncr_id=n.id;
  insert into public.ncr_responsibility_assessment(id,ncr_id,sequence_no,status,party,responsible_vendor_id,rationale,assessed_by_user_id,assessed_at)
  values(target_assessment_id,n.id,next_sequence,target_status,target_party,target_responsible_vendor_id,target_rationale,
    app_private.current_effective_actor_user_id(),target_occurred_at);
  insert into public.ncr_responsibility_assessment_evidence(responsibility_assessment_id,ncr_id,ncr_evidence_id)
    select target_assessment_id,n.id,evidence_id from unnest(target_evidence_ids) evidence_id;
  perform set_config('app.m09_command',n.id::text,true);
  update public.non_conformance set responsibility_status=target_status,responsibility_party=target_party,
    responsible_vendor_id=target_responsible_vendor_id,current_responsibility_assessment_id=target_assessment_id,
    version_no=next_version,updated_at=target_occurred_at where id=n.id;
  perform app_private.append_m09_transition(target_audit_id,target_transition_id,target_outbox_id,target_action,'NON_CONFORMANCE',n.id,
    'SM-NCR-V1','EVT-NCR-ASSESS-RESPONSIBILITY','NCR_EVENT_REF',n.state,n.state,n.version_no,next_version,
    'NCR-RESPONSIBILITY-ASSESSED',target_assessment_id,target_occurred_at);
  return next_version;
end $$;

create or replace function public.issue_non_conformance(
  target_ncr_id uuid,target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare n public.non_conformance%rowtype; next_version bigint; begin
  select * into strict n from public.non_conformance where id=target_ncr_id for update;
  perform app_private.m09_assert_direct_internal(n.contract_id,target_occurred_at,'ncr.record.issue');
  if n.state<>'DRAFT' or not exists(select 1 from public.ncr_evidence e where e.ncr_id=n.id and e.evidence_phase='ISSUE') then
    raise exception 'DRAFT NCR with immutable issue evidence required' using errcode='23514';
  end if;
  next_version:=app_private.next_version(n.version_no,target_expected_version);
  perform set_config('app.m09_command',n.id::text,true);
  update public.non_conformance set state='ISSUED',version_no=next_version,updated_at=target_occurred_at where id=n.id;
  perform app_private.append_m09_transition(target_audit_id,target_transition_id,target_outbox_id,'ncr.record.issue','NON_CONFORMANCE',n.id,
    'SM-NCR-V1','EVT-NCR-ISSUE','NCR_EVENT_REF','DRAFT','ISSUED',n.version_no,next_version,'NCR-ISSUED',null,target_occurred_at);
  return next_version;
end $$;

create or replace function public.record_ncr_containment(
  target_ncr_id uuid,target_containment_id uuid,target_description text,target_evidence_ids uuid[],target_expected_version bigint,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare n public.non_conformance%rowtype; next_version bigint; next_sequence integer; begin
  select * into strict n from public.non_conformance where id=target_ncr_id for update;
  perform app_private.m09_assert_responsible_actor(n.id,target_occurred_at);
  if n.state<>'ISSUED' or coalesce(cardinality(target_evidence_ids),0)=0
    or exists(select 1 from unnest(target_evidence_ids) evidence_id where not exists(
      select 1 from public.ncr_evidence e where e.id=evidence_id and e.ncr_id=n.id and e.evidence_phase='CONTAINMENT')) then
    raise exception 'ISSUED NCR and exact containment evidence required' using errcode='23514';
  end if;
  next_version:=app_private.next_version(n.version_no,target_expected_version);
  select coalesce(max(sequence_no),0)+1 into next_sequence from public.ncr_containment_action where ncr_id=n.id;
  insert into public.ncr_containment_action(id,ncr_id,sequence_no,action_description,performed_by_user_id,performed_at)
    values(target_containment_id,n.id,next_sequence,target_description,app_private.current_effective_actor_user_id(),target_occurred_at);
  insert into public.ncr_containment_evidence(containment_action_id,ncr_id,ncr_evidence_id)
    select target_containment_id,n.id,evidence_id from unnest(target_evidence_ids) evidence_id;
  perform set_config('app.m09_command',n.id::text,true);
  update public.non_conformance set state='CONTAINMENT',version_no=next_version,updated_at=target_occurred_at where id=n.id;
  perform app_private.append_m09_transition(target_audit_id,target_transition_id,target_outbox_id,'ncr.action.perform','NON_CONFORMANCE',n.id,
    'SM-NCR-V1','EVT-NCR-CONTAIN','NCR_EVENT_REF','ISSUED','CONTAINMENT',n.version_no,next_version,'NCR-CONTAINED',target_containment_id,target_occurred_at);
  return next_version;
end $$;

create or replace function public.request_ncr_root_cause(
  target_ncr_id uuid,target_request_id uuid,target_reason text,target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare n public.non_conformance%rowtype; next_version bigint; begin
  select * into strict n from public.non_conformance where id=target_ncr_id for update;
  perform app_private.m09_assert_direct_internal(n.contract_id,target_occurred_at,'ncr.action.perform');
  if n.state<>'CONTAINMENT' or nullif(btrim(target_reason),'') is null then
    raise exception 'CONTAINMENT NCR and root-cause request reason required' using errcode='23514';
  end if;
  next_version:=app_private.next_version(n.version_no,target_expected_version);
  insert into public.ncr_root_cause_request(id,ncr_id,reason,requested_by_user_id,requested_at)
    values(target_request_id,n.id,target_reason,app_private.current_effective_actor_user_id(),target_occurred_at);
  perform set_config('app.m09_command',n.id::text,true);
  update public.non_conformance set state='ROOT_CAUSE_REQUIRED',version_no=next_version,updated_at=target_occurred_at where id=n.id;
  perform app_private.append_m09_transition(target_audit_id,target_transition_id,target_outbox_id,'ncr.action.perform','NON_CONFORMANCE',n.id,
    'SM-NCR-V1','EVT-NCR-REQUEST-ROOT-CAUSE','NCR_EVENT_REF','CONTAINMENT','ROOT_CAUSE_REQUIRED',n.version_no,next_version,
    'NCR-ROOT-CAUSE-REQUESTED',target_request_id,target_occurred_at);
  return next_version;
end $$;

create or replace function public.record_ncr_root_cause(
  target_ncr_id uuid,target_root_cause_id uuid,target_method_code text,target_analysis text,target_evidence_ids uuid[],
  target_audit_id uuid,target_occurred_at timestamptz
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare n public.non_conformance%rowtype; next_sequence integer; begin
  select * into strict n from public.non_conformance where id=target_ncr_id for share;
  perform app_private.m09_assert_responsible_actor(n.id,target_occurred_at);
  if n.state<>'ROOT_CAUSE_REQUIRED' or coalesce(cardinality(target_evidence_ids),0)=0
    or exists(select 1 from unnest(target_evidence_ids) evidence_id where not exists(
      select 1 from public.ncr_evidence e where e.id=evidence_id and e.ncr_id=n.id and e.evidence_phase='ROOT_CAUSE')) then
    raise exception 'ROOT_CAUSE_REQUIRED NCR and exact root-cause evidence required' using errcode='23514';
  end if;
  select coalesce(max(sequence_no),0)+1 into next_sequence from public.ncr_root_cause_analysis where ncr_id=n.id;
  insert into public.ncr_root_cause_analysis(id,ncr_id,sequence_no,method_code,analysis,submitted_by_user_id,submitted_at)
    values(target_root_cause_id,n.id,next_sequence,target_method_code,target_analysis,app_private.current_effective_actor_user_id(),target_occurred_at);
  insert into public.ncr_root_cause_evidence(root_cause_analysis_id,ncr_id,ncr_evidence_id)
    select target_root_cause_id,n.id,evidence_id from unnest(target_evidence_ids) evidence_id;
  perform app_private.append_audit(target_audit_id,'ncr.action.perform','NON_CONFORMANCE',n.id,n.version_no,'SUCCEEDED',
    'NCR-ROOT-CAUSE-RECORDED',target_root_cause_id,null,null,null,target_occurred_at);
  return target_root_cause_id;
end $$;

create or replace function public.propose_corrective_action(
  target_car_id uuid,target_car_no text,target_ncr_id uuid,target_root_cause_id uuid,target_action_plan text,target_acceptance_criteria text,
  target_owner_kind text,target_owner_user_id uuid,target_owner_vendor_id uuid,target_is_required boolean,target_due_date date,
  target_evidence_ids uuid[],target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare n public.non_conformance%rowtype; begin
  select * into strict n from public.non_conformance where id=target_ncr_id for share;
  perform app_private.m09_assert_responsible_actor(n.id,target_occurred_at);
  if n.state<>'ROOT_CAUSE_REQUIRED' or target_due_date<target_occurred_at::date
    or not exists(select 1 from public.ncr_root_cause_analysis r where r.id=target_root_cause_id and r.ncr_id=n.id)
    or coalesce(cardinality(target_evidence_ids),0)=0
    or exists(select 1 from unnest(target_evidence_ids) evidence_id where not exists(
      select 1 from public.ncr_evidence e where e.id=evidence_id and e.ncr_id=n.id and e.evidence_phase='ACTION_PLAN')) then
    raise exception 'exact root cause, future due date and action-plan evidence required' using errcode='23514';
  end if;
  if target_owner_kind='VENDOR' and target_owner_vendor_id is distinct from n.action_assigned_vendor_id then
    raise exception 'Vendor CAR owner must match exact assigned NCR Vendor' using errcode='23514';
  elsif target_owner_kind='INTERNAL' and not exists(select 1 from public.user_account u where u.id=target_owner_user_id
      and u.account_kind='INTERNAL' and u.status='ACTIVE') then
    raise exception 'active internal CAR owner required' using errcode='23514';
  end if;
  insert into public.corrective_action(id,ncr_id,car_no,root_cause_analysis_id,action_plan,acceptance_criteria,owner_kind,owner_user_id,
    owner_vendor_id,is_required,due_date,state,version_no,created_by_user_id,created_at,updated_at)
  values(target_car_id,n.id,target_car_no,target_root_cause_id,target_action_plan,target_acceptance_criteria,target_owner_kind,
    target_owner_user_id,target_owner_vendor_id,target_is_required,target_due_date,'PROPOSED',1,
    app_private.current_effective_actor_user_id(),target_occurred_at,target_occurred_at);
  insert into public.car_plan_evidence(corrective_action_id,ncr_id,ncr_evidence_id)
    select target_car_id,n.id,evidence_id from unnest(target_evidence_ids) evidence_id;
  perform app_private.append_m09_transition(target_audit_id,target_transition_id,target_outbox_id,'ncr.action.perform','CORRECTIVE_ACTION',target_car_id,
    'SM-CAR-V1','EVT-CAR-PROPOSE','CAR_EVENT_REF',null,'PROPOSED',0,1,'CAR-PROPOSED',target_root_cause_id,target_occurred_at);
  return target_car_id;
end $$;

create or replace function public.submit_ncr_action_plan(
  target_ncr_id uuid,target_evidence_ids uuid[],target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare n public.non_conformance%rowtype; next_version bigint; begin
  select * into strict n from public.non_conformance where id=target_ncr_id for update;
  perform app_private.m09_assert_responsible_actor(n.id,target_occurred_at);
  if n.state<>'ROOT_CAUSE_REQUIRED' or not exists(select 1 from public.ncr_root_cause_analysis r where r.ncr_id=n.id)
    or not exists(select 1 from public.corrective_action c where c.ncr_id=n.id and c.is_required and c.state='PROPOSED')
    or coalesce(cardinality(target_evidence_ids),0)=0
    or exists(select 1 from unnest(target_evidence_ids) evidence_id where not exists(
      select 1 from public.ncr_evidence e where e.id=evidence_id and e.ncr_id=n.id and e.evidence_phase='ACTION_PLAN')) then
    raise exception 'root cause and at least one required proposed CAR required' using errcode='23514';
  end if;
  next_version:=app_private.next_version(n.version_no,target_expected_version);
  perform set_config('app.m09_command',n.id::text,true);
  update public.non_conformance set state='ACTION_PLAN_REVIEW',version_no=next_version,updated_at=target_occurred_at where id=n.id;
  perform app_private.append_m09_transition(target_audit_id,target_transition_id,target_outbox_id,'ncr.action.perform','NON_CONFORMANCE',n.id,
    'SM-NCR-V1','EVT-NCR-SUBMIT-PLAN','NCR_EVENT_REF','ROOT_CAUSE_REQUIRED','ACTION_PLAN_REVIEW',n.version_no,next_version,
    'NCR-ACTION-PLAN-SUBMITTED',null,target_occurred_at);
  return next_version;
end $$;

create or replace function app_private.m09_assert_car_owner(target_car_id uuid,target_occurred_at timestamptz)
returns void language plpgsql stable security definer set search_path=pg_catalog,public,app_private
as $$ declare c public.corrective_action%rowtype; n public.non_conformance%rowtype; begin
  select * into strict c from public.corrective_action where id=target_car_id;
  select * into strict n from public.non_conformance where id=c.ncr_id;
  if c.owner_kind='INTERNAL' then
    perform app_private.m09_assert_direct_internal(n.contract_id,target_occurred_at,'ncr.action.perform');
    if c.owner_user_id<>app_private.current_effective_actor_user_id() then
      raise exception 'only exact internal CAR owner may perform action' using errcode='42501';
    end if;
  else
    if c.owner_vendor_id is distinct from n.action_assigned_vendor_id or not app_private.m09_vendor_can_act(n.id,target_occurred_at) then
      raise exception 'only exact assigned Vendor may perform CAR action' using errcode='42501';
    end if;
  end if;
end $$;

create or replace function public.accept_corrective_action(
  target_car_id uuid,target_evidence_ids uuid[],target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare c public.corrective_action%rowtype; n public.non_conformance%rowtype; next_version bigint; begin
  select * into strict c from public.corrective_action where id=target_car_id for update;
  select * into strict n from public.non_conformance where id=c.ncr_id for share;
  perform app_private.m09_assert_direct_internal(n.contract_id,target_occurred_at,'ncr.plan.review');
  if n.state<>'ACTION_PLAN_REVIEW' or c.state<>'PROPOSED' or coalesce(cardinality(target_evidence_ids),0)=0
    or exists(select 1 from unnest(target_evidence_ids) evidence_id where not exists(
      select 1 from public.ncr_evidence e where e.id=evidence_id and e.ncr_id=n.id and e.evidence_phase='PLAN_REVIEW')) then
    raise exception 'proposed CAR and exact plan-review evidence required' using errcode='23514';
  end if;
  next_version:=app_private.next_version(c.version_no,target_expected_version);
  perform set_config('app.m09_command',c.id::text,true);
  update public.corrective_action set state='ACCEPTED',version_no=next_version,updated_at=target_occurred_at where id=c.id;
  perform app_private.append_m09_transition(target_audit_id,target_transition_id,target_outbox_id,'ncr.plan.review','CORRECTIVE_ACTION',c.id,
    'SM-CAR-V1','EVT-CAR-ACCEPT','CAR_EVENT_REF','PROPOSED','ACCEPTED',c.version_no,next_version,'CAR-PLAN-ACCEPTED',null,target_occurred_at);
  return next_version;
end $$;

create or replace function public.accept_ncr_action_plan(
  target_ncr_id uuid,target_evidence_ids uuid[],target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare n public.non_conformance%rowtype; next_version bigint; begin
  select * into strict n from public.non_conformance where id=target_ncr_id for update;
  perform app_private.m09_assert_direct_internal(n.contract_id,target_occurred_at,'ncr.plan.review');
  if n.state<>'ACTION_PLAN_REVIEW' or not exists(select 1 from public.corrective_action c where c.ncr_id=n.id and c.is_required)
    or exists(select 1 from public.corrective_action c where c.ncr_id=n.id and c.is_required and c.state<>'ACCEPTED')
    or coalesce(cardinality(target_evidence_ids),0)=0
    or exists(select 1 from unnest(target_evidence_ids) evidence_id where not exists(
      select 1 from public.ncr_evidence e where e.id=evidence_id and e.ncr_id=n.id and e.evidence_phase='PLAN_REVIEW')) then
    raise exception 'all required CAR plans must be accepted' using errcode='23514';
  end if;
  next_version:=app_private.next_version(n.version_no,target_expected_version);
  perform set_config('app.m09_command',n.id::text,true);
  update public.non_conformance set state='IMPLEMENTING',version_no=next_version,updated_at=target_occurred_at where id=n.id;
  perform app_private.append_m09_transition(target_audit_id,target_transition_id,target_outbox_id,'ncr.plan.review','NON_CONFORMANCE',n.id,
    'SM-NCR-V1','EVT-NCR-ACCEPT-PLAN','NCR_EVENT_REF','ACTION_PLAN_REVIEW','IMPLEMENTING',n.version_no,next_version,
    'NCR-ACTION-PLAN-ACCEPTED',null,target_occurred_at);
  return next_version;
end $$;

create or replace function public.start_corrective_action(
  target_car_id uuid,target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare c public.corrective_action%rowtype; n public.non_conformance%rowtype; next_version bigint; begin
  select * into strict c from public.corrective_action where id=target_car_id for update;
  select * into strict n from public.non_conformance where id=c.ncr_id for share;
  perform app_private.m09_assert_car_owner(c.id,target_occurred_at);
  if n.state<>'IMPLEMENTING' or c.state<>'ACCEPTED' then raise exception 'accepted CAR under implementing NCR required' using errcode='23514'; end if;
  next_version:=app_private.next_version(c.version_no,target_expected_version);
  perform set_config('app.m09_command',c.id::text,true);
  update public.corrective_action set state='IN_PROGRESS',version_no=next_version,updated_at=target_occurred_at where id=c.id;
  perform app_private.append_m09_transition(target_audit_id,target_transition_id,target_outbox_id,'ncr.action.perform','CORRECTIVE_ACTION',c.id,
    'SM-CAR-V1','EVT-CAR-START','CAR_EVENT_REF','ACCEPTED','IN_PROGRESS',c.version_no,next_version,'CAR-STARTED',null,target_occurred_at);
  return next_version;
end $$;

create or replace function public.record_car_action_execution(
  target_car_id uuid,target_execution_id uuid,target_description text,target_evidence_ids uuid[],target_audit_id uuid,target_occurred_at timestamptz
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare c public.corrective_action%rowtype; next_sequence integer; begin
  select * into strict c from public.corrective_action where id=target_car_id for share;
  perform app_private.m09_assert_car_owner(c.id,target_occurred_at);
  if c.state<>'IN_PROGRESS' or coalesce(cardinality(target_evidence_ids),0)=0
    or exists(select 1 from unnest(target_evidence_ids) evidence_id where not exists(
      select 1 from public.ncr_evidence e where e.id=evidence_id and e.ncr_id=c.ncr_id and e.evidence_phase='IMPLEMENTATION')) then
    raise exception 'IN_PROGRESS CAR and exact implementation evidence required' using errcode='23514';
  end if;
  select coalesce(max(sequence_no),0)+1 into next_sequence from public.car_action_execution where corrective_action_id=c.id;
  insert into public.car_action_execution(id,corrective_action_id,ncr_id,sequence_no,action_description,performed_by_user_id,performed_at)
    values(target_execution_id,c.id,c.ncr_id,next_sequence,target_description,app_private.current_effective_actor_user_id(),target_occurred_at);
  insert into public.car_action_execution_evidence(execution_id,corrective_action_id,ncr_id,ncr_evidence_id)
    select target_execution_id,c.id,c.ncr_id,evidence_id from unnest(target_evidence_ids) evidence_id;
  perform app_private.append_audit(target_audit_id,'ncr.action.perform','CORRECTIVE_ACTION',c.id,c.version_no,'SUCCEEDED',
    'CAR-ACTION-RECORDED',target_execution_id,null,null,null,target_occurred_at);
  return target_execution_id;
end $$;

create or replace function public.submit_corrective_action_verification(
  target_car_id uuid,target_evidence_ids uuid[],target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare c public.corrective_action%rowtype; next_version bigint; begin
  select * into strict c from public.corrective_action where id=target_car_id for update;
  perform app_private.m09_assert_car_owner(c.id,target_occurred_at);
  if c.state<>'IN_PROGRESS' or not exists(select 1 from public.car_action_execution x where x.corrective_action_id=c.id)
    or coalesce(cardinality(target_evidence_ids),0)=0
    or exists(select 1 from unnest(target_evidence_ids) evidence_id where not exists(
      select 1 from public.car_action_execution_evidence x where x.corrective_action_id=c.id and x.ncr_evidence_id=evidence_id)) then
    raise exception 'implemented CAR evidence required before verification' using errcode='23514';
  end if;
  next_version:=app_private.next_version(c.version_no,target_expected_version);
  perform set_config('app.m09_command',c.id::text,true);
  update public.corrective_action set state='VERIFICATION_REQUIRED',version_no=next_version,updated_at=target_occurred_at where id=c.id;
  perform app_private.append_m09_transition(target_audit_id,target_transition_id,target_outbox_id,'ncr.action.perform','CORRECTIVE_ACTION',c.id,
    'SM-CAR-V1','EVT-CAR-SUBMIT-VERIFY','CAR_EVENT_REF','IN_PROGRESS','VERIFICATION_REQUIRED',c.version_no,next_version,
    'CAR-VERIFICATION-REQUESTED',null,target_occurred_at);
  return next_version;
end $$;

create or replace function public.ready_ncr_verification(
  target_ncr_id uuid,target_evidence_ids uuid[],target_expected_version bigint,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare n public.non_conformance%rowtype; next_version bigint; begin
  select * into strict n from public.non_conformance where id=target_ncr_id for update;
  perform app_private.m09_assert_responsible_actor(n.id,target_occurred_at);
  if n.state<>'IMPLEMENTING' or not exists(select 1 from public.corrective_action c where c.ncr_id=n.id and c.is_required)
    or exists(select 1 from public.corrective_action c where c.ncr_id=n.id and c.is_required
      and c.state not in ('VERIFICATION_REQUIRED','EFFECTIVE','CLOSED'))
    or coalesce(cardinality(target_evidence_ids),0)=0
    or exists(select 1 from unnest(target_evidence_ids) evidence_id where not exists(
      select 1 from public.ncr_evidence e where e.id=evidence_id and e.ncr_id=n.id and e.evidence_phase='IMPLEMENTATION')) then
    raise exception 'all required CARs must be ready for verification' using errcode='23514';
  end if;
  next_version:=app_private.next_version(n.version_no,target_expected_version);
  perform set_config('app.m09_command',n.id::text,true);
  update public.non_conformance set state='VERIFICATION',version_no=next_version,updated_at=target_occurred_at where id=n.id;
  perform app_private.append_m09_transition(target_audit_id,target_transition_id,target_outbox_id,'ncr.action.perform','NON_CONFORMANCE',n.id,
    'SM-NCR-V1','EVT-NCR-READY-VERIFY','NCR_EVENT_REF','IMPLEMENTING','VERIFICATION',n.version_no,next_version,
    'NCR-READY-FOR-VERIFICATION',null,target_occurred_at);
  return next_version;
end $$;

create or replace function public.verify_corrective_action_effectiveness(
  target_car_id uuid,target_verification_id uuid,target_result text,target_summary text,target_evidence_ids uuid[],target_expected_version bigint,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare c public.corrective_action%rowtype; n public.non_conformance%rowtype; next_version bigint; next_sequence integer;
  target_event text; begin
  select * into strict c from public.corrective_action where id=target_car_id for update;
  select * into strict n from public.non_conformance where id=c.ncr_id for share;
  perform app_private.m09_assert_direct_internal(n.contract_id,target_occurred_at,'ncr.effectiveness.verify');
  if c.state<>'VERIFICATION_REQUIRED' or target_result not in ('EFFECTIVE','INEFFECTIVE')
    or (c.owner_user_id is not null and c.owner_user_id=app_private.current_effective_actor_user_id())
    or exists(select 1 from public.car_action_execution x where x.corrective_action_id=c.id
      and x.performed_by_user_id=app_private.current_effective_actor_user_id())
    or coalesce(cardinality(target_evidence_ids),0)=0
    or exists(select 1 from unnest(target_evidence_ids) evidence_id where not exists(
      select 1 from public.ncr_evidence e where e.id=evidence_id and e.ncr_id=n.id and e.evidence_phase='VERIFICATION')) then
    raise exception 'independent verifier, exact verification evidence and pending CAR required' using errcode='23514';
  end if;
  next_version:=app_private.next_version(c.version_no,target_expected_version);
  select coalesce(max(sequence_no),0)+1 into next_sequence from public.car_verification where corrective_action_id=c.id;
  insert into public.car_verification(id,corrective_action_id,ncr_id,sequence_no,result,verification_summary,verifier_user_id,verified_at)
    values(target_verification_id,c.id,n.id,next_sequence,target_result,target_summary,app_private.current_effective_actor_user_id(),target_occurred_at);
  insert into public.car_verification_evidence(verification_id,corrective_action_id,ncr_id,ncr_evidence_id)
    select target_verification_id,c.id,n.id,evidence_id from unnest(target_evidence_ids) evidence_id;
  perform set_config('app.m09_command',c.id::text,true);
  update public.corrective_action set state=target_result,version_no=next_version,updated_at=target_occurred_at where id=c.id;
  target_event:=case target_result when 'EFFECTIVE' then 'EVT-CAR-VERIFY-EFFECTIVE' else 'EVT-CAR-VERIFY-INEFFECTIVE' end;
  perform app_private.append_m09_transition(target_audit_id,target_transition_id,target_outbox_id,'ncr.effectiveness.verify','CORRECTIVE_ACTION',c.id,
    'SM-CAR-V1',target_event,'CAR_EVENT_REF','VERIFICATION_REQUIRED',target_result,c.version_no,next_version,
    'CAR-EFFECTIVENESS-VERIFIED',target_verification_id,target_occurred_at);
  return next_version;
end $$;

create or replace function public.rework_corrective_action(
  target_car_id uuid,target_rework_event_id uuid,target_reason text,target_evidence_ids uuid[],target_expected_version bigint,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare c public.corrective_action%rowtype; next_version bigint; begin
  select * into strict c from public.corrective_action where id=target_car_id for update;
  perform app_private.m09_assert_car_owner(c.id,target_occurred_at);
  if c.state<>'INEFFECTIVE' or not exists(select 1 from public.car_verification v where v.corrective_action_id=c.id and v.result='INEFFECTIVE')
    or nullif(btrim(target_reason),'') is null or coalesce(cardinality(target_evidence_ids),0)=0
    or exists(select 1 from unnest(target_evidence_ids) evidence_id where not exists(
      select 1 from public.ncr_evidence e where e.id=evidence_id and e.ncr_id=c.ncr_id and e.evidence_phase='IMPLEMENTATION')) then
    raise exception 'retained ineffective verification required' using errcode='23514';
  end if;
  next_version:=app_private.next_version(c.version_no,target_expected_version);
  insert into public.car_rework_event(id,corrective_action_id,ncr_id,effectiveness_cycle,reason,reworked_by_user_id,reworked_at)
    values(target_rework_event_id,c.id,c.ncr_id,c.effectiveness_cycle+1,target_reason,app_private.current_effective_actor_user_id(),target_occurred_at);
  insert into public.car_rework_evidence(rework_event_id,corrective_action_id,ncr_id,ncr_evidence_id)
    select target_rework_event_id,c.id,c.ncr_id,evidence_id from unnest(target_evidence_ids) evidence_id;
  perform set_config('app.m09_command',c.id::text,true);
  update public.corrective_action set state='IN_PROGRESS',effectiveness_cycle=effectiveness_cycle+1,
    version_no=next_version,updated_at=target_occurred_at where id=c.id;
  perform app_private.append_m09_transition(target_audit_id,target_transition_id,target_outbox_id,'ncr.action.perform','CORRECTIVE_ACTION',c.id,
    'SM-CAR-V1','EVT-CAR-REWORK','CAR_EVENT_REF','INEFFECTIVE','IN_PROGRESS',c.version_no,next_version,
    'CAR-REWORK-STARTED',target_rework_event_id,target_occurred_at);
  return next_version;
end $$;

create or replace function public.close_corrective_action(
  target_car_id uuid,target_close_event_id uuid,target_evidence_ids uuid[],target_expected_version bigint,target_audit_id uuid,
  target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare c public.corrective_action%rowtype; n public.non_conformance%rowtype; next_version bigint; begin
  select * into strict c from public.corrective_action where id=target_car_id for update;
  select * into strict n from public.non_conformance where id=c.ncr_id for share;
  perform app_private.m09_assert_direct_internal(n.contract_id,target_occurred_at,'ncr.record.close');
  if c.state<>'EFFECTIVE' or not exists(select 1 from public.car_verification v where v.corrective_action_id=c.id
      and v.result='EFFECTIVE' and v.sequence_no=c.effectiveness_cycle)
    or coalesce(cardinality(target_evidence_ids),0)=0
    or exists(select 1 from unnest(target_evidence_ids) evidence_id where not exists(
      select 1 from public.ncr_evidence e where e.id=evidence_id and e.ncr_id=c.ncr_id and e.evidence_phase='CLOSE')) then
    raise exception 'effective independently verified CAR required' using errcode='23514';
  end if;
  next_version:=app_private.next_version(c.version_no,target_expected_version);
  insert into public.car_close_event(id,corrective_action_id,ncr_id,closed_version,closed_by_user_id,closed_at)
    values(target_close_event_id,c.id,c.ncr_id,next_version,app_private.current_effective_actor_user_id(),target_occurred_at);
  insert into public.car_close_evidence(close_event_id,corrective_action_id,ncr_id,ncr_evidence_id)
    select target_close_event_id,c.id,c.ncr_id,evidence_id from unnest(target_evidence_ids) evidence_id;
  perform set_config('app.m09_command',c.id::text,true);
  update public.corrective_action set state='CLOSED',version_no=next_version,updated_at=target_occurred_at where id=c.id;
  perform app_private.append_m09_transition(target_audit_id,target_transition_id,target_outbox_id,'ncr.record.close','CORRECTIVE_ACTION',c.id,
    'SM-CAR-V1','EVT-CAR-CLOSE','CAR_EVENT_REF','EFFECTIVE','CLOSED',c.version_no,next_version,'CAR-CLOSED',target_close_event_id,target_occurred_at);
  return next_version;
end $$;

create or replace function public.close_non_conformance(
  target_ncr_id uuid,target_close_event_id uuid,target_reason text,target_evidence_ids uuid[],target_expected_version bigint,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare n public.non_conformance%rowtype; next_version bigint; begin
  select * into strict n from public.non_conformance where id=target_ncr_id for update;
  perform app_private.m09_assert_direct_internal(n.contract_id,target_occurred_at,'ncr.record.close');
  if n.state<>'VERIFICATION' or nullif(btrim(target_reason),'') is null
    or not exists(select 1 from public.corrective_action c where c.ncr_id=n.id and c.is_required and c.state<>'CANCELLED')
    or exists(select 1 from public.corrective_action c where c.ncr_id=n.id and c.is_required and c.state<>'CANCELLED'
      and (c.state not in ('EFFECTIVE','CLOSED') or not exists(select 1 from public.car_verification v
        where v.corrective_action_id=c.id and v.result='EFFECTIVE' and v.sequence_no=c.effectiveness_cycle)))
    or coalesce(cardinality(target_evidence_ids),0)=0
    or exists(select 1 from unnest(target_evidence_ids) evidence_id where not exists(
      select 1 from public.ncr_evidence e where e.id=evidence_id and e.ncr_id=n.id and e.evidence_phase='CLOSE')) then
    raise exception 'every required non-cancelled CAR must be effective or closed with exact close evidence' using errcode='23514';
  end if;
  next_version:=app_private.next_version(n.version_no,target_expected_version);
  insert into public.ncr_close_event(id,ncr_id,closed_version,reason,closed_by_user_id,closed_at)
    values(target_close_event_id,n.id,next_version,target_reason,app_private.current_effective_actor_user_id(),target_occurred_at);
  insert into public.ncr_close_evidence(close_event_id,ncr_id,ncr_evidence_id)
    select target_close_event_id,n.id,evidence_id from unnest(target_evidence_ids) evidence_id;
  perform set_config('app.m09_command',n.id::text,true);
  update public.non_conformance set state='CLOSED',version_no=next_version,updated_at=target_occurred_at where id=n.id;
  perform app_private.append_m09_transition(target_audit_id,target_transition_id,target_outbox_id,'ncr.record.close','NON_CONFORMANCE',n.id,
    'SM-NCR-V1','EVT-NCR-CLOSE','NCR_EVENT_REF','VERIFICATION','CLOSED',n.version_no,next_version,'NCR-CLOSED',target_close_event_id,target_occurred_at);
  return next_version;
end $$;

create or replace function public.reopen_non_conformance(
  target_ncr_id uuid,target_reopen_event_id uuid,target_reason text,target_evidence_ids uuid[],target_expected_version bigint,
  target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare n public.non_conformance%rowtype; prior_close public.ncr_close_event%rowtype;
  next_version bigint; next_reopen_count integer; begin
  select * into strict n from public.non_conformance where id=target_ncr_id for update;
  perform app_private.m09_assert_direct_internal(n.contract_id,target_occurred_at,'ncr.record.close');
  if n.state<>'CLOSED' or nullif(btrim(target_reason),'') is null or coalesce(cardinality(target_evidence_ids),0)=0
    or exists(select 1 from unnest(target_evidence_ids) evidence_id where not exists(
      select 1 from public.ncr_evidence e where e.id=evidence_id and e.ncr_id=n.id and e.evidence_phase='REOPEN')) then
    raise exception 'closed NCR with reason and exact reopen evidence required' using errcode='23514';
  end if;
  next_version:=app_private.next_version(n.version_no,target_expected_version);
  select * into strict prior_close from public.ncr_close_event where ncr_id=n.id and closed_version=n.version_no for share;
  select coalesce(max(reopen_count),0)+1 into next_reopen_count from public.ncr_reopen_event where ncr_id=n.id;
  insert into public.ncr_reopen_event(id,ncr_id,reopen_count,prior_close_event_id,prior_closed_version,prior_closed_at,
    reason,reopened_by_user_id,reopened_at)
  values(target_reopen_event_id,n.id,next_reopen_count,prior_close.id,prior_close.closed_version,prior_close.closed_at,
    target_reason,app_private.current_effective_actor_user_id(),target_occurred_at);
  insert into public.ncr_reopen_evidence(reopen_event_id,ncr_id,ncr_evidence_id)
    select target_reopen_event_id,n.id,evidence_id from unnest(target_evidence_ids) evidence_id;
  perform set_config('app.m09_command',n.id::text,true);
  update public.non_conformance set state='REOPENED',version_no=next_version,updated_at=target_occurred_at where id=n.id;
  perform app_private.append_m09_transition(target_audit_id,target_transition_id,target_outbox_id,'ncr.record.close','NON_CONFORMANCE',n.id,
    'SM-NCR-V1','EVT-NCR-REOPEN','NCR_EVENT_REF','CLOSED','REOPENED',n.version_no,next_version,'NCR-REOPENED',target_reopen_event_id,target_occurred_at);
  return next_version;
end $$;

comment on function public.reopen_non_conformance(uuid,uuid,text,uuid[],bigint,uuid,uuid,uuid,timestamptz) is
  'OD-031: CLOSED to REOPENED only. M09 intentionally registers no REOPENED exit transition until follow-up policy is decided.';

create or replace function public.read_ncr_vendor_action(target_ncr_id uuid,target_occurred_at timestamptz)
returns table(
  ncr_id uuid,ncr_no text,severity text,ncr_state text,contract_id uuid,project_id uuid,deliverable_id uuid,deliverable_version_id uuid,
  car_id uuid,car_no text,car_state text,action_plan text,acceptance_criteria text,due_date date
) language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select n.id,n.ncr_no,n.severity,n.state,n.contract_id,n.project_id,n.deliverable_id,n.deliverable_version_id,
    c.id,c.car_no,c.state,c.action_plan,c.acceptance_criteria,c.due_date
  from public.non_conformance n left join public.corrective_action c on c.ncr_id=n.id and c.owner_kind='VENDOR'
    and c.owner_vendor_id=n.action_assigned_vendor_id
  where n.id=target_ncr_id and target_occurred_at=app_private.request_time()
    and app_private.m09_vendor_can_act(n.id,target_occurred_at)
$$;
comment on function public.read_ncr_vendor_action(uuid,timestamptz) is
  'NCR_DETAIL_VENDOR_ACTION_V1: exact assigned Vendor action fields only; excludes responsibility deliberation, internal owner/notes, remedies and finance.';

do $rls$ declare table_name text; begin
  foreach table_name in array array[
    'non_conformance','ncr_responsibility_assessment','ncr_responsibility_assessment_evidence','ncr_evidence',
    'ncr_containment_action','ncr_containment_evidence','ncr_root_cause_request','ncr_root_cause_analysis','ncr_root_cause_evidence',
    'corrective_action','car_plan_evidence','car_action_execution','car_action_execution_evidence','car_verification',
    'car_verification_evidence','car_rework_event','car_rework_evidence','car_close_event','car_close_evidence',
    'ncr_close_event','ncr_close_evidence','ncr_reopen_event','ncr_reopen_evidence'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
  end loop;
end $rls$;

create policy ncr_internal_read on public.non_conformance for select to youone_request
  using(app_private.actor_has_contract_internal_scope(contract_id,app_private.request_time()));
create policy car_internal_read on public.corrective_action for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy ncr_responsibility_internal_read on public.ncr_responsibility_assessment for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy ncr_responsibility_evidence_internal_read on public.ncr_responsibility_assessment_evidence for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy ncr_evidence_internal_read on public.ncr_evidence for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy ncr_containment_internal_read on public.ncr_containment_action for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy ncr_root_cause_internal_read on public.ncr_root_cause_analysis for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy ncr_root_cause_request_internal_read on public.ncr_root_cause_request for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy car_execution_internal_read on public.car_action_execution for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy car_verification_internal_read on public.car_verification for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy car_rework_internal_read on public.car_rework_event for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy car_close_internal_read on public.car_close_event for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy ncr_close_internal_read on public.ncr_close_event for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy ncr_reopen_internal_read on public.ncr_reopen_event for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy ncr_containment_evidence_internal_read on public.ncr_containment_evidence for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy ncr_root_cause_evidence_internal_read on public.ncr_root_cause_evidence for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy car_plan_evidence_internal_read on public.car_plan_evidence for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy car_execution_evidence_internal_read on public.car_action_execution_evidence for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy car_verification_evidence_internal_read on public.car_verification_evidence for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy car_rework_evidence_internal_read on public.car_rework_evidence for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy car_close_evidence_internal_read on public.car_close_evidence for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy ncr_close_evidence_internal_read on public.ncr_close_evidence for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));
create policy ncr_reopen_evidence_internal_read on public.ncr_reopen_evidence for select to youone_request
  using(exists(select 1 from public.non_conformance n where n.id=ncr_id
    and app_private.actor_has_contract_internal_scope(n.contract_id,app_private.request_time())));

revoke all on public.non_conformance,public.ncr_responsibility_assessment,public.ncr_responsibility_assessment_evidence,
  public.ncr_evidence,public.ncr_containment_action,public.ncr_containment_evidence,public.ncr_root_cause_request,
  public.ncr_root_cause_analysis,public.ncr_root_cause_evidence,public.corrective_action,public.car_plan_evidence,
  public.car_action_execution,public.car_action_execution_evidence,public.car_verification,public.car_verification_evidence,
  public.car_rework_event,public.car_rework_evidence,public.car_close_event,public.car_close_evidence,
  public.ncr_close_event,public.ncr_close_evidence,public.ncr_reopen_event,public.ncr_reopen_evidence
from public,youone_request,youone_privileged_writer;
grant select on public.non_conformance,public.ncr_responsibility_assessment,public.ncr_responsibility_assessment_evidence,
  public.ncr_evidence,public.ncr_containment_action,public.ncr_containment_evidence,public.ncr_root_cause_request,
  public.ncr_root_cause_analysis,public.ncr_root_cause_evidence,public.corrective_action,public.car_plan_evidence,
  public.car_action_execution,public.car_action_execution_evidence,public.car_verification,public.car_verification_evidence,
  public.car_rework_event,public.car_rework_evidence,public.car_close_event,public.car_close_evidence,
  public.ncr_close_event,public.ncr_close_evidence,public.ncr_reopen_event,public.ncr_reopen_evidence
to youone_request;

revoke all on function app_private.m09_assert_direct_internal(uuid,timestamptz,text),
  app_private.m09_vendor_can_act(uuid,timestamptz),app_private.m09_assert_responsible_actor(uuid,timestamptz),
  app_private.m09_assert_car_owner(uuid,timestamptz),
  app_private.append_m09_transition(uuid,uuid,uuid,text,text,uuid,text,text,text,text,text,bigint,bigint,text,uuid,timestamptz)
from public,youone_request,youone_privileged_writer;

revoke all on function public.create_ncr_draft(uuid,text,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,uuid,uuid,uuid,timestamptz),
  public.append_ncr_evidence(uuid,uuid,text,text,uuid,bigint,text,uuid,timestamptz),
  public.record_ncr_responsibility_assessment(uuid,uuid,text,text,uuid,text,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.issue_non_conformance(uuid,bigint,uuid,uuid,uuid,timestamptz),
  public.record_ncr_containment(uuid,uuid,text,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.request_ncr_root_cause(uuid,uuid,text,bigint,uuid,uuid,uuid,timestamptz),
  public.record_ncr_root_cause(uuid,uuid,text,text,uuid[],uuid,timestamptz),
  public.propose_corrective_action(uuid,text,uuid,uuid,text,text,text,uuid,uuid,boolean,date,uuid[],uuid,uuid,uuid,timestamptz),
  public.submit_ncr_action_plan(uuid,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.accept_corrective_action(uuid,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.accept_ncr_action_plan(uuid,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.start_corrective_action(uuid,bigint,uuid,uuid,uuid,timestamptz),
  public.record_car_action_execution(uuid,uuid,text,uuid[],uuid,timestamptz),
  public.submit_corrective_action_verification(uuid,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.ready_ncr_verification(uuid,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.verify_corrective_action_effectiveness(uuid,uuid,text,text,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.rework_corrective_action(uuid,uuid,text,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.close_corrective_action(uuid,uuid,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.close_non_conformance(uuid,uuid,text,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.reopen_non_conformance(uuid,uuid,text,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.read_ncr_vendor_action(uuid,timestamptz)
from public,youone_privileged_writer;

grant execute on function public.create_ncr_draft(uuid,text,uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,uuid,uuid,uuid,timestamptz),
  public.append_ncr_evidence(uuid,uuid,text,text,uuid,bigint,text,uuid,timestamptz),
  public.record_ncr_responsibility_assessment(uuid,uuid,text,text,uuid,text,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.issue_non_conformance(uuid,bigint,uuid,uuid,uuid,timestamptz),
  public.record_ncr_containment(uuid,uuid,text,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.request_ncr_root_cause(uuid,uuid,text,bigint,uuid,uuid,uuid,timestamptz),
  public.record_ncr_root_cause(uuid,uuid,text,text,uuid[],uuid,timestamptz),
  public.propose_corrective_action(uuid,text,uuid,uuid,text,text,text,uuid,uuid,boolean,date,uuid[],uuid,uuid,uuid,timestamptz),
  public.submit_ncr_action_plan(uuid,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.accept_corrective_action(uuid,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.accept_ncr_action_plan(uuid,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.start_corrective_action(uuid,bigint,uuid,uuid,uuid,timestamptz),
  public.record_car_action_execution(uuid,uuid,text,uuid[],uuid,timestamptz),
  public.submit_corrective_action_verification(uuid,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.ready_ncr_verification(uuid,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.verify_corrective_action_effectiveness(uuid,uuid,text,text,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.rework_corrective_action(uuid,uuid,text,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.close_corrective_action(uuid,uuid,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.close_non_conformance(uuid,uuid,text,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.reopen_non_conformance(uuid,uuid,text,uuid[],bigint,uuid,uuid,uuid,timestamptz),
  public.read_ncr_vendor_action(uuid,timestamptz)
to youone_request;
