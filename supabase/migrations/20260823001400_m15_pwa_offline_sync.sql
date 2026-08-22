-- M15 PWA offline synchronization. ADR-007: explicit allowlist and no automatic overwrite.

insert into public.action_definition(action_id) values
 ('offline.command.receive'),('offline.command.apply'),('offline.command.reject'),
 ('offline.command.conflict'),('offline.conflict.resolve')
on conflict do nothing;
insert into public.aggregate_type_definition(aggregate_type) values ('OFFLINE_COMMAND'),('SYNC_CONFLICT') on conflict do nothing;

create table public.offline_command_type_definition (
 command_type text primary key check(app_private.is_stable_code(command_type)),
 execution_mode text not null check(execution_mode in ('OFFLINE_ALLOWED','ONLINE_ONLY')),
 current_schema_version bigint not null check(current_schema_version>0),
 registered_at timestamptz not null default statement_timestamp()
);
insert into public.offline_command_type_definition(command_type,execution_mode,current_schema_version) values
 ('CMD-OFFLINE-CHECKLIST-DRAFT-UPSERT','OFFLINE_ALLOWED',1),
 ('CMD-OFFLINE-INSPECTION-DRAFT-UPSERT','OFFLINE_ALLOWED',1),
 ('CMD-OFFLINE-FIELD-NOTE-DRAFT-UPSERT','OFFLINE_ALLOWED',1),
 ('CMD-OFFLINE-WORK-ITEM-PROGRESS-UPDATE','OFFLINE_ALLOWED',1),
 ('CMD-OFFLINE-FIELD-RECORD-DRAFT-UPSERT','OFFLINE_ALLOWED',1),
 ('CMD-APPROVAL-ACTION','ONLINE_ONLY',1),
 ('CMD-AUTHORIZATION-ASSIGNMENT-CHANGE','ONLINE_ONLY',1),
 ('CMD-SCOPE-GRANT-CHANGE','ONLINE_ONLY',1),
 ('CMD-TECHNICAL-DOCUMENT-L2-L4-ACCESS','ONLINE_ONLY',1),
 ('CMD-TECHNICAL-DOCUMENT-DELETE-APPROVAL','ONLINE_ONLY',1),
 ('CMD-TECHNICAL-DOCUMENT-CONTROLLED-COPY','ONLINE_ONLY',1),
 ('CMD-CONTRACT-SIGN','ONLINE_ONLY',1),
 ('CMD-CONTRACT-TERMINATE','ONLINE_ONLY',1),
 ('CMD-PAYMENT-CONFIRM','ONLINE_ONLY',1);

create or replace function app_private.m15_canonical_json(value jsonb)
returns text language plpgsql immutable strict set search_path=pg_catalog as $$
declare kind text:=jsonb_typeof(value); rendered text;
begin
 if kind='object' then
  select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||app_private.m15_canonical_json(child),',' order by key),'')||'}'
    into rendered from jsonb_each(value) as item(key,child);
  return rendered;
 elsif kind='array' then
  select '['||coalesce(string_agg(app_private.m15_canonical_json(child),',' order by ordinal),'')||']'
    into rendered from jsonb_array_elements(value) with ordinality as item(child,ordinal);
  return rendered;
 end if;
 return value::text;
end $$;

create table public.offline_command (
 command_id uuid primary key,
 command_type text not null references public.offline_command_type_definition(command_type),
 authenticated_actor_user_id uuid not null references public.user_account(id),
 effective_actor_user_id uuid not null references public.user_account(id),
 session_binding_hash text not null check(app_private.is_sha256(session_binding_hash)),
 actor_snapshot jsonb not null check(jsonb_typeof(actor_snapshot)='object' and not app_private.payload_contains_forbidden_key(actor_snapshot)),
 session_snapshot jsonb not null check(jsonb_typeof(session_snapshot)='object' and not app_private.payload_contains_forbidden_key(session_snapshot)),
 aggregate_type text not null check(app_private.is_stable_code(aggregate_type)),
 aggregate_id uuid not null,
 base_version bigint not null check(base_version>=0),
 payload_schema_version bigint not null check(payload_schema_version>0),
 created_at timestamptz not null,
 payload_hash text not null check(app_private.is_sha256(payload_hash)),
 payload_json text not null check(octet_length(payload_json)<=32768),
 payload jsonb generated always as (payload_json::jsonb) stored,
 received_at timestamptz not null,
 correlation_id text not null check(app_private.is_opaque_key(correlation_id)),
 check(jsonb_typeof(payload_json::jsonb)='object'),
 check(payload_json=app_private.m15_canonical_json(payload_json::jsonb)),
 check(not app_private.payload_contains_forbidden_key(payload_json::jsonb)),
 check(payload_hash=encode(extensions.digest(convert_to(payload_json,'UTF8'),'sha256'),'hex')),
 check(created_at<=received_at+interval '5 minutes')
);
create index offline_command_actor_idx on public.offline_command(authenticated_actor_user_id,received_at desc);
create index offline_command_aggregate_idx on public.offline_command(aggregate_type,aggregate_id,base_version);
alter table public.offline_command add constraint offline_command_conflict_exact_unique
 unique(command_id,command_type,aggregate_type,aggregate_id,base_version,payload_hash);

