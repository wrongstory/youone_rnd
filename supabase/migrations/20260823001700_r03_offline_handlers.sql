-- R03 reviewed offline Application handlers.
-- Five explicit command paths only; no generic JSON aggregate or permissive fallback.

insert into public.action_definition(action_id) values
 ('offline.safety_checklist_draft.upsert'),
 ('offline.inspection_attempt_draft.upsert'),
 ('offline.field_note_draft.upsert'),
 ('offline.wbs_progress.update'),
 ('offline.field_record_draft.upsert')
on conflict do nothing;

insert into public.aggregate_type_definition(aggregate_type) values
 ('SAFETY_CHECKLIST_DRAFT'),('INSPECTION_ATTEMPT_DRAFT'),('FIELD_NOTE_DRAFT'),('FIELD_RECORD_DRAFT')
on conflict do nothing;

insert into public.state_machine_definition(machine_id,aggregate_type) values
 ('SM-SAFETY-CHECKLIST-DRAFT-V1','SAFETY_CHECKLIST_DRAFT'),
 ('SM-INSPECTION-ATTEMPT-DRAFT-V1','INSPECTION_ATTEMPT_DRAFT'),
 ('SM-FIELD-NOTE-DRAFT-V1','FIELD_NOTE_DRAFT'),
 ('SM-FIELD-RECORD-DRAFT-V1','FIELD_RECORD_DRAFT')
on conflict do nothing;

insert into public.state_definition(machine_id,state_id,is_terminal) values
 ('SM-SAFETY-CHECKLIST-DRAFT-V1','DRAFT',false),
 ('SM-INSPECTION-ATTEMPT-DRAFT-V1','DRAFT',false),
 ('SM-FIELD-NOTE-DRAFT-V1','DRAFT',false),
 ('SM-FIELD-RECORD-DRAFT-V1','DRAFT',false)
on conflict do nothing;

insert into public.transition_definition(machine_id,event_id,from_state,to_state) values
 ('SM-SAFETY-CHECKLIST-DRAFT-V1','EVT-SAFETY-CHECKLIST-DRAFT-CREATED',null,'DRAFT'),
 ('SM-SAFETY-CHECKLIST-DRAFT-V1','EVT-SAFETY-CHECKLIST-DRAFT-UPDATED','DRAFT','DRAFT'),
 ('SM-INSPECTION-ATTEMPT-DRAFT-V1','EVT-INSPECTION-ATTEMPT-DRAFT-CREATED',null,'DRAFT'),
 ('SM-INSPECTION-ATTEMPT-DRAFT-V1','EVT-INSPECTION-ATTEMPT-DRAFT-UPDATED','DRAFT','DRAFT'),
 ('SM-FIELD-NOTE-DRAFT-V1','EVT-FIELD-NOTE-DRAFT-CREATED',null,'DRAFT'),
 ('SM-FIELD-NOTE-DRAFT-V1','EVT-FIELD-NOTE-DRAFT-UPDATED','DRAFT','DRAFT'),
 ('SM-FIELD-RECORD-DRAFT-V1','EVT-FIELD-RECORD-DRAFT-CREATED',null,'DRAFT'),
 ('SM-FIELD-RECORD-DRAFT-V1','EVT-FIELD-RECORD-DRAFT-UPDATED','DRAFT','DRAFT'),
 ('SM-WBS-V1','EVT-WBS-PROGRESS-UPDATED','IN_PROGRESS','IN_PROGRESS')
on conflict do nothing;

insert into public.domain_event_definition(event_id,payload_schema_id,payload_schema_version) values
 ('EVT-SAFETY-CHECKLIST-DRAFT-CREATED','R03_DRAFT_EVENT_REF',1),
 ('EVT-SAFETY-CHECKLIST-DRAFT-UPDATED','R03_DRAFT_EVENT_REF',1),
 ('EVT-INSPECTION-ATTEMPT-DRAFT-CREATED','R03_DRAFT_EVENT_REF',1),
 ('EVT-INSPECTION-ATTEMPT-DRAFT-UPDATED','R03_DRAFT_EVENT_REF',1),
 ('EVT-FIELD-NOTE-DRAFT-CREATED','R03_DRAFT_EVENT_REF',1),
 ('EVT-FIELD-NOTE-DRAFT-UPDATED','R03_DRAFT_EVENT_REF',1),
 ('EVT-FIELD-RECORD-DRAFT-CREATED','R03_DRAFT_EVENT_REF',1),
 ('EVT-FIELD-RECORD-DRAFT-UPDATED','R03_DRAFT_EVENT_REF',1),
 ('EVT-WBS-PROGRESS-UPDATED','WBS_EVENT_REF',1)
on conflict do nothing;

create table public.safety_checklist_draft (
 id uuid primary key,
 safety_inspection_id uuid not null unique references public.safety_inspection(id),
 project_id uuid not null references public.project(id),
 creator_user_id uuid not null references public.user_account(id),
 note text not null check(length(note) between 1 and 12000),
 state text not null check(state='DRAFT'),
 version_no bigint not null check(version_no>0),
 created_at timestamptz not null,
 updated_at timestamptz not null
);
create table public.safety_checklist_draft_item (
 id uuid primary key,
 draft_id uuid not null references public.safety_checklist_draft(id),
 sequence_no integer not null check(sequence_no>0),
 criterion_code text not null check(app_private.is_stable_code(criterion_code)),
 criterion_text text not null check(length(criterion_text) between 1 and 5000),
 verdict text not null check(verdict in ('PASS','FAIL','NOT_APPLICABLE','NOT_CHECKED')),
 observation text check(observation is null or length(observation)<=5000),
 unique(draft_id,sequence_no),unique(draft_id,criterion_code)
);

