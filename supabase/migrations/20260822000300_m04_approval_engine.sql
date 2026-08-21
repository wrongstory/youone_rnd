-- M04 Approval Engine / SM-APPROVAL-V1
-- The first concrete subject is ApprovalPolicyVersion itself. M05+ extends the
-- typed subject functions with additional FK-backed link tables; no generic ID is stored.

insert into public.aggregate_type_definition(aggregate_type) values ('APPROVAL_INSTANCE'),('APPROVAL_POLICY_VERSION') on conflict do nothing;
insert into public.action_definition(action_id) values
  ('approval.instance.create'),('approval.instance.submit'),('approval.instance.activate'),
  ('approval.step.review'),('approval.step.agree'),('approval.step.approve'),('approval.step.reject'),
  ('approval.step.reference'),
  ('approval.instance.recall.request'),('approval.instance.recall.complete'),('approval.instance.cancel'),
  ('approval.policy.manage') on conflict do nothing;
insert into public.permission(id,stable_code) values
  ('34000000-0000-4000-8000-000000000001','approval.instance.submit'),
  ('34000000-0000-4000-8000-000000000002','approval.step.review'),
  ('34000000-0000-4000-8000-000000000003','approval.step.agree'),
  ('34000000-0000-4000-8000-000000000004','approval.step.approve'),
  ('34000000-0000-4000-8000-000000000005','approval.step.reject'),
  ('34000000-0000-4000-8000-000000000006','approval.instance.recall'),
  ('34000000-0000-4000-8000-000000000007','approval.instance.cancel'),
  ('34000000-0000-4000-8000-000000000008','approval.policy.manage')
  ,('34000000-0000-4000-8000-000000000009','approval.step.reference')
on conflict(stable_code) do nothing;
insert into public.domain_event_definition(event_id,payload_schema_id,payload_schema_version) values
  ('EVT-APPROVAL-SUBMITTED','APPROVAL_EVENT_REF',1),('EVT-APPROVAL-ACTIVATED','APPROVAL_EVENT_REF',1),
  ('EVT-APPROVAL-REVIEWED','APPROVAL_EVENT_REF',1),('EVT-APPROVAL-AGREED','APPROVAL_EVENT_REF',1),
  ('EVT-APPROVAL-APPROVED','APPROVAL_EVENT_REF',1),('EVT-APPROVAL-REJECTED','APPROVAL_EVENT_REF',1),
  ('EVT-APPROVAL-COMPLETED','APPROVAL_EVENT_REF',1),('EVT-APPROVAL-RECALL-REQUESTED','APPROVAL_EVENT_REF',1),
  ('EVT-APPROVAL-RECALLED','APPROVAL_EVENT_REF',1),('EVT-APPROVAL-CANCELLED','APPROVAL_EVENT_REF',1),
  ('EVT-APPROVAL-REFERENCE-RECEIVED','APPROVAL_EVENT_REF',1)
on conflict do nothing;
insert into public.state_machine_definition(machine_id,aggregate_type) values ('SM-APPROVAL-V1','APPROVAL_INSTANCE') on conflict do nothing;
insert into public.state_definition(machine_id,state_id,is_terminal) values
  ('SM-APPROVAL-V1','DRAFT',false),('SM-APPROVAL-V1','SUBMITTED',false),('SM-APPROVAL-V1','IN_PROGRESS',false),
  ('SM-APPROVAL-V1','REJECTED',true),('SM-APPROVAL-V1','RECALL_REQUESTED',false),('SM-APPROVAL-V1','RECALLED',true),
  ('SM-APPROVAL-V1','COMPLETED',true),('SM-APPROVAL-V1','CANCELLED',true)
on conflict do nothing;
insert into public.transition_definition(machine_id,event_id,from_state,to_state) values
  ('SM-APPROVAL-V1','EVT-APPROVAL-CREATE',null,'DRAFT'),
  ('SM-APPROVAL-V1','EVT-APPROVAL-SUBMIT','DRAFT','SUBMITTED'),
  ('SM-APPROVAL-V1','EVT-APPROVAL-ACTIVATE','SUBMITTED','IN_PROGRESS'),
  ('SM-APPROVAL-V1','EVT-APPROVAL-REVIEW','IN_PROGRESS','IN_PROGRESS'),
  ('SM-APPROVAL-V1','EVT-APPROVAL-AGREE','IN_PROGRESS','IN_PROGRESS'),
  ('SM-APPROVAL-V1','EVT-APPROVAL-REFERENCE','IN_PROGRESS','IN_PROGRESS'),
  ('SM-APPROVAL-V1','EVT-APPROVAL-APPROVE','IN_PROGRESS','IN_PROGRESS'),
  ('SM-APPROVAL-V1','EVT-APPROVAL-APPROVE','IN_PROGRESS','COMPLETED'),
  ('SM-APPROVAL-V1','EVT-APPROVAL-REJECT','IN_PROGRESS','REJECTED'),
  ('SM-APPROVAL-V1','EVT-APPROVAL-REQUEST-RECALL','SUBMITTED','RECALL_REQUESTED'),
  ('SM-APPROVAL-V1','EVT-APPROVAL-REQUEST-RECALL','IN_PROGRESS','RECALL_REQUESTED'),
  ('SM-APPROVAL-V1','EVT-APPROVAL-RECALL','RECALL_REQUESTED','RECALLED'),
  ('SM-APPROVAL-V1','EVT-APPROVAL-CANCEL','DRAFT','CANCELLED'),
  ('SM-APPROVAL-V1','EVT-APPROVAL-CANCEL','RECALLED','CANCELLED'),
  ('SM-APPROVAL-V1','EVT-APPROVAL-CANCEL','REJECTED','CANCELLED')
on conflict do nothing;

create table public.approval_policy (
  id uuid primary key,
  stable_code text not null unique check(app_private.is_stable_code(stable_code)),
  status text not null check(status in ('ACTIVE','DISABLED')),
  version_no bigint not null default 0 check(version_no>=0),
  created_at timestamptz not null default statement_timestamp()
);

create table public.approval_policy_version (
  id uuid primary key,
  policy_id uuid not null references public.approval_policy(id),
  version_no bigint not null check(version_no>0),
  state text not null check(state in ('DRAFT','SEALED','PUBLISHED','RETIRED')),
  subject_kind text not null check(app_private.is_stable_code(subject_kind)),
  checksum text not null check(app_private.is_sha256(checksum)),
  recall_allowed boolean not null default true,
  valid_from timestamptz not null,
  valid_until timestamptz,
  created_by_user_id uuid not null references public.user_account(id),
  lock_version bigint not null default 0 check(lock_version>=0),
  created_at timestamptz not null default statement_timestamp(),
  unique(policy_id,version_no),
  unique(id,version_no,checksum),
  check(valid_until is null or valid_until>valid_from)
);

create table public.approval_policy_step_rule (
  id uuid primary key,
  policy_version_id uuid not null references public.approval_policy_version(id),
  step_key text not null check(app_private.is_stable_code(step_key)),
  sequence_no integer not null check(sequence_no>0),
  step_role text not null check(step_role in ('REVIEW','AGREEMENT','APPROVAL','REFERENCE')),
  completion_mode text not null check(completion_mode in ('SEQUENTIAL','ANY_ONE','ALL','SPECIFIC')),
  required boolean not null,
  unique(policy_version_id,step_key),
  unique(policy_version_id,sequence_no,step_key)
);