create table public.sync_conflict (
 conflict_id uuid primary key,
 offline_command_id uuid not null unique references public.offline_command(command_id),
 command_type text not null,
 aggregate_type text not null check(app_private.is_stable_code(aggregate_type)),
 aggregate_id uuid not null,
 base_version bigint not null check(base_version>=0),
 server_version bigint not null check(server_version>base_version),
 local_payload jsonb not null check(jsonb_typeof(local_payload)='object' and not app_private.payload_contains_forbidden_key(local_payload)),
 local_payload_hash text not null check(app_private.is_sha256(local_payload_hash)),
 safe_server_projection jsonb not null check(jsonb_typeof(safe_server_projection)='object' and not app_private.payload_contains_forbidden_key(safe_server_projection)),
 safe_server_projection_hash text not null check(app_private.is_sha256(safe_server_projection_hash)),
 conflict_state text not null default 'OPEN' check(conflict_state='OPEN'),
 detected_at timestamptz not null,
 foreign key(offline_command_id,command_type,aggregate_type,aggregate_id,base_version,local_payload_hash)
  references public.offline_command(command_id,command_type,aggregate_type,aggregate_id,base_version,payload_hash)
);

create table public.offline_command_result (
 offline_command_id uuid primary key references public.offline_command(command_id),
 result_code text not null check(result_code in ('APPLIED','REJECTED','SYNC_CONFLICT')),
 aggregate_version bigint check(aggregate_version is null or aggregate_version>=0),
 reason_code text check(reason_code is null or app_private.is_stable_code(reason_code)),
 conflict_id uuid unique references public.sync_conflict(conflict_id),
 recorded_at timestamptz not null,
 check((result_code='APPLIED' and aggregate_version is not null and reason_code is null and conflict_id is null)
   or (result_code='REJECTED' and aggregate_version is null and reason_code is not null and conflict_id is null)
   or (result_code='SYNC_CONFLICT' and aggregate_version is null and reason_code='STALE_BASE_VERSION' and conflict_id is not null))
);

create table public.sync_conflict_resolution (
 resolution_id uuid primary key,
 conflict_id uuid not null references public.sync_conflict(conflict_id),
 sequence_no bigint not null check(sequence_no>0),
 resolution_state text not null check(resolution_state in ('RESOLVED_DISCARD_LOCAL','RESOLVED_RETRY_AS_NEW')),
 successor_offline_command_id uuid references public.offline_command(command_id),
 resolved_by_user_id uuid not null references public.user_account(id),
 session_binding_hash text not null check(app_private.is_sha256(session_binding_hash)),
 reason_code text not null check(app_private.is_stable_code(reason_code)),
 resolved_at timestamptz not null,
 correlation_id text not null check(app_private.is_opaque_key(correlation_id)),
 unique(conflict_id,sequence_no),
 check((resolution_state='RESOLVED_DISCARD_LOCAL' and successor_offline_command_id is null)
   or (resolution_state='RESOLVED_RETRY_AS_NEW' and successor_offline_command_id is not null))
);