create table public.inspection_attempt_draft (
 id uuid primary key,
 inspection_id uuid not null references public.inspection(id),
 inspection_attempt_id uuid not null unique,
 inspection_checklist_version_id uuid not null,
 creator_user_id uuid not null references public.user_account(id),
 summary text not null check(length(summary) between 1 and 12000),
 state text not null check(state='DRAFT'),
 version_no bigint not null check(version_no>0),
 created_at timestamptz not null,
 updated_at timestamptz not null,
 foreign key(inspection_attempt_id,inspection_id) references public.inspection_attempt(id,inspection_id),
 foreign key(inspection_attempt_id,inspection_checklist_version_id) references public.inspection_attempt(id,inspection_checklist_version_id)
);
create table public.inspection_attempt_draft_criterion (
 id uuid primary key,
 draft_id uuid not null references public.inspection_attempt_draft(id),
 inspection_checklist_version_id uuid not null,
 inspection_criterion_id uuid not null,
 achieved_percent numeric(9,6) not null check(achieved_percent between 0 and 100),
 verdict text not null check(verdict in ('PASS','FAIL','PARTIAL','UNABLE_TO_VERIFY')),
 observed_value text not null check(length(observed_value) between 1 and 5000),
 unique(draft_id,inspection_criterion_id),
 foreign key(inspection_criterion_id,inspection_checklist_version_id) references public.inspection_criterion(id,inspection_checklist_version_id)
);

create table public.field_note_draft (
 id uuid primary key,
 project_id uuid not null references public.project(id),
 wbs_node_id uuid,
 creator_user_id uuid not null references public.user_account(id),
 note text not null check(length(note) between 1 and 12000),
 observed_at timestamptz not null,
 state text not null check(state='DRAFT'),
 version_no bigint not null check(version_no>0),
 created_at timestamptz not null,
 updated_at timestamptz not null,
 foreign key(wbs_node_id,project_id) references public.wbs_node(id,project_id)
);

create table public.field_record_draft (
 id uuid primary key,
 project_id uuid not null references public.project(id),
 wbs_node_id uuid,
 creator_user_id uuid not null references public.user_account(id),
 record_type text not null check(app_private.is_stable_code(record_type)),
 summary text not null check(length(summary) between 1 and 12000),
 observed_at timestamptz not null,
 location text check(location is null or length(location)<=500),
 state text not null check(state='DRAFT'),
 version_no bigint not null check(version_no>0),
 created_at timestamptz not null,
 updated_at timestamptz not null,
 foreign key(wbs_node_id,project_id) references public.wbs_node(id,project_id)
);
create table public.field_record_draft_measurement (
 id uuid primary key,
 draft_id uuid not null references public.field_record_draft(id),
 sequence_no integer not null check(sequence_no>0),
 metric_code text not null check(app_private.is_stable_code(metric_code)),
 value text not null check(length(value) between 1 and 1000),
 unit_code text not null check(app_private.is_stable_code(unit_code)),
 note text check(note is null or length(note)<=5000),
 unique(draft_id,sequence_no),unique(draft_id,metric_code)
);

-- Forward-fix M15's check-then-insert race. The lock is transaction-scoped and
-- serializes the exact immutable command identity before its existing-row check.
create or replace function app_private.register_offline_command(
 target_command_id uuid,target_command_type text,target_authenticated_actor uuid,target_effective_actor uuid,target_session_binding_hash text,
 target_aggregate_type text,target_aggregate_id uuid,target_base_version bigint,target_schema_version bigint,target_created_at timestamptz,
 target_payload_hash text,target_payload_json text,target_received_at timestamptz)
returns text language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions as $$
declare trusted_time timestamptz:=app_private.request_time(); current_session text:=app_private.required_setting('app.session_id'); existing public.offline_command%rowtype; expected_binding text;
begin
 if target_received_at<>trusted_time then raise exception 'server receipt time must equal trusted request time' using errcode='22023'; end if;
 if not app_private.actor_is_active(trusted_time) then raise exception 'offline replay requires active authenticated actor' using errcode='42501'; end if;
 if target_authenticated_actor<>app_private.current_actor_user_id() or target_effective_actor<>app_private.current_effective_actor_user_id() then raise exception 'offline actor binding mismatch' using errcode='42501'; end if;
 expected_binding:=encode(extensions.digest(convert_to(target_authenticated_actor::text||':'||current_session,'UTF8'),'sha256'),'hex');
 if target_session_binding_hash<>expected_binding then raise exception 'offline session binding mismatch' using errcode='42501'; end if;
 if not exists(select 1 from public.offline_command_type_definition d where d.command_type=target_command_type and d.execution_mode='OFFLINE_ALLOWED' and d.current_schema_version=target_schema_version) then raise exception 'offline command is unregistered, online-only, or has unsupported schema' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target_command_id::text,0));
 select * into existing from public.offline_command where command_id=target_command_id;
 if found then
  if existing.command_type<>target_command_type or existing.authenticated_actor_user_id<>target_authenticated_actor or existing.effective_actor_user_id<>target_effective_actor
   or existing.session_binding_hash<>target_session_binding_hash or existing.aggregate_type<>target_aggregate_type or existing.aggregate_id<>target_aggregate_id
   or existing.base_version<>target_base_version or existing.payload_schema_version<>target_schema_version or existing.created_at<>target_created_at
   or existing.payload_hash<>target_payload_hash or existing.payload_json<>target_payload_json then raise exception 'offline command idempotency mismatch' using errcode='23505'; end if;
  return 'IDEMPOTENT_REPLAY';
 end if;
 insert into public.offline_command(command_id,command_type,authenticated_actor_user_id,effective_actor_user_id,session_binding_hash,actor_snapshot,session_snapshot,
  aggregate_type,aggregate_id,base_version,payload_schema_version,created_at,payload_hash,payload_json,received_at,correlation_id)
 values(target_command_id,target_command_type,target_authenticated_actor,target_effective_actor,target_session_binding_hash,
  jsonb_build_object('authenticatedActorId',target_authenticated_actor,'effectiveActorId',target_effective_actor,'actingAuthorityId',app_private.optional_setting('app.acting_authority_id')),
  jsonb_build_object('sessionBindingHash',target_session_binding_hash,'assuranceLevel',app_private.required_setting('app.assurance_level')),
  target_aggregate_type,target_aggregate_id,target_base_version,target_schema_version,target_created_at,target_payload_hash,target_payload_json,target_received_at,
  app_private.required_setting('app.correlation_id'));
 perform app_private.append_audit(extensions.gen_random_uuid(),'offline.command.receive','OFFLINE_COMMAND',target_command_id,0,'SUCCEEDED','OFFLINE_COMMAND_RECEIVED',null,null,target_payload_hash,null,trusted_time);
 return 'RECEIVED';