create table public.approval_policy_participant_rule (
  id uuid primary key,
  step_rule_id uuid not null references public.approval_policy_step_rule(id),
  selector_kind text not null check(selector_kind in ('USER','POSITION','ROLE')),
  participant_user_id uuid references public.user_account(id),
  position_id uuid references public.position(id),
  role_id uuid references public.role(id),
  participant_order integer not null default 1 check(participant_order>0),
  required_for_completion boolean not null default true,
  check((selector_kind='USER' and participant_user_id is not null and position_id is null and role_id is null)
    or (selector_kind='POSITION' and participant_user_id is null and position_id is not null and role_id is null)
    or (selector_kind='ROLE' and participant_user_id is null and position_id is null and role_id is not null)),
  unique(step_rule_id,participant_order)
);

create table public.approval_instance (
  id uuid primary key,
  policy_version_id uuid not null references public.approval_policy_version(id),
  policy_version_no bigint not null check(policy_version_no>0),
  policy_checksum_snapshot text not null check(app_private.is_sha256(policy_checksum_snapshot)),
  submitter_user_id uuid not null references public.user_account(id),
  prior_instance_id uuid references public.approval_instance(id),
  generation integer not null check(generation>0),
  state text not null check(state in ('DRAFT','SUBMITTED','IN_PROGRESS','REJECTED','RECALL_REQUESTED','RECALLED','COMPLETED','CANCELLED')),
  line_checksum text check(line_checksum is null or app_private.is_sha256(line_checksum)),
  version_no bigint not null check(version_no>=0),
  created_at timestamptz not null,
  submitted_at timestamptz,
  completed_at timestamptz,
  unique(prior_instance_id,generation),
  foreign key(policy_version_id,policy_version_no,policy_checksum_snapshot) references public.approval_policy_version(id,version_no,checksum)
);

create table public.approval_subject_policy_version (
  instance_id uuid primary key references public.approval_instance(id),
  subject_policy_version_id uuid not null references public.approval_policy_version(id),
  subject_version_no bigint not null check(subject_version_no>0),
  subject_checksum text not null check(app_private.is_sha256(subject_checksum)),
  unique(subject_policy_version_id,instance_id),
  foreign key(subject_policy_version_id,subject_version_no,subject_checksum) references public.approval_policy_version(id,version_no,checksum)
);

create table public.approval_step (
  id uuid primary key,
  instance_id uuid not null references public.approval_instance(id),
  policy_step_rule_id uuid not null references public.approval_policy_step_rule(id),
  step_key text not null check(app_private.is_stable_code(step_key)),
  sequence_no integer not null check(sequence_no>0),
  step_role text not null check(step_role in ('REVIEW','AGREEMENT','APPROVAL','REFERENCE')),
  completion_mode text not null check(completion_mode in ('SEQUENTIAL','ANY_ONE','ALL','SPECIFIC')),
  required boolean not null,
  state text not null check(state in ('WAITING','ACTIVE','REVIEWED','AGREED','APPROVED','REJECTED','SKIPPED_BY_POLICY','CANCELLED')),
  version_no bigint not null default 0 check(version_no>=0),
  unique(instance_id,step_key),
  unique(instance_id,sequence_no,step_key)
);

create table public.approval_participant (
  id uuid primary key,
  step_id uuid not null references public.approval_step(id),
  policy_participant_rule_id uuid not null references public.approval_policy_participant_rule(id),
  participant_user_id uuid not null references public.user_account(id),
  position_id_snapshot uuid references public.position(id),
  role_id_snapshot uuid references public.role(id),
  assignment_evidence_id uuid not null,
  participant_order integer not null check(participant_order>0),
  required_for_completion boolean not null,
  state text not null check(state in ('WAITING','ACTIVE','ACTED','CANCELLED')),
  version_no bigint not null default 0 check(version_no>=0),
  unique(step_id,participant_user_id),
  unique(step_id,participant_order)
);

create unique index acting_authority_id_evidence_unique on public.acting_authority_assignment(id,evidence_id);

create table public.approval_action (
  id uuid primary key,
  instance_id uuid not null references public.approval_instance(id),
  step_id uuid references public.approval_step(id),
  participant_id uuid references public.approval_participant(id),
  audit_log_id uuid not null unique references public.audit_log(id),
  event_id text not null check(event_id in ('CREATE','SUBMIT','ACTIVATE','REVIEW','AGREE','APPROVE','REJECT','REFERENCE_RECEIPT','REQUEST_RECALL','RECALL','CANCEL')),
  actor_kind text not null check(actor_kind in ('SYSTEM','USER')),
  authenticated_actor_user_id uuid references public.user_account(id),
  effective_actor_user_id uuid references public.user_account(id),
  system_actor_id text check(system_actor_id is null or app_private.is_stable_code(system_actor_id)),
  acting_authority_id uuid,
  acting_authority_evidence_id uuid,
  reason_code text check(reason_code is null or app_private.is_stable_code(reason_code)),
  opinion text check(opinion is null or length(opinion)<=4000),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default statement_timestamp(),
  check((actor_kind='USER' and authenticated_actor_user_id is not null and effective_actor_user_id is not null and system_actor_id is null)
    or (actor_kind='SYSTEM' and authenticated_actor_user_id is null and effective_actor_user_id is null and system_actor_id is not null)),
  check((acting_authority_id is null)=(acting_authority_evidence_id is null)),
  foreign key(acting_authority_id,acting_authority_evidence_id) references public.acting_authority_assignment(id,evidence_id)
);
create unique index approval_participant_terminal_action_unique on public.approval_action(participant_id) where participant_id is not null and event_id in ('REVIEW','AGREE','APPROVE','REJECT','REFERENCE_RECEIPT');
create index approval_instance_inbox_idx on public.approval_instance(state,submitted_at);
create index approval_step_instance_sequence_idx on public.approval_step(instance_id,sequence_no);
create index approval_participant_user_state_idx on public.approval_participant(participant_user_id,state);

create or replace function app_private.reject_approval_action_mutation()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin raise exception 'approval_action is append-only' using errcode='55000'; end $$;
create trigger approval_action_no_update before update on public.approval_action for each row execute function app_private.reject_approval_action_mutation();
create trigger approval_action_no_delete before delete on public.approval_action for each row execute function app_private.reject_approval_action_mutation();

create or replace function app_private.protect_approval_snapshot_columns()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$ begin
  if tg_table_name='approval_step' and (new.instance_id<>old.instance_id or new.policy_step_rule_id<>old.policy_step_rule_id or new.step_key<>old.step_key
    or new.sequence_no<>old.sequence_no or new.step_role<>old.step_role or new.completion_mode<>old.completion_mode or new.required<>old.required) then
    raise exception 'approval step snapshot is immutable' using errcode='55000';
  elsif tg_table_name='approval_participant' and (new.step_id<>old.step_id or new.policy_participant_rule_id<>old.policy_participant_rule_id
    or new.participant_user_id<>old.participant_user_id or new.position_id_snapshot is distinct from old.position_id_snapshot
    or new.role_id_snapshot is distinct from old.role_id_snapshot or new.assignment_evidence_id<>old.assignment_evidence_id
    or new.participant_order<>old.participant_order or new.required_for_completion<>old.required_for_completion) then
    raise exception 'approval participant snapshot is immutable' using errcode='55000';
  end if;
  return new;