create or replace function app_private.m15_reject_immutable_change()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'offline command and conflict evidence is append-only' using errcode='55000'; end $$;
create trigger offline_command_immutable before update or delete on public.offline_command for each row execute function app_private.m15_reject_immutable_change();
create trigger offline_command_result_immutable before update or delete on public.offline_command_result for each row execute function app_private.m15_reject_immutable_change();
create trigger sync_conflict_immutable before update or delete on public.sync_conflict for each row execute function app_private.m15_reject_immutable_change();
create trigger sync_conflict_resolution_immutable before update or delete on public.sync_conflict_resolution for each row execute function app_private.m15_reject_immutable_change();
create trigger offline_command_type_definition_immutable before update or delete on public.offline_command_type_definition for each row execute function app_private.m15_reject_immutable_change();

create or replace function app_private.m15_guard_exact_local_payload()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from public.offline_command c where c.command_id=new.offline_command_id and c.payload=new.local_payload and c.payload_hash=new.local_payload_hash) then
  raise exception 'sync conflict must preserve exact local payload' using errcode='23514';
 end if;
 return new;
end $$;
create trigger sync_conflict_exact_local before insert on public.sync_conflict for each row execute function app_private.m15_guard_exact_local_payload();

create or replace function app_private.register_offline_command(
 target_command_id uuid,target_command_type text,target_authenticated_actor uuid,target_effective_actor uuid,target_session_binding_hash text,
 target_aggregate_type text,target_aggregate_id uuid,target_base_version bigint,target_schema_version bigint,target_created_at timestamptz,
 target_payload_hash text,target_payload_json text,target_received_at timestamptz)
returns text language plpgsql security definer set search_path=pg_catalog,public,app_private,extensions as $$
declare trusted_time timestamptz:=app_private.request_time(); current_session text:=app_private.required_setting('app.session_id'); existing public.offline_command%rowtype; expected_binding text;
begin
 if target_received_at<>trusted_time then raise exception 'server receipt time must equal trusted request time' using errcode='22023'; end if;
 if not app_private.actor_is_active(trusted_time) then raise exception 'offline replay requires active authenticated actor' using errcode='42501'; end if;
 if target_authenticated_actor<>app_private.current_actor_user_id() or target_effective_actor<>app_private.current_effective_actor_user_id() then
  raise exception 'offline actor binding mismatch' using errcode='42501';
 end if;
 expected_binding:=encode(extensions.digest(convert_to(target_authenticated_actor::text||':'||current_session,'UTF8'),'sha256'),'hex');
 if target_session_binding_hash<>expected_binding then raise exception 'offline session binding mismatch' using errcode='42501'; end if;
 if not exists(select 1 from public.offline_command_type_definition d where d.command_type=target_command_type and d.execution_mode='OFFLINE_ALLOWED' and d.current_schema_version=target_schema_version) then
  raise exception 'offline command is unregistered, online-only, or has unsupported schema' using errcode='42501';
 end if;
 select * into existing from public.offline_command where command_id=target_command_id;
 if found then
  if existing.command_type<>target_command_type or existing.authenticated_actor_user_id<>target_authenticated_actor or existing.effective_actor_user_id<>target_effective_actor
   or existing.session_binding_hash<>target_session_binding_hash or existing.aggregate_type<>target_aggregate_type or existing.aggregate_id<>target_aggregate_id
   or existing.base_version<>target_base_version or existing.payload_schema_version<>target_schema_version or existing.created_at<>target_created_at
   or existing.payload_hash<>target_payload_hash or existing.payload_json<>target_payload_json then
   raise exception 'offline command idempotency mismatch' using errcode='23505';
  end if;
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

create or replace function app_private.record_offline_command_result(target_command_id uuid,target_result text,target_aggregate_version bigint,target_reason_code text,target_recorded_at timestamptz)
returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare command public.offline_command%rowtype; expected_binding text;
begin
 select * into strict command from public.offline_command where command_id=target_command_id for share;
 if not app_private.actor_is_active(target_recorded_at) or command.authenticated_actor_user_id<>app_private.current_actor_user_id() then raise exception 'offline result requires current command owner' using errcode='42501'; end if;
 expected_binding:=encode(extensions.digest(convert_to(command.authenticated_actor_user_id::text||':'||app_private.required_setting('app.session_id'),'UTF8'),'sha256'),'hex');
 if command.session_binding_hash<>expected_binding then raise exception 'offline result session binding mismatch' using errcode='42501'; end if;
 if target_result not in ('APPLIED','REJECTED') then raise exception 'invalid non-conflict offline result' using errcode='22023'; end if;
 if target_recorded_at<>app_private.request_time() then raise exception 'offline result time must equal trusted request time' using errcode='22023'; end if;
 if target_result='APPLIED' and target_aggregate_version<>command.base_version+1 then raise exception 'applied result must advance exact base version' using errcode='40001'; end if;
 insert into public.offline_command_result(offline_command_id,result_code,aggregate_version,reason_code,recorded_at)
 values(target_command_id,target_result,target_aggregate_version,target_reason_code,target_recorded_at);
 perform app_private.append_audit(extensions.gen_random_uuid(),case when target_result='APPLIED' then 'offline.command.apply' else 'offline.command.reject' end,
  'OFFLINE_COMMAND',target_command_id,coalesce(target_aggregate_version,0),case when target_result='APPLIED' then 'SUCCEEDED' else 'DENIED' end,
  coalesce(target_reason_code,'OFFLINE_COMMAND_APPLIED'),null,null,null,null,target_recorded_at);