end $$;

create or replace function app_private.r03_registered_command(target_command_id uuid,target_command_type text,target_aggregate_type text,target_aggregate_id uuid,target_base_version bigint,target_time timestamptz)
returns public.offline_command language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions as $$
declare command_row public.offline_command%rowtype; expected_binding text;
begin
 if target_time is distinct from app_private.request_time() or app_private.required_setting('app.actor_kind')<>'USER' or not app_private.actor_is_active(target_time) then raise exception 'trusted active request required' using errcode='42501'; end if;
 select * into strict command_row from public.offline_command c where c.command_id=target_command_id for share;
 expected_binding:=encode(extensions.digest(convert_to(command_row.authenticated_actor_user_id::text||':'||app_private.required_setting('app.session_id'),'UTF8'),'sha256'),'hex');
 if command_row.command_type<>target_command_type or command_row.aggregate_type<>target_aggregate_type or command_row.aggregate_id<>target_aggregate_id
  or command_row.base_version<>target_base_version or command_row.payload_schema_version<>1
  or command_row.authenticated_actor_user_id<>app_private.current_actor_user_id() or command_row.effective_actor_user_id<>app_private.current_effective_actor_user_id()
  or command_row.session_binding_hash<>expected_binding or exists(select 1 from public.offline_command_result r where r.offline_command_id=target_command_id) then
  raise exception 'exact unresolved offline command required' using errcode='42501';
 end if;
 return command_row;
end $$;

create or replace function app_private.r03_append_transition(target_command_id uuid,target_action text,target_type text,target_id uuid,target_machine text,target_event text,
 target_from_state text,target_to_state text,target_from_version bigint,target_to_version bigint,target_time timestamptz)
returns void language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions as $$
declare audit_id uuid:=extensions.gen_random_uuid(); transition_id uuid:=extensions.gen_random_uuid(); outbox_id uuid:=extensions.gen_random_uuid();
begin
 perform app_private.append_audit(audit_id,target_action,target_type,target_id,target_to_version,'SUCCEEDED',target_event,null,null,null,null,target_time);
 perform app_private.append_state_transition(transition_id,audit_id,target_type,target_id,target_machine,target_event,target_from_state,target_to_state,
  target_from_version,target_to_version,target_event,null,app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),target_time);
 perform app_private.enqueue_outbox(outbox_id,audit_id,target_event,target_type,target_id,target_to_version,
  app_private.required_setting('app.correlation_id'),app_private.optional_setting('app.causation_id'),
  case when target_type='WBS_NODE' then 'WBS_EVENT_REF' else 'R03_DRAFT_EVENT_REF' end,1,
  jsonb_build_object('aggregateId',target_id,'resourceVersion',target_to_version,'state',target_to_state),
  'offline:'||target_command_id::text||':domain',target_time,target_time);
end $$;

create or replace function app_private.r03_assert_json_array(target_value jsonb,target_max integer,target_name text)
returns void language plpgsql immutable set search_path=pg_catalog as $$ begin
 if jsonb_typeof(target_value)<>'array' or jsonb_array_length(target_value)>target_max then raise exception '% must be a bounded array',target_name using errcode='22023'; end if;
end $$;

create or replace function app_private.r03_assert_internal_project(target_project uuid,target_time timestamptz)
returns void language plpgsql stable security definer set search_path=pg_catalog,public,app_private as $$ begin
 if app_private.required_setting('app.actor_kind')<>'USER' or app_private.current_actor_user_id()<>app_private.current_effective_actor_user_id()
  or not exists(select 1 from public.user_account u where u.id=app_private.current_effective_actor_user_id() and u.account_kind='INTERNAL' and u.status='ACTIVE'
   and u.valid_from<=target_time and (u.valid_until is null or u.valid_until>target_time))
  or not app_private.actor_has_project_internal_scope(target_project,target_time) then raise exception 'active scoped internal actor required' using errcode='42501'; end if;
end $$;

create or replace function public.r03_upsert_safety_checklist_draft(
 target_command_id uuid,target_draft_id uuid,target_safety_inspection_id uuid,target_base_version bigint,target_note text,target_items jsonb,target_occurred_at timestamptz)