end $$;
create trigger approval_step_snapshot_immutable before update on public.approval_step for each row execute function app_private.protect_approval_snapshot_columns();
create trigger approval_participant_snapshot_immutable before update on public.approval_participant for each row execute function app_private.protect_approval_snapshot_columns();

create or replace function app_private.guard_approval_subject_link()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ begin
  if tg_op<>'INSERT' then raise exception 'approval subject link is immutable' using errcode='55000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.subject_policy_version_id::text,0));
  if exists(select 1 from public.approval_subject_policy_version l join public.approval_instance i on i.id=l.instance_id
    where l.subject_policy_version_id=new.subject_policy_version_id and i.state not in ('REJECTED','RECALLED','CANCELLED')) then
    raise exception 'exact subject already has an active approval generation' using errcode='23505';
  end if;
  return new;
end $$;
create trigger approval_subject_link_guard before insert or update or delete on public.approval_subject_policy_version for each row execute function app_private.guard_approval_subject_link();

create or replace function app_private.protect_approval_policy_snapshot()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$ begin
  if tg_op='DELETE' then raise exception 'sealed approval policy version is immutable' using errcode='55000'; end if;
  if old.state in ('SEALED','PUBLISHED','RETIRED') then
    if not (old.state='SEALED' and new.state='PUBLISHED'
      and new.policy_id=old.policy_id and new.version_no=old.version_no and new.subject_kind=old.subject_kind
      and new.checksum=old.checksum and new.recall_allowed=old.recall_allowed and new.valid_from=old.valid_from
      and new.valid_until is not distinct from old.valid_until and new.created_by_user_id=old.created_by_user_id
      and new.lock_version=old.lock_version+1 and current_setting('app.approval_completion_instance_id',true) is not null) then
      raise exception 'sealed approval policy version is immutable' using errcode='55000';
    end if;
  end if;
  return new;
end $$;

create or replace function app_private.assert_approval_worker(target_occurred_at timestamptz)
returns void language plpgsql stable security definer set search_path=pg_catalog,app_private
as $$ begin
  if target_occurred_at is distinct from app_private.request_time()
    or app_private.required_setting('app.actor_kind')<>'SYSTEM'
    or app_private.required_setting('app.system_actor_id')<>'APPROVAL_ENGINE' then
    raise exception 'trusted approval worker context required' using errcode='42501';
  end if;
end $$;