end $$;

create or replace function app_private.record_sync_conflict(target_conflict_id uuid,target_command_id uuid,target_server_version bigint,
 target_server_projection jsonb,target_server_projection_hash text,target_detected_at timestamptz)
returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare command public.offline_command%rowtype; expected_binding text;
begin
 select * into strict command from public.offline_command where command_id=target_command_id for share;
 if target_detected_at<>app_private.request_time() then raise exception 'conflict time must equal trusted request time' using errcode='22023'; end if;
 if not app_private.actor_is_active(target_detected_at) or command.authenticated_actor_user_id<>app_private.current_actor_user_id() then raise exception 'sync conflict requires current command owner' using errcode='42501'; end if;
 expected_binding:=encode(extensions.digest(convert_to(command.authenticated_actor_user_id::text||':'||app_private.required_setting('app.session_id'),'UTF8'),'sha256'),'hex');
 if command.session_binding_hash<>expected_binding then raise exception 'sync conflict session binding mismatch' using errcode='42501'; end if;
 if target_server_version<=command.base_version then raise exception 'conflict requires a newer server version than the stale base' using errcode='22023'; end if;
 if target_server_projection_hash<>encode(extensions.digest(convert_to(app_private.m15_canonical_json(target_server_projection),'UTF8'),'sha256'),'hex') then
  raise exception 'safe server projection hash mismatch' using errcode='22023';
 end if;
 insert into public.sync_conflict(conflict_id,offline_command_id,command_type,aggregate_type,aggregate_id,base_version,server_version,
  local_payload,local_payload_hash,safe_server_projection,safe_server_projection_hash,detected_at)
 values(target_conflict_id,command.command_id,command.command_type,command.aggregate_type,command.aggregate_id,command.base_version,target_server_version,
  command.payload,command.payload_hash,target_server_projection,target_server_projection_hash,target_detected_at);
 insert into public.offline_command_result(offline_command_id,result_code,reason_code,conflict_id,recorded_at)
 values(command.command_id,'SYNC_CONFLICT','STALE_BASE_VERSION',target_conflict_id,target_detected_at);
 perform app_private.append_audit(extensions.gen_random_uuid(),'offline.command.conflict','SYNC_CONFLICT',target_conflict_id,target_server_version,
  'FAILED','STALE_BASE_VERSION',target_conflict_id,command.payload_hash,target_server_projection_hash,null,target_detected_at);
end $$;

create or replace function app_private.resolve_sync_conflict(target_resolution_id uuid,target_conflict_id uuid,target_sequence_no bigint,target_resolution_state text,
 target_successor_command_id uuid,target_reason_code text,target_resolved_at timestamptz)