returns table(result_code text,aggregate_version bigint,server_version bigint,safe_server_projection jsonb,reason_code text)
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare command_row public.offline_command%rowtype; inspection_row public.safety_inspection%rowtype; draft_row public.safety_checklist_draft%rowtype; next_version bigint; event_id text; item jsonb; sequence_no integer:=0;
begin
 command_row:=app_private.r03_registered_command(target_command_id,'CMD-OFFLINE-CHECKLIST-DRAFT-UPSERT','SAFETY_CHECKLIST_DRAFT',target_draft_id,target_base_version,target_occurred_at);
 if (select count(*) from jsonb_object_keys(command_row.payload))<>3 or not command_row.payload ?& array['safetyInspectionId','note','items']
  or (command_row.payload->>'safetyInspectionId')::uuid<>target_safety_inspection_id or command_row.payload->>'note'<>target_note
  or command_row.payload->'items'<>target_items then raise exception 'Safety checklist payload and arguments differ' using errcode='22023'; end if;
 select * into strict inspection_row from public.safety_inspection where id=target_safety_inspection_id for update;
 perform app_private.m13_assert_internal('safety.inspection.perform',inspection_row.project_id,target_occurred_at,true);
 if inspection_row.inspector_user_id<>app_private.current_effective_actor_user_id() or inspection_row.state not in ('PLANNED','IN_PROGRESS') then raise exception 'exact editable Safety inspector required' using errcode='42501'; end if;
 perform app_private.r03_assert_json_array(target_items,200,'items');
 if length(trim(target_note)) not between 1 and 12000 or exists(select 1 from jsonb_array_elements(target_items) x where jsonb_typeof(x)<>'object'
   or not x ?& array['itemId','sequenceNo','criterionCode','criterionText','verdict']
   or exists(select 1 from jsonb_object_keys(x) k where k not in ('itemId','sequenceNo','criterionCode','criterionText','verdict','observation'))
   or (x->>'sequenceNo')::integer<=0 or not app_private.is_stable_code(x->>'criterionCode')
   or length(coalesce(x->>'criterionText','')) not between 1 and 5000 or x->>'verdict' not in ('PASS','FAIL','NOT_APPLICABLE','NOT_CHECKED')
   or (x ? 'observation' and x->>'observation' is not null and length(x->>'observation')>5000)) then raise exception 'invalid Safety checklist draft item schema' using errcode='22023'; end if;
 select * into draft_row from public.safety_checklist_draft where id=target_draft_id for update;
 if found then
  if draft_row.creator_user_id<>app_private.current_effective_actor_user_id() or draft_row.safety_inspection_id<>target_safety_inspection_id then raise exception 'Safety checklist draft owner mismatch' using errcode='42501'; end if;
  if draft_row.version_no<>target_base_version then return query select 'STALE_BASE_VERSION',null::bigint,draft_row.version_no,
    jsonb_build_object('draftId',draft_row.id,'safetyInspectionId',draft_row.safety_inspection_id,'state',draft_row.state,'version',draft_row.version_no,'updatedAt',draft_row.updated_at),
    'STALE_BASE_VERSION'; return; end if;
  next_version:=draft_row.version_no+1;event_id:='EVT-SAFETY-CHECKLIST-DRAFT-UPDATED';
  perform set_config('app.r03_draft_write',target_draft_id::text,true);
  update public.safety_checklist_draft set note=target_note,version_no=next_version,updated_at=target_occurred_at where id=target_draft_id;
  delete from public.safety_checklist_draft_item where draft_id=target_draft_id;
 else
  if target_base_version<>0 then return query select 'REJECTED',null::bigint,null::bigint,null::jsonb,'DRAFT_NOT_EDITABLE'; return; end if;
  next_version:=1;event_id:='EVT-SAFETY-CHECKLIST-DRAFT-CREATED';
  perform set_config('app.r03_draft_write',target_draft_id::text,true);
  insert into public.safety_checklist_draft(id,safety_inspection_id,project_id,creator_user_id,note,state,version_no,created_at,updated_at)
   values(target_draft_id,target_safety_inspection_id,inspection_row.project_id,app_private.current_effective_actor_user_id(),target_note,'DRAFT',1,target_occurred_at,target_occurred_at);
 end if;
 for item in select value from jsonb_array_elements(target_items) loop
  sequence_no:=(item->>'sequenceNo')::integer;
  insert into public.safety_checklist_draft_item(id,draft_id,sequence_no,criterion_code,criterion_text,verdict,observation)
   values((item->>'itemId')::uuid,target_draft_id,sequence_no,item->>'criterionCode',item->>'criterionText',item->>'verdict',
    case when item ? 'observation' then item->>'observation' else null end);
 end loop;
 perform app_private.r03_append_transition(target_command_id,'offline.safety_checklist_draft.upsert','SAFETY_CHECKLIST_DRAFT',target_draft_id,
  'SM-SAFETY-CHECKLIST-DRAFT-V1',event_id,case when target_base_version=0 then null else 'DRAFT' end,'DRAFT',target_base_version,next_version,target_occurred_at);
 return query select 'APPLIED',next_version,null::bigint,null::jsonb,null::text;
end $$;

create or replace function public.r03_upsert_inspection_attempt_draft(
 target_command_id uuid,target_draft_id uuid,target_attempt_id uuid,target_base_version bigint,target_summary text,target_results jsonb,target_occurred_at timestamptz)