create or replace function public.activate_approval_instance(
  target_instance_id uuid,target_expected_version bigint,target_action_record_id uuid,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare instance_row public.approval_instance%rowtype; next_version bigint; first_sequence integer; begin
  perform app_private.assert_approval_worker(target_occurred_at);
  select * into strict instance_row from public.approval_instance where id=target_instance_id for update;
  if instance_row.state<>'SUBMITTED' then raise exception 'approval instance is not submitted' using errcode='23514'; end if;
  next_version:=app_private.next_version(instance_row.version_no,target_expected_version);
  select min(sequence_no) into first_sequence from public.approval_step where instance_id=target_instance_id and state='WAITING';
  if first_sequence is null then raise exception 'submitted approval has no waiting step' using errcode='23514'; end if;
  update public.approval_step set state='ACTIVE',version_no=version_no+1 where instance_id=target_instance_id and sequence_no=first_sequence and state='WAITING';
  update public.approval_participant p set state='ACTIVE',version_no=p.version_no+1
    from public.approval_step s where s.id=p.step_id and s.instance_id=target_instance_id and s.sequence_no=first_sequence and s.state='ACTIVE'
      and p.state='WAITING' and (s.completion_mode<>'SEQUENTIAL' or p.participant_order=(select min(p2.participant_order) from public.approval_participant p2 where p2.step_id=s.id and p2.state='WAITING'));
  update public.approval_instance set state='IN_PROGRESS',version_no=next_version where id=target_instance_id;
  perform app_private.append_approval_audit_transition(target_audit_id,target_transition_id,'approval.instance.activate',target_instance_id,next_version,
    'EVT-APPROVAL-ACTIVATE','SUBMITTED','IN_PROGRESS',null,target_occurred_at);
  insert into public.approval_action(id,instance_id,audit_log_id,event_id,actor_kind,system_actor_id,occurred_at)
    values(target_action_record_id,target_instance_id,target_audit_id,'ACTIVATE','SYSTEM','APPROVAL_ENGINE',target_occurred_at);
  perform app_private.enqueue_approval_event(target_outbox_id,target_audit_id,'EVT-APPROVAL-ACTIVATED',target_instance_id,next_version,'IN_PROGRESS',target_occurred_at);
  return next_version;
end $$;

create or replace function public.perform_approval_action(
  target_instance_id uuid,target_step_id uuid,target_participant_id uuid,target_event text,
  target_expected_instance_version bigint,target_expected_step_version bigint,target_expected_participant_version bigint,
  target_action_record_id uuid,target_audit_id uuid,target_transition_id uuid,target_outbox_id uuid,
  target_reason_code text,target_opinion text,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare
  instance_row public.approval_instance%rowtype; step_row public.approval_step%rowtype; participant_row public.approval_participant%rowtype;
  permission_code text; audit_action text; transition_event text; outbox_event text; step_terminal text;
  next_version bigint; target_instance_state text:='IN_PROGRESS'; step_is_complete boolean; next_sequence integer;
  authority_row public.acting_authority_assignment%rowtype; selected_authority uuid:=app_private.current_acting_authority_id();
begin
  if target_event not in ('REVIEW','AGREE','APPROVE','REJECT','REFERENCE_RECEIPT') then raise exception 'unsupported approval action' using errcode='22023'; end if;
  permission_code:=case target_event when 'REVIEW' then 'approval.step.review' when 'AGREE' then 'approval.step.agree' when 'APPROVE' then 'approval.step.approve' when 'REFERENCE_RECEIPT' then 'approval.step.reference' else 'approval.step.reject' end;
  audit_action:=permission_code;
  transition_event:=case when target_event='REFERENCE_RECEIPT' then 'EVT-APPROVAL-REFERENCE' else 'EVT-APPROVAL-'||target_event end;
  outbox_event:=case target_event when 'REVIEW' then 'EVT-APPROVAL-REVIEWED' when 'AGREE' then 'EVT-APPROVAL-AGREED' when 'APPROVE' then 'EVT-APPROVAL-APPROVED' when 'REFERENCE_RECEIPT' then 'EVT-APPROVAL-REFERENCE-RECEIVED' else 'EVT-APPROVAL-REJECTED' end;
  step_terminal:=case target_event when 'REVIEW' then 'REVIEWED' when 'AGREE' then 'AGREED' when 'APPROVE' then 'APPROVED' when 'REFERENCE_RECEIPT' then 'REVIEWED' else 'REJECTED' end;
  perform app_private.assert_approval_request(target_occurred_at,permission_code);
  if target_event='REJECT' and target_reason_code is null then raise exception 'rejection reason is required' using errcode='23514'; end if;

  select * into strict instance_row from public.approval_instance where id=target_instance_id for update;
  select * into strict step_row from public.approval_step where id=target_step_id and instance_id=target_instance_id for update;
  select * into strict participant_row from public.approval_participant where id=target_participant_id and step_id=target_step_id for update;
  next_version:=app_private.next_version(instance_row.version_no,target_expected_instance_version);
  perform app_private.next_version(step_row.version_no,target_expected_step_version);
  perform app_private.next_version(participant_row.version_no,target_expected_participant_version);
  if instance_row.state<>'IN_PROGRESS' or step_row.state<>'ACTIVE' or participant_row.state<>'ACTIVE'
    or participant_row.participant_user_id<>app_private.current_effective_actor_user_id() then
    raise exception 'actor is not the active exact participant' using errcode='42501';
  end if;
  if (target_event='REVIEW' and step_row.step_role<>'REVIEW') or (target_event='AGREE' and step_row.step_role<>'AGREEMENT')
    or (target_event='APPROVE' and step_row.step_role<>'APPROVAL') or (target_event='REFERENCE_RECEIPT' and step_row.step_role<>'REFERENCE') then
    raise exception 'action does not match approval step role' using errcode='23514';
  end if;
  if target_event='APPROVE' and not exists(select 1 from public.user_position_assignment pa join public.position p on p.id=pa.position_id and p.status='ACTIVE'
    where pa.user_id=app_private.current_effective_actor_user_id() and pa.position_id=participant_row.position_id_snapshot and pa.is_primary and pa.revoked_at is null
      and pa.valid_from<=target_occurred_at and (pa.valid_until is null or pa.valid_until>target_occurred_at) and p.approval_capability in ('OFFICIAL','REPRESENTATIVE')) then
    raise exception 'official approval position required' using errcode='42501';
  end if;

  if app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id() then
    if selected_authority is null or not app_private.acting_authority_allows(permission_code,target_occurred_at) then raise exception 'active selected acting authority required' using errcode='42501'; end if;
    select * into strict authority_row from public.acting_authority_assignment a where a.id=selected_authority
      and a.authenticated_user_id=app_private.current_actor_user_id() and a.effective_actor_user_id=app_private.current_effective_actor_user_id()
      and a.revoked_at is null and a.valid_from<=target_occurred_at and a.valid_until>target_occurred_at for share;
  elsif selected_authority is not null then
    raise exception 'acting authority cannot be attached to a direct action' using errcode='42501';
  end if;

  update public.approval_participant set state='ACTED',version_no=version_no+1 where id=target_participant_id;
  if target_event='REJECT' then
    update public.approval_step set state=case when id=target_step_id then 'REJECTED' else 'CANCELLED' end,version_no=version_no+1
      where instance_id=target_instance_id and state in ('WAITING','ACTIVE');
    update public.approval_participant set state='CANCELLED',version_no=version_no+1
      where step_id in(select id from public.approval_step where instance_id=target_instance_id) and state in ('WAITING','ACTIVE');
    target_instance_state:='REJECTED';
  else
    select case
      when step_row.completion_mode='ANY_ONE' then true
      when step_row.completion_mode='SEQUENTIAL' then not exists(select 1 from public.approval_participant p where p.step_id=target_step_id and p.state='WAITING')
      when step_row.completion_mode='SPECIFIC' then not exists(select 1 from public.approval_participant p where p.step_id=target_step_id and p.required_for_completion and p.state<>'ACTED')
      else not exists(select 1 from public.approval_participant p where p.step_id=target_step_id and p.state<>'ACTED') end into step_is_complete;
    if step_row.completion_mode='SEQUENTIAL' and not step_is_complete then
      update public.approval_participant set state='ACTIVE',version_no=version_no+1 where id=(select id from public.approval_participant where step_id=target_step_id and state='WAITING' order by participant_order limit 1);
    end if;
    if step_is_complete then
      update public.approval_step set state=step_terminal,version_no=version_no+1 where id=target_step_id;
      update public.approval_participant set state='CANCELLED',version_no=version_no+1 where step_id=target_step_id and state='ACTIVE';
      if exists(select 1 from public.approval_step where instance_id=target_instance_id and sequence_no=step_row.sequence_no and state='ACTIVE') then
        next_sequence:=null;
      else
        select min(sequence_no) into next_sequence from public.approval_step where instance_id=target_instance_id and state='WAITING';
      end if;
      if next_sequence is not null then
        update public.approval_step set state='ACTIVE',version_no=version_no+1 where instance_id=target_instance_id and sequence_no=next_sequence and state='WAITING';
        update public.approval_participant p set state='ACTIVE',version_no=p.version_no+1 from public.approval_step s
          where s.id=p.step_id and s.instance_id=target_instance_id and s.sequence_no=next_sequence and s.state='ACTIVE' and p.state='WAITING'
            and (s.completion_mode<>'SEQUENTIAL' or p.participant_order=(select min(p2.participant_order) from public.approval_participant p2 where p2.step_id=s.id and p2.state='WAITING'));
      elsif not exists(select 1 from public.approval_step where instance_id=target_instance_id and required and state not in ('REVIEWED','AGREED','APPROVED','SKIPPED_BY_POLICY')) then
        if not exists(select 1 from app_private.approval_subject_snapshot(target_instance_id) s where s.subject_kind='APPROVAL_POLICY_VERSION' and s.subject_state='SEALED') then
          raise exception 'exact subject version changed before completion' using errcode='23514';
        end if;
        perform set_config('app.approval_completion_instance_id',target_instance_id::text,true);
        update public.approval_policy_version v set state='PUBLISHED',lock_version=lock_version+1
          from public.approval_subject_policy_version s where s.instance_id=target_instance_id and s.subject_policy_version_id=v.id
            and v.version_no=s.subject_version_no and v.checksum=s.subject_checksum and v.state='SEALED';
        if not found then raise exception 'typed subject completion update failed' using errcode='23514'; end if;
        target_instance_state:='COMPLETED';
        transition_event:='EVT-APPROVAL-APPROVE';
        outbox_event:='EVT-APPROVAL-COMPLETED';
      end if;
    end if;
  end if;

  update public.approval_instance set state=target_instance_state,version_no=next_version,
    completed_at=case when target_instance_state='COMPLETED' then target_occurred_at else completed_at end where id=target_instance_id;
  perform app_private.append_approval_audit_transition(target_audit_id,target_transition_id,audit_action,target_instance_id,next_version,
    transition_event,'IN_PROGRESS',target_instance_state,target_reason_code,target_occurred_at);
  insert into public.approval_action(id,instance_id,step_id,participant_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,
    acting_authority_id,acting_authority_evidence_id,reason_code,opinion,occurred_at)
  values(target_action_record_id,target_instance_id,target_step_id,target_participant_id,target_audit_id,target_event,'USER',app_private.current_actor_user_id(),
    app_private.current_effective_actor_user_id(),selected_authority,case when selected_authority is null then null else authority_row.evidence_id end,target_reason_code,target_opinion,target_occurred_at);
  perform app_private.enqueue_approval_event(target_outbox_id,target_audit_id,outbox_event,target_instance_id,next_version,target_instance_state,target_occurred_at);
  return next_version;
end $$;
create trigger approval_policy_version_immutable before update or delete on public.approval_policy_version for each row execute function app_private.protect_approval_policy_snapshot();

create or replace function app_private.protect_approval_policy_rule()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare target_version uuid; begin
  if tg_op='UPDATE' and new.policy_version_id<>old.policy_version_id then
    raise exception 'approval policy step owner is immutable' using errcode='55000';
  end if;
  target_version := case when tg_op='DELETE' then old.policy_version_id else new.policy_version_id end;
  if exists(select 1 from public.approval_policy_version v where v.id=target_version and v.state<>'DRAFT') then
    raise exception 'sealed approval policy line is immutable' using errcode='55000';
  end if;
  return coalesce(new,old);
end $$;
create trigger approval_policy_step_rule_immutable before insert or update or delete on public.approval_policy_step_rule for each row execute function app_private.protect_approval_policy_rule();

create or replace function app_private.protect_approval_participant_rule()
returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $$ declare target_step uuid; begin
  if tg_op='UPDATE' and new.step_rule_id<>old.step_rule_id then
    raise exception 'approval participant rule owner is immutable' using errcode='55000';
  end if;
  target_step := case when tg_op='DELETE' then old.step_rule_id else new.step_rule_id end;
  if exists(select 1 from public.approval_policy_step_rule s join public.approval_policy_version v on v.id=s.policy_version_id where s.id=target_step and v.state<>'DRAFT') then
    raise exception 'sealed approval participant rule is immutable' using errcode='55000';
  end if;
  return coalesce(new,old);
end $$;
create trigger approval_policy_participant_rule_immutable before insert or update or delete on public.approval_policy_participant_rule for each row execute function app_private.protect_approval_participant_rule();

create or replace function app_private.approval_subject_snapshot(target_instance_id uuid)
returns table(subject_kind text,subject_version_id uuid,subject_version_no bigint,subject_checksum text,subject_state text)
language sql stable security definer set search_path=pg_catalog,public
as $$
  select 'APPROVAL_POLICY_VERSION',l.subject_policy_version_id,l.subject_version_no,l.subject_checksum,v.state
  from public.approval_subject_policy_version l join public.approval_policy_version v on v.id=l.subject_policy_version_id
  where l.instance_id=target_instance_id and v.version_no=l.subject_version_no and v.checksum=l.subject_checksum
$$;

create or replace function app_private.approval_actor_is_internal(at_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$ select exists(select 1 from public.user_account u where u.id=app_private.current_actor_user_id() and u.account_kind='INTERNAL' and u.status='ACTIVE' and u.valid_from<=at_time and (u.valid_until is null or u.valid_until>at_time)) $$;

create or replace function app_private.append_approval_audit_transition(
  target_audit_id uuid,target_transition_id uuid,target_action_id text,target_instance_id uuid,target_version bigint,
  target_event_id text,target_from_state text,target_to_state text,target_reason_code text,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.append_audit(target_audit_id,target_action_id,'APPROVAL_INSTANCE',target_instance_id,target_version,'SUCCEEDED',target_reason_code,null,null,null,null,target_occurred_at);
  perform app_private.append_state_transition(target_transition_id,target_audit_id,'APPROVAL_INSTANCE',target_instance_id,'SM-APPROVAL-V1',target_event_id,target_from_state,target_to_state,target_version-1,target_version,target_reason_code,null,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),target_occurred_at);
end $$;

create or replace function app_private.enqueue_approval_event(
  target_outbox_id uuid,target_audit_id uuid,target_event_id text,target_instance_id uuid,target_version bigint,target_state text,target_occurred_at timestamptz
) returns void language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ begin
  perform app_private.enqueue_outbox(target_outbox_id,target_audit_id,target_event_id,'APPROVAL_INSTANCE',target_instance_id,target_version,
    app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),'APPROVAL_EVENT_REF',1,
    jsonb_build_object('approvalInstanceId',target_instance_id,'resourceVersion',target_version,'state',target_state),
    'approval:'||target_instance_id::text||':'||target_version::text,target_occurred_at,target_occurred_at);
end $$;

create or replace function app_private.assert_approval_request(target_occurred_at timestamptz,target_permission text)
returns void language plpgsql stable security definer set search_path=pg_catalog,public,app_private
as $$ begin
  if target_occurred_at is distinct from app_private.request_time() then
    raise exception 'approval command time must equal trusted request time' using errcode='22023';
  end if;
  if app_private.required_setting('app.actor_kind')<>'USER' or not app_private.approval_actor_is_internal(target_occurred_at)
    or not app_private.actor_has_permission(target_permission,target_occurred_at) then
    raise exception 'approval command is not authorized' using errcode='42501';
  end if;
end $$;

create or replace function public.create_approval_instance(
  target_instance_id uuid,target_policy_version_id uuid,target_policy_checksum text,target_subject_policy_version_id uuid,
  target_subject_version_no bigint,target_subject_checksum text,target_prior_instance_id uuid,target_generation integer,
  target_action_record_id uuid,target_audit_id uuid,target_transition_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions
as $$ declare policy_row public.approval_policy_version%rowtype; subject_row public.approval_policy_version%rowtype; begin
  perform app_private.assert_approval_request(target_occurred_at,'approval.instance.submit');
  if app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id() or app_private.current_acting_authority_id() is not null then
    raise exception 'delegated creation is not allowed' using errcode='42501';
  end if;
  select v.* into strict policy_row from public.approval_policy_version v join public.approval_policy p on p.id=v.policy_id
    where v.id=target_policy_version_id and p.status='ACTIVE' and v.state='PUBLISHED'
      and v.valid_from<=target_occurred_at and (v.valid_until is null or v.valid_until>target_occurred_at) for share of v;
  if policy_row.checksum<>target_policy_checksum then raise exception 'policy checksum mismatch' using errcode='23514'; end if;
  select * into strict subject_row from public.approval_policy_version where id=target_subject_policy_version_id for share;
  if subject_row.state<>'SEALED' or subject_row.version_no<>target_subject_version_no or subject_row.checksum<>target_subject_checksum then
    raise exception 'typed subject version/checksum is not sealed' using errcode='23514';
  end if;
  if policy_row.subject_kind<>subject_row.subject_kind then raise exception 'governing policy subject kind mismatch' using errcode='23514'; end if;
  if (target_prior_instance_id is null and target_generation<>1) or (target_prior_instance_id is not null and not exists(
    select 1 from public.approval_instance p
    join public.approval_subject_policy_version previous_link on previous_link.instance_id=p.id
    join public.approval_policy_version previous_subject on previous_subject.id=previous_link.subject_policy_version_id
    where p.id=target_prior_instance_id and p.state in ('REJECTED','RECALLED') and p.generation+1=target_generation
      and previous_subject.policy_id=subject_row.policy_id and previous_subject.version_no<subject_row.version_no
  )) then raise exception 'invalid approval generation chain' using errcode='23514'; end if;

  insert into public.approval_instance(id,policy_version_id,policy_version_no,policy_checksum_snapshot,submitter_user_id,prior_instance_id,generation,state,version_no,created_at)
    values(target_instance_id,target_policy_version_id,policy_row.version_no,target_policy_checksum,app_private.current_effective_actor_user_id(),target_prior_instance_id,target_generation,'DRAFT',1,target_occurred_at);
  insert into public.approval_subject_policy_version(instance_id,subject_policy_version_id,subject_version_no,subject_checksum)
    values(target_instance_id,target_subject_policy_version_id,target_subject_version_no,target_subject_checksum);
  perform app_private.append_approval_audit_transition(target_audit_id,target_transition_id,'approval.instance.create',target_instance_id,1,
    'EVT-APPROVAL-CREATE',null,'DRAFT',null,target_occurred_at);
  insert into public.approval_action(id,instance_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,occurred_at)
    values(target_action_record_id,target_instance_id,target_audit_id,'CREATE','USER',app_private.current_actor_user_id(),app_private.current_effective_actor_user_id(),target_occurred_at);
  return 1;
end $$;

create or replace function public.submit_approval_instance(
  target_instance_id uuid,target_expected_version bigint,target_action_record_id uuid,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions
as $$ declare instance_row public.approval_instance%rowtype; next_version bigint; computed_line_checksum text; begin
  perform app_private.assert_approval_request(target_occurred_at,'approval.instance.submit');
  if app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id() or app_private.current_acting_authority_id() is not null then
    raise exception 'delegated submission is not allowed' using errcode='42501';
  end if;
  select * into strict instance_row from public.approval_instance where id=target_instance_id for update;
  if instance_row.state<>'DRAFT' or instance_row.submitter_user_id<>app_private.current_effective_actor_user_id() then raise exception 'instance is not submitter draft' using errcode='42501'; end if;
  next_version:=app_private.next_version(instance_row.version_no,target_expected_version);
  if not exists(select 1 from public.approval_policy_version v join public.approval_policy p on p.id=v.policy_id
    where v.id=instance_row.policy_version_id and p.status='ACTIVE' and v.state='PUBLISHED' and v.checksum=instance_row.policy_checksum_snapshot
      and v.valid_from<=target_occurred_at and (v.valid_until is null or v.valid_until>target_occurred_at)) then
    raise exception 'governing policy snapshot is no longer valid' using errcode='23514';
  end if;
  if not exists(select 1 from app_private.approval_subject_snapshot(target_instance_id) s where s.subject_kind='APPROVAL_POLICY_VERSION' and s.subject_state='SEALED') then
    raise exception 'exact typed subject snapshot is not sealed' using errcode='23514';
  end if;
  if exists(select 1 from public.approval_policy_step_rule s join public.approval_policy_participant_rule p on p.step_rule_id=s.id
    where s.policy_version_id=instance_row.policy_version_id and s.completion_mode='SEQUENTIAL' and p.selector_kind<>'USER') then
    raise exception 'SEQUENTIAL participants require exact USER rules' using errcode='23514';
  end if;
  if not exists(select 1 from public.approval_policy_step_rule s where s.policy_version_id=instance_row.policy_version_id and s.required) then
    raise exception 'approval policy requires at least one required step' using errcode='23514';
  end if;
  if exists(select 1 from public.approval_policy_step_rule s where s.policy_version_id=instance_row.policy_version_id and s.completion_mode='SPECIFIC'
    and not exists(select 1 from public.approval_policy_participant_rule p where p.step_rule_id=s.id and p.required_for_completion)) then
    raise exception 'SPECIFIC step requires designated completion participants' using errcode='23514';
  end if;
  if exists(select 1 from public.approval_policy_step_rule s where s.policy_version_id=instance_row.policy_version_id
    and s.sequence_no>=(select max(last_step.sequence_no) from public.approval_policy_step_rule last_step where last_step.policy_version_id=instance_row.policy_version_id and last_step.required)
    and (s.sequence_no>(select max(last_step.sequence_no) from public.approval_policy_step_rule last_step where last_step.policy_version_id=instance_row.policy_version_id and last_step.required) or s.step_role<>'APPROVAL')) then
    raise exception 'last required approval sequence must contain only approval steps' using errcode='23514';
  end if;

  insert into public.approval_step(id,instance_id,policy_step_rule_id,step_key,sequence_no,step_role,completion_mode,required,state,version_no)
    select extensions.gen_random_uuid(),target_instance_id,r.id,r.step_key,r.sequence_no,r.step_role,r.completion_mode,r.required,'WAITING',0
    from public.approval_policy_step_rule r where r.policy_version_id=instance_row.policy_version_id order by r.sequence_no,r.step_key;
  if not found then raise exception 'approval policy has no steps' using errcode='23514'; end if;

  insert into public.approval_participant(id,step_id,policy_participant_rule_id,participant_user_id,position_id_snapshot,role_id_snapshot,assignment_evidence_id,participant_order,required_for_completion,state,version_no)
  select extensions.gen_random_uuid(),s.id,pr.id,u.id,
    (select pa.position_id from public.user_position_assignment pa join public.position pos on pos.id=pa.position_id and pos.status='ACTIVE' where pa.user_id=u.id and pa.is_primary and pa.revoked_at is null and pa.valid_from<=target_occurred_at and (pa.valid_until is null or pa.valid_until>target_occurred_at) limit 1),
    null,pr.id,pr.participant_order,pr.required_for_completion,'WAITING',0
  from public.approval_step s join public.approval_policy_participant_rule pr on pr.step_rule_id=s.policy_step_rule_id and pr.selector_kind='USER'
  join public.user_account u on u.id=pr.participant_user_id and u.account_kind='INTERNAL' and u.status='ACTIVE'
  where s.instance_id=target_instance_id and u.valid_from<=target_occurred_at and (u.valid_until is null or u.valid_until>target_occurred_at);

  insert into public.approval_participant(id,step_id,policy_participant_rule_id,participant_user_id,position_id_snapshot,role_id_snapshot,assignment_evidence_id,participant_order,required_for_completion,state,version_no)
  select extensions.gen_random_uuid(),s.id,pr.id,pa.user_id,pa.position_id,null,pa.id,pr.participant_order,pr.required_for_completion,'WAITING',0
  from public.approval_step s join public.approval_policy_participant_rule pr on pr.step_rule_id=s.policy_step_rule_id and pr.selector_kind='POSITION'
  join public.user_position_assignment pa on pa.position_id=pr.position_id and pa.is_primary and pa.revoked_at is null
  join public.position pos on pos.id=pa.position_id and pos.status='ACTIVE'
  join public.user_account u on u.id=pa.user_id and u.account_kind='INTERNAL' and u.status='ACTIVE'
  where s.instance_id=target_instance_id and pa.valid_from<=target_occurred_at and (pa.valid_until is null or pa.valid_until>target_occurred_at)
    and u.valid_from<=target_occurred_at and (u.valid_until is null or u.valid_until>target_occurred_at);

  insert into public.approval_participant(id,step_id,policy_participant_rule_id,participant_user_id,position_id_snapshot,role_id_snapshot,assignment_evidence_id,participant_order,required_for_completion,state,version_no)
  select extensions.gen_random_uuid(),s.id,pr.id,ra.user_id,
    (select pa.position_id from public.user_position_assignment pa join public.position pos on pos.id=pa.position_id and pos.status='ACTIVE' where pa.user_id=ra.user_id and pa.is_primary and pa.revoked_at is null and pa.valid_from<=target_occurred_at and (pa.valid_until is null or pa.valid_until>target_occurred_at) limit 1),
    ra.role_id,ra.id,pr.participant_order,pr.required_for_completion,'WAITING',0
  from public.approval_step s join public.approval_policy_participant_rule pr on pr.step_rule_id=s.policy_step_rule_id and pr.selector_kind='ROLE'
  join public.user_role_assignment ra on ra.role_id=pr.role_id and ra.revoked_at is null
  join public.role selected_role on selected_role.id=ra.role_id and selected_role.status='ACTIVE'
  join public.user_account u on u.id=ra.user_id and u.account_kind='INTERNAL' and u.status='ACTIVE'
  where s.instance_id=target_instance_id and ra.valid_from<=target_occurred_at and (ra.valid_until is null or ra.valid_until>target_occurred_at)
    and u.valid_from<=target_occurred_at and (u.valid_until is null or u.valid_until>target_occurred_at);

  if exists(select 1 from public.approval_step s where s.instance_id=target_instance_id and s.required and not exists(select 1 from public.approval_participant p where p.step_id=s.id)) then
    raise exception 'required approval step has no active participant' using errcode='23514';
  end if;
  if exists(select 1 from public.approval_step s join public.approval_participant ap on ap.step_id=s.id left join public.position p on p.id=ap.position_id_snapshot and p.status='ACTIVE'
    where s.instance_id=target_instance_id and s.step_role='APPROVAL' and coalesce(p.approval_capability,'NONE') not in ('OFFICIAL','REPRESENTATIVE')) then
    raise exception 'approval participant is not an official position' using errcode='42501';
  end if;
  select encode(extensions.digest(convert_to(string_agg(concat_ws(':',s.sequence_no,s.step_key,s.step_role,s.completion_mode,s.required,ap.participant_user_id,coalesce(ap.position_id_snapshot::text,''),coalesce(ap.role_id_snapshot::text,''),ap.assignment_evidence_id,ap.participant_order,ap.required_for_completion) order by s.sequence_no,s.step_key,ap.participant_order),'UTF8'),'sha256'),'hex')
    into computed_line_checksum from public.approval_step s left join public.approval_participant ap on ap.step_id=s.id where s.instance_id=target_instance_id;
  update public.approval_instance set state='SUBMITTED',line_checksum=computed_line_checksum,version_no=next_version,submitted_at=target_occurred_at where id=target_instance_id;
  perform app_private.append_approval_audit_transition(target_audit_id,target_transition_id,'approval.instance.submit',target_instance_id,next_version,
    'EVT-APPROVAL-SUBMIT','DRAFT','SUBMITTED',null,target_occurred_at);
  insert into public.approval_action(id,instance_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,occurred_at)
    values(target_action_record_id,target_instance_id,target_audit_id,'SUBMIT','USER',app_private.current_actor_user_id(),app_private.current_effective_actor_user_id(),target_occurred_at);
  perform app_private.enqueue_approval_event(target_outbox_id,target_audit_id,'EVT-APPROVAL-SUBMITTED',target_instance_id,next_version,'SUBMITTED',target_occurred_at);
  return next_version;
end $$;

create or replace function public.request_approval_recall(
  target_instance_id uuid,target_expected_version bigint,target_action_record_id uuid,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_reason_code text,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare instance_row public.approval_instance%rowtype; next_version bigint; begin
  perform app_private.assert_approval_request(target_occurred_at,'approval.instance.recall');
  if target_reason_code is null or app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id() then raise exception 'direct recall reason required' using errcode='42501'; end if;
  select * into strict instance_row from public.approval_instance where id=target_instance_id for update;
  if instance_row.state not in ('SUBMITTED','IN_PROGRESS') or instance_row.submitter_user_id<>app_private.current_effective_actor_user_id()
    or not exists(select 1 from public.approval_policy_version v where v.id=instance_row.policy_version_id and v.recall_allowed) then
    raise exception 'recall is not allowed' using errcode='42501';
  end if;
  next_version:=app_private.next_version(instance_row.version_no,target_expected_version);
  update public.approval_instance set state='RECALL_REQUESTED',version_no=next_version where id=target_instance_id;
  perform app_private.append_approval_audit_transition(target_audit_id,target_transition_id,'approval.instance.recall.request',target_instance_id,next_version,
    'EVT-APPROVAL-REQUEST-RECALL',instance_row.state,'RECALL_REQUESTED',target_reason_code,target_occurred_at);
  insert into public.approval_action(id,instance_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,reason_code,occurred_at)
    values(target_action_record_id,target_instance_id,target_audit_id,'REQUEST_RECALL','USER',app_private.current_actor_user_id(),app_private.current_effective_actor_user_id(),target_reason_code,target_occurred_at);
  perform app_private.enqueue_approval_event(target_outbox_id,target_audit_id,'EVT-APPROVAL-RECALL-REQUESTED',target_instance_id,next_version,'RECALL_REQUESTED',target_occurred_at);
  return next_version;
end $$;

create or replace function public.complete_approval_recall(
  target_instance_id uuid,target_expected_version bigint,target_action_record_id uuid,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_reason_code text,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare instance_row public.approval_instance%rowtype; next_version bigint; begin
  perform app_private.assert_approval_worker(target_occurred_at);
  select * into strict instance_row from public.approval_instance where id=target_instance_id for update;
  if instance_row.state<>'RECALL_REQUESTED' then raise exception 'recall is not pending' using errcode='23514'; end if;
  next_version:=app_private.next_version(instance_row.version_no,target_expected_version);
  update public.approval_step set state='CANCELLED',version_no=version_no+1 where instance_id=target_instance_id and state in ('WAITING','ACTIVE');
  update public.approval_participant set state='CANCELLED',version_no=version_no+1 where step_id in(select id from public.approval_step where instance_id=target_instance_id) and state in ('WAITING','ACTIVE');
  update public.approval_instance set state='RECALLED',version_no=next_version where id=target_instance_id;
  perform app_private.append_approval_audit_transition(target_audit_id,target_transition_id,'approval.instance.recall.complete',target_instance_id,next_version,
    'EVT-APPROVAL-RECALL','RECALL_REQUESTED','RECALLED',target_reason_code,target_occurred_at);
  insert into public.approval_action(id,instance_id,audit_log_id,event_id,actor_kind,system_actor_id,reason_code,occurred_at)
    values(target_action_record_id,target_instance_id,target_audit_id,'RECALL','SYSTEM','APPROVAL_ENGINE',target_reason_code,target_occurred_at);
  perform app_private.enqueue_approval_event(target_outbox_id,target_audit_id,'EVT-APPROVAL-RECALLED',target_instance_id,next_version,'RECALLED',target_occurred_at);
  return next_version;
end $$;

create or replace function public.cancel_approval_instance(
  target_instance_id uuid,target_expected_version bigint,target_action_record_id uuid,target_audit_id uuid,target_transition_id uuid,
  target_outbox_id uuid,target_reason_code text,target_occurred_at timestamptz
) returns bigint language plpgsql security definer set search_path=pg_catalog,public,app_private
as $$ declare instance_row public.approval_instance%rowtype; next_version bigint; begin
  perform app_private.assert_approval_request(target_occurred_at,'approval.instance.cancel');
  if target_reason_code is null or app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id() then raise exception 'direct cancellation reason required' using errcode='42501'; end if;
  select * into strict instance_row from public.approval_instance where id=target_instance_id for update;
  if instance_row.state not in ('DRAFT','RECALLED','REJECTED') or instance_row.submitter_user_id<>app_private.current_effective_actor_user_id() then raise exception 'cancellation is not allowed' using errcode='42501'; end if;
  next_version:=app_private.next_version(instance_row.version_no,target_expected_version);
  update public.approval_instance set state='CANCELLED',version_no=next_version where id=target_instance_id;
  perform app_private.append_approval_audit_transition(target_audit_id,target_transition_id,'approval.instance.cancel',target_instance_id,next_version,
    'EVT-APPROVAL-CANCEL',instance_row.state,'CANCELLED',target_reason_code,target_occurred_at);
  insert into public.approval_action(id,instance_id,audit_log_id,event_id,actor_kind,authenticated_actor_user_id,effective_actor_user_id,reason_code,occurred_at)
    values(target_action_record_id,target_instance_id,target_audit_id,'CANCEL','USER',app_private.current_actor_user_id(),app_private.current_effective_actor_user_id(),target_reason_code,target_occurred_at);
  perform app_private.enqueue_approval_event(target_outbox_id,target_audit_id,'EVT-APPROVAL-CANCELLED',target_instance_id,next_version,'CANCELLED',target_occurred_at);
  return next_version;
end $$;

create or replace function app_private.can_read_approval_instance(target_instance_id uuid,target_time timestamptz default app_private.request_time())
returns boolean language sql stable security definer set search_path=pg_catalog,public,app_private
as $$
  select app_private.approval_actor_is_internal(target_time) and exists(
    select 1 from public.approval_instance i where i.id=target_instance_id and (
      i.submitter_user_id=app_private.current_effective_actor_user_id() or exists(
        select 1 from public.approval_step s join public.approval_participant p on p.step_id=s.id
        where s.instance_id=i.id and p.participant_user_id=app_private.current_effective_actor_user_id()
      )
    )
  )
$$;

alter table public.approval_policy enable row level security;
alter table public.approval_policy force row level security;
alter table public.approval_policy_version enable row level security;
alter table public.approval_policy_version force row level security;
alter table public.approval_policy_step_rule enable row level security;
alter table public.approval_policy_step_rule force row level security;
alter table public.approval_policy_participant_rule enable row level security;
alter table public.approval_policy_participant_rule force row level security;
alter table public.approval_instance enable row level security;
alter table public.approval_instance force row level security;
alter table public.approval_subject_policy_version enable row level security;
alter table public.approval_subject_policy_version force row level security;
alter table public.approval_step enable row level security;
alter table public.approval_step force row level security;
alter table public.approval_participant enable row level security;
alter table public.approval_participant force row level security;
alter table public.approval_action enable row level security;
alter table public.approval_action force row level security;

create policy approval_policy_internal_read on public.approval_policy for select to youone_request using(app_private.approval_actor_is_internal());
create policy approval_policy_version_internal_read on public.approval_policy_version for select to youone_request using(app_private.approval_actor_is_internal());
create policy approval_policy_step_rule_internal_read on public.approval_policy_step_rule for select to youone_request using(app_private.approval_actor_is_internal());
create policy approval_policy_participant_rule_internal_read on public.approval_policy_participant_rule for select to youone_request using(app_private.approval_actor_is_internal());
create policy approval_instance_scoped_read on public.approval_instance for select to youone_request using(app_private.can_read_approval_instance(id));
create policy approval_subject_scoped_read on public.approval_subject_policy_version for select to youone_request using(app_private.can_read_approval_instance(instance_id));
create policy approval_step_scoped_read on public.approval_step for select to youone_request using(app_private.can_read_approval_instance(instance_id));
create policy approval_participant_scoped_read on public.approval_participant for select to youone_request using(app_private.can_read_approval_instance((select s.instance_id from public.approval_step s where s.id=step_id)));
create policy approval_action_scoped_read on public.approval_action for select to youone_request using(app_private.can_read_approval_instance(instance_id));

revoke all on table public.approval_policy,public.approval_policy_version,public.approval_policy_step_rule,public.approval_policy_participant_rule,
  public.approval_instance,public.approval_subject_policy_version,public.approval_step,public.approval_participant,public.approval_action
  from public,youone_request,youone_privileged_writer;
grant select on table public.approval_policy,public.approval_policy_version,public.approval_policy_step_rule,public.approval_policy_participant_rule,
  public.approval_instance,public.approval_subject_policy_version,public.approval_step,public.approval_participant,public.approval_action to youone_request;

revoke all on function public.create_approval_instance(uuid,uuid,text,uuid,bigint,text,uuid,integer,uuid,uuid,uuid,timestamptz) from public,youone_privileged_writer;
revoke all on function public.submit_approval_instance(uuid,bigint,uuid,uuid,uuid,uuid,timestamptz) from public,youone_privileged_writer;
revoke all on function public.perform_approval_action(uuid,uuid,uuid,text,bigint,bigint,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz) from public,youone_privileged_writer;
revoke all on function public.request_approval_recall(uuid,bigint,uuid,uuid,uuid,uuid,text,timestamptz) from public,youone_privileged_writer;
revoke all on function public.cancel_approval_instance(uuid,bigint,uuid,uuid,uuid,uuid,text,timestamptz) from public,youone_privileged_writer;
revoke all on function public.activate_approval_instance(uuid,bigint,uuid,uuid,uuid,uuid,timestamptz) from public,youone_request;
revoke all on function public.complete_approval_recall(uuid,bigint,uuid,uuid,uuid,uuid,text,timestamptz) from public,youone_request;
grant execute on function public.create_approval_instance(uuid,uuid,text,uuid,bigint,text,uuid,integer,uuid,uuid,uuid,timestamptz) to youone_request;
grant execute on function public.submit_approval_instance(uuid,bigint,uuid,uuid,uuid,uuid,timestamptz) to youone_request;
grant execute on function public.perform_approval_action(uuid,uuid,uuid,text,bigint,bigint,bigint,uuid,uuid,uuid,uuid,text,text,timestamptz) to youone_request;
grant execute on function public.request_approval_recall(uuid,bigint,uuid,uuid,uuid,uuid,text,timestamptz) to youone_request;
grant execute on function public.cancel_approval_instance(uuid,bigint,uuid,uuid,uuid,uuid,text,timestamptz) to youone_request;
grant execute on function public.activate_approval_instance(uuid,bigint,uuid,uuid,uuid,uuid,timestamptz) to youone_privileged_writer;
grant execute on function public.complete_approval_recall(uuid,bigint,uuid,uuid,uuid,uuid,text,timestamptz) to youone_privileged_writer;

revoke all on function app_private.approval_subject_snapshot(uuid),app_private.approval_actor_is_internal(timestamptz),
  app_private.append_approval_audit_transition(uuid,uuid,text,uuid,bigint,text,text,text,text,timestamptz),
  app_private.enqueue_approval_event(uuid,uuid,text,uuid,bigint,text,timestamptz),app_private.assert_approval_request(timestamptz,text),
  app_private.assert_approval_worker(timestamptz),app_private.can_read_approval_instance(uuid,timestamptz)
  from public,youone_request,youone_privileged_writer;
grant execute on function app_private.approval_actor_is_internal(timestamptz),app_private.can_read_approval_instance(uuid,timestamptz) to youone_request;

comment on table public.approval_subject_policy_version is
  'M04 typed subject link. M05+ adds one FK-backed link table per subject aggregate and extends approval_subject_snapshot; generic subject_type/id is forbidden.';
comment on table public.approval_action is 'Append-only actor/effective-actor and acting-authority evidence snapshot.';