returns void language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare owner_id uuid; binding text; conflict_record public.sync_conflict%rowtype;
begin
 if target_resolved_at<>app_private.request_time() then raise exception 'resolution time must equal trusted request time' using errcode='22023'; end if;
 select s.* into strict conflict_record from public.sync_conflict s where s.conflict_id=target_conflict_id for share;
 select c.authenticated_actor_user_id into strict owner_id from public.offline_command c where c.command_id=conflict_record.offline_command_id;
 if not app_private.actor_is_active(target_resolved_at) or owner_id<>app_private.current_actor_user_id() then raise exception 'conflict owner required' using errcode='42501'; end if;
 if target_sequence_no<>1 or exists(select 1 from public.sync_conflict_resolution where conflict_id=target_conflict_id) then raise exception 'conflict resolution is terminal and append-only' using errcode='23505'; end if;
 if target_resolution_state='RESOLVED_RETRY_AS_NEW' and not exists(select 1 from public.offline_command successor where successor.command_id=target_successor_command_id
   and successor.authenticated_actor_user_id=owner_id and successor.command_type=conflict_record.command_type and successor.aggregate_type=conflict_record.aggregate_type
   and successor.aggregate_id=conflict_record.aggregate_id and successor.base_version=conflict_record.server_version) then
  raise exception 'retry must be a new exact-owner command based on preserved server version' using errcode='23514';
 end if;
 binding:=encode(extensions.digest(convert_to(owner_id::text||':'||app_private.required_setting('app.session_id'),'UTF8'),'sha256'),'hex');
 insert into public.sync_conflict_resolution(resolution_id,conflict_id,sequence_no,resolution_state,successor_offline_command_id,resolved_by_user_id,session_binding_hash,reason_code,resolved_at,correlation_id)
 values(target_resolution_id,target_conflict_id,target_sequence_no,target_resolution_state,target_successor_command_id,owner_id,binding,target_reason_code,target_resolved_at,app_private.required_setting('app.correlation_id'));
 perform app_private.append_audit(extensions.gen_random_uuid(),'offline.conflict.resolve','SYNC_CONFLICT',target_conflict_id,conflict_record.server_version,'SUCCEEDED',target_reason_code,target_resolution_id,null,null,null,target_resolved_at);
end $$;

do $rls$
declare table_name text;
begin
 foreach table_name in array array['offline_command_type_definition','offline_command','sync_conflict','offline_command_result','sync_conflict_resolution'] loop
  execute format('alter table public.%I enable row level security',table_name);
  execute format('alter table public.%I force row level security',table_name);
 end loop;
end $rls$;
create policy offline_command_owner_read on public.offline_command for select to youone_request using(app_private.actor_is_active() and authenticated_actor_user_id=app_private.current_actor_user_id());
create policy sync_conflict_owner_read on public.sync_conflict for select to youone_request using(app_private.actor_is_active() and exists(select 1 from public.offline_command c where c.command_id=offline_command_id and c.authenticated_actor_user_id=app_private.current_actor_user_id()));
create policy offline_result_owner_read on public.offline_command_result for select to youone_request using(app_private.actor_is_active() and exists(select 1 from public.offline_command c where c.command_id=offline_command_id and c.authenticated_actor_user_id=app_private.current_actor_user_id()));
create policy sync_resolution_owner_read on public.sync_conflict_resolution for select to youone_request using(app_private.actor_is_active() and exists(select 1 from public.sync_conflict s join public.offline_command c on c.command_id=s.offline_command_id where s.conflict_id=sync_conflict_resolution.conflict_id and c.authenticated_actor_user_id=app_private.current_actor_user_id()));

revoke all on table public.offline_command_type_definition,public.offline_command,public.sync_conflict,public.offline_command_result,public.sync_conflict_resolution from public,youone_request,youone_privileged_writer;
grant select on public.offline_command,public.sync_conflict,public.offline_command_result,public.sync_conflict_resolution to youone_request;
revoke all on function app_private.register_offline_command(uuid,text,uuid,uuid,text,text,uuid,bigint,bigint,timestamptz,text,text,timestamptz) from public,youone_request,youone_privileged_writer;
grant execute on function app_private.register_offline_command(uuid,text,uuid,uuid,text,text,uuid,bigint,bigint,timestamptz,text,text,timestamptz) to youone_request;
revoke all on function app_private.resolve_sync_conflict(uuid,uuid,bigint,text,uuid,text,timestamptz) from public,youone_request,youone_privileged_writer;
grant execute on function app_private.resolve_sync_conflict(uuid,uuid,bigint,text,uuid,text,timestamptz) to youone_request;
revoke all on function app_private.record_offline_command_result(uuid,text,bigint,text,timestamptz),app_private.record_sync_conflict(uuid,uuid,bigint,jsonb,text,timestamptz) from public,youone_request,youone_privileged_writer;
grant execute on function app_private.record_offline_command_result(uuid,text,bigint,text,timestamptz),app_private.record_sync_conflict(uuid,uuid,bigint,jsonb,text,timestamptz) to youone_request;