returns table(result_code text,aggregate_version bigint,server_version bigint,safe_server_projection jsonb,reason_code text)
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare command_row public.offline_command%rowtype; inspection_row public.inspection%rowtype; attempt_row public.inspection_attempt%rowtype; draft_row public.inspection_attempt_draft%rowtype; next_version bigint; event_id text; item jsonb;
begin
 command_row:=app_private.r03_registered_command(target_command_id,'CMD-OFFLINE-INSPECTION-DRAFT-UPSERT','INSPECTION_ATTEMPT_DRAFT',target_draft_id,target_base_version,target_occurred_at);
 if (select count(*) from jsonb_object_keys(command_row.payload))<>3 or not command_row.payload ?& array['inspectionAttemptId','summary','results']
  or (command_row.payload->>'inspectionAttemptId')::uuid<>target_attempt_id or command_row.payload->>'summary'<>target_summary
  or command_row.payload->'results'<>target_results then raise exception 'Inspection draft payload and arguments differ' using errcode='22023'; end if;
 perform app_private.m08_assert_direct_internal(target_occurred_at,'inspection.record.inspect');
 select * into strict attempt_row from public.inspection_attempt where id=target_attempt_id for share;
 select * into strict inspection_row from public.inspection where id=attempt_row.inspection_id for update;
 if inspection_row.state<>'IN_PROGRESS' or inspection_row.open_attempt_id<>attempt_row.id or attempt_row.state<>'DRAFT'
  or attempt_row.inspector_user_id<>app_private.current_effective_actor_user_id() or not app_private.actor_has_contract_internal_scope(inspection_row.contract_id,target_occurred_at)
  or not exists(select 1 from public.inspection_checklist_version c where c.id=attempt_row.inspection_checklist_version_id and c.state='SEALED') then
  raise exception 'exact open Inspection draft and internal inspector required' using errcode='42501';
 end if;
 perform app_private.r03_assert_json_array(target_results,500,'results');
 if length(trim(target_summary)) not between 1 and 12000 or exists(select 1 from jsonb_array_elements(target_results) x where jsonb_typeof(x)<>'object'
   or not x ?& array['criterionId','verdict','achievedPercent','observedValue']
   or exists(select 1 from jsonb_object_keys(x) k where k not in ('criterionId','achievedPercent','verdict','observedValue'))
   or (x->>'achievedPercent')::numeric not between 0 and 100 or x->>'verdict' not in ('PASS','FAIL','PARTIAL','UNABLE_TO_VERIFY')
   or length(coalesce(x->>'observedValue','')) not between 1 and 5000
   or not exists(select 1 from public.inspection_criterion c where c.id=(x->>'criterionId')::uuid and c.inspection_checklist_version_id=attempt_row.inspection_checklist_version_id)) then
  raise exception 'invalid Inspection attempt draft criterion schema' using errcode='22023';
 end if;
 select * into draft_row from public.inspection_attempt_draft where id=target_draft_id for update;
 if found then
  if draft_row.creator_user_id<>app_private.current_effective_actor_user_id() or draft_row.inspection_attempt_id<>target_attempt_id then raise exception 'Inspection attempt draft owner mismatch' using errcode='42501'; end if;
  if draft_row.version_no<>target_base_version then return query select 'STALE_BASE_VERSION',null::bigint,draft_row.version_no,
    jsonb_build_object('draftId',draft_row.id,'inspectionId',draft_row.inspection_id,'inspectionAttemptId',draft_row.inspection_attempt_id,'state',draft_row.state,'version',draft_row.version_no,'updatedAt',draft_row.updated_at),
    'STALE_BASE_VERSION'; return; end if;
  next_version:=draft_row.version_no+1;event_id:='EVT-INSPECTION-ATTEMPT-DRAFT-UPDATED';
  perform set_config('app.r03_draft_write',target_draft_id::text,true);
  update public.inspection_attempt_draft set summary=target_summary,version_no=next_version,updated_at=target_occurred_at where id=target_draft_id;
  delete from public.inspection_attempt_draft_criterion where draft_id=target_draft_id;
 else
  if target_base_version<>0 then return query select 'REJECTED',null::bigint,null::bigint,null::jsonb,'DRAFT_NOT_EDITABLE'; return; end if;
  next_version:=1;event_id:='EVT-INSPECTION-ATTEMPT-DRAFT-CREATED';
  perform set_config('app.r03_draft_write',target_draft_id::text,true);
  insert into public.inspection_attempt_draft(id,inspection_id,inspection_attempt_id,inspection_checklist_version_id,creator_user_id,summary,state,version_no,created_at,updated_at)
   values(target_draft_id,inspection_row.id,attempt_row.id,attempt_row.inspection_checklist_version_id,app_private.current_effective_actor_user_id(),target_summary,'DRAFT',1,target_occurred_at,target_occurred_at);
 end if;
 for item in select value from jsonb_array_elements(target_results) loop
  insert into public.inspection_attempt_draft_criterion(id,draft_id,inspection_checklist_version_id,inspection_criterion_id,achieved_percent,verdict,observed_value)
   values(extensions.gen_random_uuid(),target_draft_id,attempt_row.inspection_checklist_version_id,(item->>'criterionId')::uuid,(item->>'achievedPercent')::numeric,item->>'verdict',item->>'observedValue');
 end loop;
 perform app_private.r03_append_transition(target_command_id,'offline.inspection_attempt_draft.upsert','INSPECTION_ATTEMPT_DRAFT',target_draft_id,
  'SM-INSPECTION-ATTEMPT-DRAFT-V1',event_id,case when target_base_version=0 then null else 'DRAFT' end,'DRAFT',target_base_version,next_version,target_occurred_at);
 return query select 'APPLIED',next_version,null::bigint,null::jsonb,null::text;
end $$;

create or replace function public.r03_upsert_field_note_draft(
 target_command_id uuid,target_draft_id uuid,target_project_id uuid,target_wbs_node_id uuid,target_base_version bigint,
 target_note text,target_observed_at timestamptz,target_occurred_at timestamptz)
returns table(result_code text,aggregate_version bigint,server_version bigint,safe_server_projection jsonb,reason_code text)
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare command_row public.offline_command%rowtype; draft_row public.field_note_draft%rowtype; next_version bigint; event_id text;
begin
 command_row:=app_private.r03_registered_command(target_command_id,'CMD-OFFLINE-FIELD-NOTE-DRAFT-UPSERT','FIELD_NOTE_DRAFT',target_draft_id,target_base_version,target_occurred_at);
 if not command_row.payload ?& array['projectId','observedAt','note']
  or exists(select 1 from jsonb_object_keys(command_row.payload) k where k not in ('projectId','wbsNodeId','observedAt','note'))
  or (command_row.payload->>'projectId')::uuid<>target_project_id
  or case when not command_row.payload ? 'wbsNodeId' or jsonb_typeof(command_row.payload->'wbsNodeId')='null' then target_wbs_node_id is not null else (command_row.payload->>'wbsNodeId')::uuid is distinct from target_wbs_node_id end
  or command_row.payload->>'note'<>target_note or (command_row.payload->>'observedAt')::timestamptz<>target_observed_at then raise exception 'Field note payload and arguments differ' using errcode='22023'; end if;
 perform app_private.r03_assert_internal_project(target_project_id,target_occurred_at);
 if length(trim(target_note)) not between 1 and 12000 or target_observed_at>target_occurred_at+interval '5 minutes'
  or (target_wbs_node_id is not null and not exists(select 1 from public.wbs_node w where w.id=target_wbs_node_id and w.project_id=target_project_id)) then
  raise exception 'invalid scoped Field note draft' using errcode='22023';
 end if;
 select * into draft_row from public.field_note_draft where id=target_draft_id for update;
 if found then
  if draft_row.creator_user_id<>app_private.current_effective_actor_user_id() or draft_row.project_id<>target_project_id
   or draft_row.wbs_node_id is distinct from target_wbs_node_id then raise exception 'Field note draft owner or scope mismatch' using errcode='42501'; end if;
  if draft_row.version_no<>target_base_version then return query select 'STALE_BASE_VERSION',null::bigint,draft_row.version_no,
    jsonb_build_object('draftId',draft_row.id,'projectId',draft_row.project_id,'wbsNodeId',draft_row.wbs_node_id,'state',draft_row.state,'version',draft_row.version_no,'updatedAt',draft_row.updated_at),
    'STALE_BASE_VERSION'; return; end if;
  next_version:=draft_row.version_no+1;event_id:='EVT-FIELD-NOTE-DRAFT-UPDATED';
  perform set_config('app.r03_draft_write',target_draft_id::text,true);
  update public.field_note_draft set note=target_note,observed_at=target_observed_at,version_no=next_version,updated_at=target_occurred_at where id=target_draft_id;
 else
  if target_base_version<>0 then return query select 'REJECTED',null::bigint,null::bigint,null::jsonb,'DRAFT_NOT_EDITABLE'; return; end if;
  next_version:=1;event_id:='EVT-FIELD-NOTE-DRAFT-CREATED';
  perform set_config('app.r03_draft_write',target_draft_id::text,true);
  insert into public.field_note_draft(id,project_id,wbs_node_id,creator_user_id,note,observed_at,state,version_no,created_at,updated_at)
   values(target_draft_id,target_project_id,target_wbs_node_id,app_private.current_effective_actor_user_id(),target_note,target_observed_at,'DRAFT',1,target_occurred_at,target_occurred_at);
 end if;
 perform app_private.r03_append_transition(target_command_id,'offline.field_note_draft.upsert','FIELD_NOTE_DRAFT',target_draft_id,
  'SM-FIELD-NOTE-DRAFT-V1',event_id,case when target_base_version=0 then null else 'DRAFT' end,'DRAFT',target_base_version,next_version,target_occurred_at);
 return query select 'APPLIED',next_version,null::bigint,null::jsonb,null::text;
end $$;

create or replace function public.r03_update_wbs_progress(
 target_command_id uuid,target_wbs_node_id uuid,target_base_version bigint,target_progress_percent numeric,target_occurred_at timestamptz)
returns table(result_code text,aggregate_version bigint,server_version bigint,safe_server_projection jsonb,reason_code text)
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare command_row public.offline_command%rowtype; node_row public.wbs_node%rowtype; next_version bigint; internal_editor boolean; vendor_editor boolean;
begin
 command_row:=app_private.r03_registered_command(target_command_id,'CMD-OFFLINE-WORK-ITEM-PROGRESS-UPDATE','WBS_NODE',target_wbs_node_id,target_base_version,target_occurred_at);
 if (select count(*) from jsonb_object_keys(command_row.payload))<>1 or not command_row.payload ? 'progressPercent'
  or (command_row.payload->>'progressPercent')::numeric<>target_progress_percent then raise exception 'WBS progress payload and arguments differ' using errcode='22023'; end if;
 select * into strict node_row from public.wbs_node where id=target_wbs_node_id for update;
 internal_editor:=exists(select 1 from public.user_account u where u.id=app_private.current_effective_actor_user_id() and u.account_kind='INTERNAL' and u.status='ACTIVE'
   and u.valid_from<=target_occurred_at and (u.valid_until is null or u.valid_until>target_occurred_at))
  and (node_row.assignee_user_id=app_private.current_effective_actor_user_id() or app_private.actor_can_edit_project(node_row.project_id,target_occurred_at));
 vendor_editor:=node_row.assigned_vendor_user_id is not null
  and app_private.actor_has_project_vendor_scope(node_row.project_id,'project.wbs.update',target_occurred_at)
  and exists(select 1 from public.vendor_user vu join public.vendor v on v.id=vu.vendor_id and v.status='ACTIVE'
    where vu.id=node_row.assigned_vendor_user_id and vu.user_id=app_private.current_actor_user_id() and vu.vendor_id=node_row.assigned_vendor_id
     and vu.status='ACTIVE' and vu.revoked_at is null and vu.valid_from<=target_occurred_at and (vu.valid_until is null or vu.valid_until>target_occurred_at));
 if not (internal_editor or vendor_editor) then raise exception 'exact WBS assignee or PM scope required' using errcode='42501'; end if;
 if node_row.state<>'IN_PROGRESS' or target_progress_percent<0 or target_progress_percent>=100 then raise exception 'offline WBS progress requires IN_PROGRESS and 0 through 99 percent' using errcode='22023'; end if;
 if node_row.version_no<>target_base_version then return query select 'STALE_BASE_VERSION',null::bigint,node_row.version_no,
   jsonb_build_object('wbsNodeId',node_row.id,'projectId',node_row.project_id,'state',node_row.state,'progressPercent',node_row.progress_percent,'version',node_row.version_no,'updatedAt',node_row.updated_at),
   'STALE_BASE_VERSION'; return; end if;
 next_version:=node_row.version_no+1;
 update public.wbs_node set progress_percent=target_progress_percent,version_no=next_version,updated_at=target_occurred_at where id=node_row.id;
 perform app_private.r03_append_transition(target_command_id,'offline.wbs_progress.update','WBS_NODE',node_row.id,'SM-WBS-V1','EVT-WBS-PROGRESS-UPDATED',
  'IN_PROGRESS','IN_PROGRESS',node_row.version_no,next_version,target_occurred_at);
 return query select 'APPLIED',next_version,null::bigint,null::jsonb,null::text;
end $$;

create or replace function public.r03_upsert_field_record_draft(
 target_command_id uuid,target_draft_id uuid,target_project_id uuid,target_wbs_node_id uuid,target_base_version bigint,target_record_type text,
 target_summary text,target_observed_at timestamptz,target_location text,target_measurements jsonb,target_occurred_at timestamptz)
returns table(result_code text,aggregate_version bigint,server_version bigint,safe_server_projection jsonb,reason_code text)
language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare command_row public.offline_command%rowtype; draft_row public.field_record_draft%rowtype; next_version bigint; event_id text; item jsonb; sequence_no integer:=0;
begin
 command_row:=app_private.r03_registered_command(target_command_id,'CMD-OFFLINE-FIELD-RECORD-DRAFT-UPSERT','FIELD_RECORD_DRAFT',target_draft_id,target_base_version,target_occurred_at);
 if not command_row.payload ?& array['projectId','recordType','summary','observedAt','measurements']
  or exists(select 1 from jsonb_object_keys(command_row.payload) k where k not in ('projectId','wbsNodeId','recordType','summary','observedAt','location','measurements'))
  or (command_row.payload->>'projectId')::uuid<>target_project_id
  or case when not command_row.payload ? 'wbsNodeId' or jsonb_typeof(command_row.payload->'wbsNodeId')='null' then target_wbs_node_id is not null else (command_row.payload->>'wbsNodeId')::uuid is distinct from target_wbs_node_id end
  or command_row.payload->>'recordType'<>target_record_type or command_row.payload->>'summary'<>target_summary
  or (command_row.payload->>'observedAt')::timestamptz<>target_observed_at
  or case when not command_row.payload ? 'location' or jsonb_typeof(command_row.payload->'location')='null' then target_location is not null else command_row.payload->>'location' is distinct from target_location end
  or command_row.payload->'measurements'<>target_measurements then raise exception 'Field record payload and arguments differ' using errcode='22023'; end if;
 perform app_private.r03_assert_internal_project(target_project_id,target_occurred_at);
 perform app_private.r03_assert_json_array(target_measurements,200,'measurements');
 if not app_private.is_stable_code(target_record_type) or length(trim(target_summary)) not between 1 and 12000
  or length(coalesce(target_location,''))>500 or target_observed_at>target_occurred_at+interval '5 minutes'
  or (target_wbs_node_id is not null and not exists(select 1 from public.wbs_node w where w.id=target_wbs_node_id and w.project_id=target_project_id))
  or exists(select 1 from jsonb_array_elements(target_measurements) x where jsonb_typeof(x)<>'object'
    or not x ?& array['measurementId','metricCode','value','unitCode']
    or exists(select 1 from jsonb_object_keys(x) k where k not in ('measurementId','metricCode','value','unitCode','note'))
    or not app_private.is_stable_code(x->>'metricCode') or length(coalesce(x->>'value','')) not between 1 and 1000
    or not app_private.is_stable_code(x->>'unitCode') or (x ? 'note' and x->>'note' is not null and length(x->>'note')>5000)) then
  raise exception 'invalid scoped Field record draft' using errcode='22023';
 end if;
 select * into draft_row from public.field_record_draft where id=target_draft_id for update;
 if found then
  if draft_row.creator_user_id<>app_private.current_effective_actor_user_id() or draft_row.project_id<>target_project_id
   or draft_row.wbs_node_id is distinct from target_wbs_node_id then raise exception 'Field record draft owner or scope mismatch' using errcode='42501'; end if;
  if draft_row.version_no<>target_base_version then return query select 'STALE_BASE_VERSION',null::bigint,draft_row.version_no,
    jsonb_build_object('draftId',draft_row.id,'projectId',draft_row.project_id,'wbsNodeId',draft_row.wbs_node_id,'recordType',draft_row.record_type,'state',draft_row.state,'version',draft_row.version_no,'updatedAt',draft_row.updated_at),
    'STALE_BASE_VERSION'; return; end if;
  next_version:=draft_row.version_no+1;event_id:='EVT-FIELD-RECORD-DRAFT-UPDATED';
  perform set_config('app.r03_draft_write',target_draft_id::text,true);
  update public.field_record_draft set record_type=target_record_type,summary=target_summary,observed_at=target_observed_at,location=target_location,
   version_no=next_version,updated_at=target_occurred_at where id=target_draft_id;
  delete from public.field_record_draft_measurement where draft_id=target_draft_id;
 else
  if target_base_version<>0 then return query select 'REJECTED',null::bigint,null::bigint,null::jsonb,'DRAFT_NOT_EDITABLE'; return; end if;
  next_version:=1;event_id:='EVT-FIELD-RECORD-DRAFT-CREATED';
  perform set_config('app.r03_draft_write',target_draft_id::text,true);
  insert into public.field_record_draft(id,project_id,wbs_node_id,creator_user_id,record_type,summary,observed_at,location,state,version_no,created_at,updated_at)
   values(target_draft_id,target_project_id,target_wbs_node_id,app_private.current_effective_actor_user_id(),target_record_type,target_summary,target_observed_at,target_location,'DRAFT',1,target_occurred_at,target_occurred_at);
 end if;
 for item in select value from jsonb_array_elements(target_measurements) loop
  sequence_no:=sequence_no+1;
  insert into public.field_record_draft_measurement(id,draft_id,sequence_no,metric_code,value,unit_code,note)
   values((item->>'measurementId')::uuid,target_draft_id,sequence_no,item->>'metricCode',item->>'value',item->>'unitCode',
    case when item ? 'note' then item->>'note' else null end);
 end loop;
 perform app_private.r03_append_transition(target_command_id,'offline.field_record_draft.upsert','FIELD_RECORD_DRAFT',target_draft_id,
  'SM-FIELD-RECORD-DRAFT-V1',event_id,case when target_base_version=0 then null else 'DRAFT' end,'DRAFT',target_base_version,next_version,target_occurred_at);
 return query select 'APPLIED',next_version,null::bigint,null::jsonb,null::text;
end $$;

create or replace function app_private.r03_guard_draft_write()
returns trigger language plpgsql set search_path=pg_catalog,app_private as $$
declare target_id uuid;
begin
 target_id:=case tg_table_name
  when 'safety_checklist_draft' then coalesce(new.id,old.id)
  when 'inspection_attempt_draft' then coalesce(new.id,old.id)
  when 'field_note_draft' then coalesce(new.id,old.id)
  when 'field_record_draft' then coalesce(new.id,old.id)
  else coalesce(new.draft_id,old.draft_id) end;
 if app_private.optional_setting('app.r03_draft_write') is distinct from target_id::text then raise exception 'R03 draft writes require the guarded command path' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;

create trigger safety_checklist_draft_guard before insert or update or delete on public.safety_checklist_draft for each row execute function app_private.r03_guard_draft_write();
create trigger safety_checklist_draft_item_guard before insert or update or delete on public.safety_checklist_draft_item for each row execute function app_private.r03_guard_draft_write();
create trigger inspection_attempt_draft_guard before insert or update or delete on public.inspection_attempt_draft for each row execute function app_private.r03_guard_draft_write();
create trigger inspection_attempt_draft_criterion_guard before insert or update or delete on public.inspection_attempt_draft_criterion for each row execute function app_private.r03_guard_draft_write();
create trigger field_note_draft_guard before insert or update or delete on public.field_note_draft for each row execute function app_private.r03_guard_draft_write();
create trigger field_record_draft_guard before insert or update or delete on public.field_record_draft for each row execute function app_private.r03_guard_draft_write();
create trigger field_record_draft_measurement_guard before insert or update or delete on public.field_record_draft_measurement for each row execute function app_private.r03_guard_draft_write();

do $rls$
declare table_name text;
begin
 foreach table_name in array array['safety_checklist_draft','safety_checklist_draft_item','inspection_attempt_draft','inspection_attempt_draft_criterion',
  'field_note_draft','field_record_draft','field_record_draft_measurement'] loop
  execute format('alter table public.%I enable row level security',table_name);
  execute format('alter table public.%I force row level security',table_name);
 end loop;
end $rls$;

create policy safety_checklist_draft_owner_read on public.safety_checklist_draft for select to youone_request using(
 app_private.actor_is_active() and creator_user_id=app_private.current_effective_actor_user_id()
 and exists(select 1 from public.user_account u where u.id=creator_user_id and u.account_kind='INTERNAL'));
create policy safety_checklist_draft_item_owner_read on public.safety_checklist_draft_item for select to youone_request using(
 exists(select 1 from public.safety_checklist_draft d where d.id=draft_id and d.creator_user_id=app_private.current_effective_actor_user_id()));
create policy inspection_attempt_draft_owner_read on public.inspection_attempt_draft for select to youone_request using(
 app_private.actor_is_active() and creator_user_id=app_private.current_effective_actor_user_id()
 and exists(select 1 from public.user_account u where u.id=creator_user_id and u.account_kind='INTERNAL'));
create policy inspection_attempt_draft_criterion_owner_read on public.inspection_attempt_draft_criterion for select to youone_request using(
 exists(select 1 from public.inspection_attempt_draft d where d.id=draft_id and d.creator_user_id=app_private.current_effective_actor_user_id()));
create policy field_note_draft_owner_read on public.field_note_draft for select to youone_request using(
 app_private.actor_is_active() and creator_user_id=app_private.current_effective_actor_user_id()
 and exists(select 1 from public.user_account u where u.id=creator_user_id and u.account_kind='INTERNAL'));
create policy field_record_draft_owner_read on public.field_record_draft for select to youone_request using(
 app_private.actor_is_active() and creator_user_id=app_private.current_effective_actor_user_id()
 and exists(select 1 from public.user_account u where u.id=creator_user_id and u.account_kind='INTERNAL'));
create policy field_record_draft_measurement_owner_read on public.field_record_draft_measurement for select to youone_request using(
 exists(select 1 from public.field_record_draft d where d.id=draft_id and d.creator_user_id=app_private.current_effective_actor_user_id()));

revoke all on table public.safety_checklist_draft,public.safety_checklist_draft_item,public.inspection_attempt_draft,
 public.inspection_attempt_draft_criterion,public.field_note_draft,public.field_record_draft,public.field_record_draft_measurement
from public,youone_request,youone_privileged_writer;
grant select on table public.safety_checklist_draft,public.safety_checklist_draft_item,public.inspection_attempt_draft,
 public.inspection_attempt_draft_criterion,public.field_note_draft,public.field_record_draft,public.field_record_draft_measurement to youone_request;

revoke all on function public.r03_upsert_safety_checklist_draft(uuid,uuid,uuid,bigint,text,jsonb,timestamptz),
 public.r03_upsert_inspection_attempt_draft(uuid,uuid,uuid,bigint,text,jsonb,timestamptz),
 public.r03_upsert_field_note_draft(uuid,uuid,uuid,uuid,bigint,text,timestamptz,timestamptz),
 public.r03_update_wbs_progress(uuid,uuid,bigint,numeric,timestamptz),
 public.r03_upsert_field_record_draft(uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,jsonb,timestamptz)
from public,youone_request,youone_privileged_writer;
grant execute on function public.r03_upsert_safety_checklist_draft(uuid,uuid,uuid,bigint,text,jsonb,timestamptz),
 public.r03_upsert_inspection_attempt_draft(uuid,uuid,uuid,bigint,text,jsonb,timestamptz),
 public.r03_upsert_field_note_draft(uuid,uuid,uuid,uuid,bigint,text,timestamptz,timestamptz),
 public.r03_update_wbs_progress(uuid,uuid,bigint,numeric,timestamptz),
 public.r03_upsert_field_record_draft(uuid,uuid,uuid,uuid,bigint,text,text,timestamptz,text,jsonb,timestamptz)
to youone_request;

revoke all on function app_private.r03_registered_command(uuid,text,text,uuid,bigint,timestamptz),
 app_private.r03_append_transition(uuid,text,text,uuid,text,text,text,text,bigint,bigint,timestamptz),
 app_private.r03_assert_json_array(jsonb,integer,text),app_private.r03_assert_internal_project(uuid,timestamptz),app_private.r03_guard_draft_write()
from public,youone_request,youone_privileged_writer;
