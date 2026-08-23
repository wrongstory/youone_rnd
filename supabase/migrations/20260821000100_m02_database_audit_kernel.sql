-- M02 DB/Audit Kernel
-- Forward-fix policy: after this pre-release hosted-Supabase compatibility re-baseline, never edit this migration after merge. Add a later migration.
-- 2026-08-24: the prior merged form never applied successfully to Staging; redundant ALTER ROLE security-attribute resets were replaced by fail-closed pg_roles validation because hosted Supabase postgres is not SUPERUSER.
-- No business feature tables, workflow states, or production feature codes belong here.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists app_private;

revoke all on schema app_private from public;

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'youone_request') then
    create role youone_request nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'youone_privileged_writer') then
    create role youone_privileged_writer nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  end if;
end
$roles$;

do $role_guard$
declare
  role_count integer;
  unsafe_role_count integer;
begin
  select count(*) into role_count
  from pg_roles
  where rolname in ('youone_request', 'youone_privileged_writer');

  select count(*) into unsafe_role_count
  from pg_roles
  where rolname in ('youone_request', 'youone_privileged_writer')
    and (rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolcanlogin or rolreplication or rolbypassrls);

  if role_count <> 2 or unsafe_role_count <> 0 then
    raise exception 'unsafe or missing youone capability role attributes' using errcode = '42501';
  end if;
end
$role_guard$;

grant usage on schema app_private to youone_request, youone_privileged_writer;

create or replace function app_private.is_stable_code(value text)
returns boolean
language sql
immutable
strict
as $$
  select value ~ '^[A-Za-z][A-Za-z0-9._:-]{0,127}$'
$$;

create or replace function app_private.is_opaque_key(value text)
returns boolean
language sql
immutable
strict
as $$
  select value ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
$$;

create or replace function app_private.is_sha256(value text)
returns boolean
language sql
immutable
strict
as $$
  select value ~ '^[0-9a-f]{64}$'
$$;

create table public.aggregate_type_definition (
  aggregate_type text primary key check (app_private.is_stable_code(aggregate_type)),
  registered_at timestamptz not null default statement_timestamp()
);

create table public.action_definition (
  action_id text primary key check (app_private.is_stable_code(action_id)),
  registered_at timestamptz not null default statement_timestamp()
);

create table public.domain_event_definition (
  event_id text not null check (app_private.is_stable_code(event_id)),
  payload_schema_id text not null check (app_private.is_stable_code(payload_schema_id)),
  payload_schema_version bigint not null check (payload_schema_version > 0),
  registered_at timestamptz not null default statement_timestamp(),
  primary key (event_id, payload_schema_id, payload_schema_version)
);

create table public.state_machine_definition (
  machine_id text primary key check (app_private.is_stable_code(machine_id)),
  aggregate_type text not null references public.aggregate_type_definition(aggregate_type),
  registered_at timestamptz not null default statement_timestamp()
);

create table public.state_definition (
  machine_id text not null references public.state_machine_definition(machine_id),
  state_id text not null check (app_private.is_stable_code(state_id)),
  is_terminal boolean not null default false,
  registered_at timestamptz not null default statement_timestamp(),
  primary key (machine_id, state_id)
);

create table public.transition_definition (
  machine_id text not null references public.state_machine_definition(machine_id),
  event_id text not null check (app_private.is_stable_code(event_id)),
  from_state text,
  to_state text not null,
  registered_at timestamptz not null default statement_timestamp(),
  foreign key (machine_id, from_state) references public.state_definition(machine_id, state_id),
  foreign key (machine_id, to_state) references public.state_definition(machine_id, state_id),
  unique nulls not distinct (machine_id, event_id, from_state, to_state)
);

comment on table public.aggregate_type_definition is
  'Empty M02 registry. Owning feature migrations register aggregate types.';
comment on table public.action_definition is
  'Empty M02 registry. Owning feature migrations register audit action IDs.';
comment on table public.domain_event_definition is
  'Empty M02 registry. Outbox payloads are internal references, never display-ready notifications.';

create table public.audit_log (
  id uuid primary key,
  actor_kind text not null check (actor_kind in ('ANONYMOUS', 'SYSTEM', 'USER')),
  actor_user_id uuid,
  effective_actor_user_id uuid,
  anonymous_subject_fingerprint text check (
    anonymous_subject_fingerprint is null or app_private.is_sha256(anonymous_subject_fingerprint)
  ),
  system_actor_id text check (system_actor_id is null or app_private.is_stable_code(system_actor_id)),
  action_id text not null references public.action_definition(action_id),
  resource_type text not null references public.aggregate_type_definition(aggregate_type),
  resource_id uuid,
  resource_version bigint check (resource_version is null or resource_version >= 0),
  result text not null check (result in ('DENIED', 'FAILED', 'SUCCEEDED')),
  reason_code text check (reason_code is null or app_private.is_stable_code(reason_code)),
  reason_record_ref uuid,
  before_hash text check (before_hash is null or app_private.is_sha256(before_hash)),
  after_hash text check (after_hash is null or app_private.is_sha256(after_hash)),
  correlation_id text not null check (app_private.is_opaque_key(correlation_id)),
  causation_id text check (causation_id is null or app_private.is_opaque_key(causation_id)),
  request_ip inet,
  device_context_hash text check (device_context_hash is null or app_private.is_sha256(device_context_hash)),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default statement_timestamp(),
  constraint audit_actor_shape check (
    (actor_kind = 'USER'
      and actor_user_id is not null
      and effective_actor_user_id is not null
      and anonymous_subject_fingerprint is null
      and system_actor_id is null)
    or
    (actor_kind = 'ANONYMOUS'
      and actor_user_id is null
      and effective_actor_user_id is null
      and anonymous_subject_fingerprint is not null
      and system_actor_id is null)
    or
    (actor_kind = 'SYSTEM'
      and anonymous_subject_fingerprint is null
      and system_actor_id is not null)
  ),
  constraint audit_evidence_reference check (
    reason_code is not null
    or reason_record_ref is not null
    or before_hash is not null
    or after_hash is not null
  )
);

create index audit_log_resource_idx
  on public.audit_log(resource_type, resource_id, resource_version);
create index audit_log_correlation_idx on public.audit_log(correlation_id, occurred_at);

create table public.state_transition_history (
  id uuid primary key,
  audit_log_id uuid not null references public.audit_log(id),
  actor_kind text not null check (actor_kind in ('ANONYMOUS', 'SYSTEM', 'USER')),
  actor_user_id uuid,
  effective_actor_user_id uuid,
  anonymous_subject_fingerprint text check (
    anonymous_subject_fingerprint is null or app_private.is_sha256(anonymous_subject_fingerprint)
  ),
  system_actor_id text check (system_actor_id is null or app_private.is_stable_code(system_actor_id)),
  aggregate_type text not null references public.aggregate_type_definition(aggregate_type),
  aggregate_id uuid not null,
  machine_id text not null references public.state_machine_definition(machine_id),
  event_id text not null check (app_private.is_stable_code(event_id)),
  from_state text,
  to_state text not null,
  from_version bigint not null check (from_version >= 0),
  to_version bigint not null check (to_version = from_version + 1),
  reason_code text check (reason_code is null or app_private.is_stable_code(reason_code)),
  reason_record_ref uuid,
  correlation_id text not null check (app_private.is_opaque_key(correlation_id)),
  causation_id text check (causation_id is null or app_private.is_opaque_key(causation_id)),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default statement_timestamp(),
  foreign key (machine_id, from_state) references public.state_definition(machine_id, state_id),
  foreign key (machine_id, to_state) references public.state_definition(machine_id, state_id),
  foreign key (machine_id, event_id, from_state, to_state)
    references public.transition_definition(machine_id, event_id, from_state, to_state),
  unique (aggregate_type, aggregate_id, to_version),
  constraint transition_actor_shape check (
    (actor_kind = 'USER'
      and actor_user_id is not null
      and effective_actor_user_id is not null
      and anonymous_subject_fingerprint is null
      and system_actor_id is null)
    or
    (actor_kind = 'ANONYMOUS'
      and actor_user_id is null
      and effective_actor_user_id is null
      and anonymous_subject_fingerprint is not null
      and system_actor_id is null)
    or
    (actor_kind = 'SYSTEM'
      and anonymous_subject_fingerprint is null
      and system_actor_id is not null)
  )
);

create index state_transition_audit_idx on public.state_transition_history(audit_log_id);

create or replace function app_private.payload_contains_forbidden_key(payload jsonb)
returns boolean
language plpgsql
immutable
strict
as $$
declare
  item record;
  child jsonb;
begin
  if jsonb_typeof(payload) = 'object' then
    for item in select key, value from jsonb_each(payload)
    loop
      if item.key ~* '(access.?token|refresh.?token|token|password|secret|authorization|auth.?header|cookie|credential|private.?key|signed.?url|raw.?content|source.?content|file.?bytes|request.?body|editor.?json|stack|sql)' then
        return true;
      end if;
      if jsonb_typeof(item.value) in ('array', 'object')
        and app_private.payload_contains_forbidden_key(item.value) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(payload) = 'array' then
    for child in select value from jsonb_array_elements(payload)
    loop
      if jsonb_typeof(child) in ('array', 'object')
        and app_private.payload_contains_forbidden_key(child) then
        return true;
      end if;
    end loop;
  end if;
  return false;
end
$$;

create table public.outbox_event (
  id uuid primary key,
  initiating_audit_log_id uuid not null references public.audit_log(id),
  actor_kind text not null check (actor_kind in ('ANONYMOUS', 'SYSTEM', 'USER')),
  actor_user_id uuid,
  effective_actor_user_id uuid,
  anonymous_subject_fingerprint text check (
    anonymous_subject_fingerprint is null or app_private.is_sha256(anonymous_subject_fingerprint)
  ),
  system_actor_id text check (system_actor_id is null or app_private.is_stable_code(system_actor_id)),
  event_type text not null,
  aggregate_type text not null references public.aggregate_type_definition(aggregate_type),
  aggregate_id uuid not null,
  resource_version bigint not null check (resource_version >= 0),
  correlation_id text not null check (app_private.is_opaque_key(correlation_id)),
  causation_id text check (causation_id is null or app_private.is_opaque_key(causation_id)),
  payload_schema_id text not null check (app_private.is_stable_code(payload_schema_id)),
  payload_schema_version bigint not null check (payload_schema_version > 0),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and octet_length(payload::text) <= 32768
    and not app_private.payload_contains_forbidden_key(payload)
  ),
  idempotency_key text not null unique check (app_private.is_opaque_key(idempotency_key)),
  occurred_at timestamptz not null,
  available_at timestamptz not null,
  recorded_at timestamptz not null default statement_timestamp(),
  foreign key (event_type, payload_schema_id, payload_schema_version)
    references public.domain_event_definition(event_id, payload_schema_id, payload_schema_version),
  constraint outbox_actor_shape check (
    (actor_kind = 'USER'
      and actor_user_id is not null
      and effective_actor_user_id is not null
      and anonymous_subject_fingerprint is null
      and system_actor_id is null)
    or
    (actor_kind = 'ANONYMOUS'
      and actor_user_id is null
      and effective_actor_user_id is null
      and anonymous_subject_fingerprint is not null
      and system_actor_id is null)
    or
    (actor_kind = 'SYSTEM'
      and anonymous_subject_fingerprint is null
      and system_actor_id is not null)
  )
);

create index outbox_event_available_idx on public.outbox_event(available_at, id);

create table public.outbox_delivery (
  event_id uuid primary key references public.outbox_event(id),
  delivery_state text not null default 'AVAILABLE'
    check (delivery_state in ('AVAILABLE', 'DEAD_LETTER', 'DELIVERED', 'LEASED', 'RETRY_WAIT')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_owner text check (lease_owner is null or app_private.is_opaque_key(lease_owner)),
  lease_until timestamptz,
  next_attempt_at timestamptz,
  last_error_code text check (last_error_code is null or app_private.is_stable_code(last_error_code)),
  delivered_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint outbox_delivery_shape check (
    (delivery_state = 'LEASED' and lease_owner is not null and lease_until is not null)
    or (delivery_state <> 'LEASED' and lease_owner is null and lease_until is null)
  )
);

create index outbox_delivery_claim_idx
  on public.outbox_delivery(delivery_state, next_attempt_at, lease_until);

create table public.outbox_consumer_ledger (
  consumer_id text not null check (app_private.is_stable_code(consumer_id)),
  event_id uuid not null references public.outbox_event(id),
  processed_at timestamptz not null default statement_timestamp(),
  result_reference uuid,
  primary key (consumer_id, event_id)
);

create table public.idempotency_key_record (
  id uuid primary key default extensions.gen_random_uuid(),
  scope_id text not null check (app_private.is_stable_code(scope_id)),
  idempotency_key text not null check (app_private.is_opaque_key(idempotency_key)),
  request_hash text not null check (app_private.is_sha256(request_hash)),
  correlation_id text not null check (app_private.is_opaque_key(correlation_id)),
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  unique (scope_id, idempotency_key),
  check (expires_at > created_at)
);

create table public.idempotency_result (
  idempotency_record_id uuid primary key references public.idempotency_key_record(id),
  state text not null default 'IN_PROGRESS' check (state in ('COMPLETED', 'IN_PROGRESS')),
  result_reference uuid,
  completed_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint idempotency_result_shape check (
    (state = 'IN_PROGRESS' and completed_at is null)
    or (state = 'COMPLETED' and completed_at is not null)
  )
);

create or replace function app_private.reject_immutable_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '55000';
end
$$;

create trigger audit_log_append_only
before update or delete on public.audit_log
for each row execute function app_private.reject_immutable_change();

create trigger state_transition_append_only
before update or delete on public.state_transition_history
for each row execute function app_private.reject_immutable_change();

create trigger outbox_event_immutable
before update or delete on public.outbox_event
for each row execute function app_private.reject_immutable_change();

create trigger outbox_consumer_ledger_append_only
before update or delete on public.outbox_consumer_ledger
for each row execute function app_private.reject_immutable_change();

create trigger idempotency_key_record_immutable
before update or delete on public.idempotency_key_record
for each row execute function app_private.reject_immutable_change();

create trigger aggregate_type_definition_immutable
before update or delete on public.aggregate_type_definition
for each row execute function app_private.reject_immutable_change();

create trigger action_definition_immutable
before update or delete on public.action_definition
for each row execute function app_private.reject_immutable_change();

create trigger domain_event_definition_immutable
before update or delete on public.domain_event_definition
for each row execute function app_private.reject_immutable_change();

create trigger state_machine_definition_immutable
before update or delete on public.state_machine_definition
for each row execute function app_private.reject_immutable_change();

create trigger state_definition_immutable
before update or delete on public.state_definition
for each row execute function app_private.reject_immutable_change();

create trigger transition_definition_immutable
before update or delete on public.transition_definition
for each row execute function app_private.reject_immutable_change();

create or replace function app_private.required_setting(setting_name text)
returns text
language plpgsql
stable
security invoker
set search_path = pg_catalog
as $$
declare
  value text;
begin
  value := nullif(current_setting(setting_name, true), '');
  if value is null then
    raise exception 'required transaction context is missing' using errcode = '28000';
  end if;
  return value;
end
$$;

create or replace function app_private.optional_setting(setting_name text)
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select nullif(current_setting(setting_name, true), '')
$$;

create or replace function app_private.next_version(current_version bigint, expected_version bigint)
returns bigint
language plpgsql
immutable
strict
as $$
begin
  if current_version <> expected_version then
    raise exception 'stale aggregate version' using errcode = '40001';
  end if;
  if current_version < 0 or current_version = 9223372036854775807 then
    raise exception 'invalid aggregate version' using errcode = '22003';
  end if;
  return current_version + 1;
end
$$;

create or replace function app_private.append_audit(
  entry_id uuid,
  entry_action_id text,
  entry_resource_type text,
  entry_resource_id uuid,
  entry_resource_version bigint,
  entry_result text,
  entry_reason_code text,
  entry_reason_record_ref uuid,
  entry_before_hash text,
  entry_after_hash text,
  entry_request_ip inet,
  entry_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  actor_kind_value text := app_private.required_setting('app.actor_kind');
begin
  insert into public.audit_log (
    id, actor_kind, actor_user_id, effective_actor_user_id,
    anonymous_subject_fingerprint, system_actor_id,
    action_id, resource_type, resource_id, resource_version, result,
    reason_code, reason_record_ref, before_hash, after_hash,
    correlation_id, causation_id, request_ip, occurred_at
  ) values (
    entry_id,
    actor_kind_value,
    app_private.optional_setting('app.actor_user_id')::uuid,
    app_private.optional_setting('app.effective_actor_user_id')::uuid,
    app_private.optional_setting('app.anonymous_subject_fingerprint'),
    app_private.optional_setting('app.system_actor_id'),
    entry_action_id, entry_resource_type, entry_resource_id, entry_resource_version, entry_result,
    entry_reason_code, entry_reason_record_ref, entry_before_hash, entry_after_hash,
    app_private.required_setting('app.correlation_id'),
    app_private.optional_setting('app.causation_id'),
    entry_request_ip, entry_occurred_at
  );
end
$$;

create or replace function app_private.append_state_transition(
  entry_id uuid,
  entry_audit_id uuid,
  entry_aggregate_type text,
  entry_aggregate_id uuid,
  entry_machine_id text,
  entry_event_id text,
  entry_from_state text,
  entry_to_state text,
  entry_from_version bigint,
  entry_to_version bigint,
  entry_reason_code text,
  entry_reason_record_ref uuid,
  entry_correlation_id text,
  entry_causation_id text,
  entry_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if entry_correlation_id <> app_private.required_setting('app.correlation_id')
    or entry_causation_id is distinct from app_private.optional_setting('app.causation_id') then
    raise exception 'transition envelope does not match transaction context' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.audit_log audit
    where audit.id = entry_audit_id
      and audit.resource_type = entry_aggregate_type
      and audit.resource_id = entry_aggregate_id
      and audit.resource_version = entry_to_version
      and audit.correlation_id = app_private.required_setting('app.correlation_id')
      and audit.causation_id is not distinct from app_private.optional_setting('app.causation_id')
      and audit.actor_kind = app_private.required_setting('app.actor_kind')
      and audit.actor_user_id is not distinct from app_private.optional_setting('app.actor_user_id')::uuid
      and audit.effective_actor_user_id is not distinct from app_private.optional_setting('app.effective_actor_user_id')::uuid
      and audit.anonymous_subject_fingerprint is not distinct from app_private.optional_setting('app.anonymous_subject_fingerprint')
      and audit.system_actor_id is not distinct from app_private.optional_setting('app.system_actor_id')
  ) then
    raise exception 'transition audit envelope does not match aggregate/version/context'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.state_machine_definition machine
    where machine.machine_id = entry_machine_id
      and machine.aggregate_type = entry_aggregate_type
  ) then
    raise exception 'state machine aggregate type does not match transition aggregate'
      using errcode = '23514';
  end if;

  insert into public.state_transition_history (
    id, audit_log_id, actor_kind, actor_user_id, effective_actor_user_id,
    anonymous_subject_fingerprint, system_actor_id,
    aggregate_type, aggregate_id, machine_id, event_id,
    from_state, to_state, from_version, to_version,
    reason_code, reason_record_ref, correlation_id, causation_id, occurred_at
  ) values (
    entry_id, entry_audit_id,
    app_private.required_setting('app.actor_kind'),
    app_private.optional_setting('app.actor_user_id')::uuid,
    app_private.optional_setting('app.effective_actor_user_id')::uuid,
    app_private.optional_setting('app.anonymous_subject_fingerprint'),
    app_private.optional_setting('app.system_actor_id'),
    entry_aggregate_type, entry_aggregate_id,
    entry_machine_id, entry_event_id, entry_from_state, entry_to_state,
    entry_from_version, entry_to_version,
    entry_reason_code, entry_reason_record_ref,
    entry_correlation_id, entry_causation_id, entry_occurred_at
  );
end
$$;

create or replace function app_private.enqueue_outbox(
  entry_id uuid,
  entry_initiating_audit_id uuid,
  entry_event_type text,
  entry_aggregate_type text,
  entry_aggregate_id uuid,
  entry_resource_version bigint,
  entry_correlation_id text,
  entry_causation_id text,
  entry_payload_schema_id text,
  entry_payload_schema_version bigint,
  entry_payload jsonb,
  entry_idempotency_key text,
  entry_occurred_at timestamptz,
  entry_available_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if entry_correlation_id <> app_private.required_setting('app.correlation_id')
    or entry_causation_id is distinct from app_private.optional_setting('app.causation_id') then
    raise exception 'outbox envelope does not match transaction context' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.audit_log audit
    where audit.id = entry_initiating_audit_id
      and audit.resource_type = entry_aggregate_type
      and audit.resource_id = entry_aggregate_id
      and audit.resource_version = entry_resource_version
      and audit.correlation_id = entry_correlation_id
      and audit.causation_id is not distinct from entry_causation_id
      and audit.actor_kind = app_private.required_setting('app.actor_kind')
      and audit.actor_user_id is not distinct from app_private.optional_setting('app.actor_user_id')::uuid
      and audit.effective_actor_user_id is not distinct from app_private.optional_setting('app.effective_actor_user_id')::uuid
      and audit.anonymous_subject_fingerprint is not distinct from app_private.optional_setting('app.anonymous_subject_fingerprint')
      and audit.system_actor_id is not distinct from app_private.optional_setting('app.system_actor_id')
  ) then
    raise exception 'outbox initiating audit does not match aggregate/version/context'
      using errcode = '23514';
  end if;

  insert into public.outbox_event (
    id, initiating_audit_log_id, actor_kind, actor_user_id, effective_actor_user_id,
    anonymous_subject_fingerprint, system_actor_id,
    event_type, aggregate_type, aggregate_id, resource_version,
    correlation_id, causation_id, payload_schema_id, payload_schema_version,
    payload, idempotency_key, occurred_at, available_at
  ) values (
    entry_id, entry_initiating_audit_id,
    app_private.required_setting('app.actor_kind'),
    app_private.optional_setting('app.actor_user_id')::uuid,
    app_private.optional_setting('app.effective_actor_user_id')::uuid,
    app_private.optional_setting('app.anonymous_subject_fingerprint'),
    app_private.optional_setting('app.system_actor_id'),
    entry_event_type, entry_aggregate_type, entry_aggregate_id,
    entry_resource_version, entry_correlation_id, entry_causation_id,
    entry_payload_schema_id, entry_payload_schema_version,
    entry_payload, entry_idempotency_key, entry_occurred_at, entry_available_at
  );

  insert into public.outbox_delivery(event_id) values (entry_id);
end
$$;

create or replace function app_private.claim_outbox(
  worker_id text,
  lease_seconds integer,
  batch_size integer
)
returns table (
  event_id uuid,
  initiating_audit_log_id uuid,
  actor_kind text,
  actor_user_id uuid,
  effective_actor_user_id uuid,
  anonymous_subject_fingerprint text,
  system_actor_id text,
  event_type text,
  aggregate_type text,
  aggregate_id uuid,
  resource_version bigint,
  correlation_id text,
  causation_id text,
  payload_schema_id text,
  payload_schema_version bigint,
  payload jsonb,
  attempt_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.is_opaque_key(worker_id)
    or lease_seconds < 1 or lease_seconds > 3600
    or batch_size < 1 or batch_size > 100 then
    raise exception 'invalid outbox claim parameters' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select delivery.event_id
    from public.outbox_delivery delivery
    join public.outbox_event event on event.id = delivery.event_id
    where event.available_at <= statement_timestamp()
      and (
        delivery.delivery_state = 'AVAILABLE'
        or (delivery.delivery_state = 'RETRY_WAIT' and delivery.next_attempt_at <= statement_timestamp())
        or (delivery.delivery_state = 'LEASED' and delivery.lease_until <= statement_timestamp())
      )
    order by event.available_at, event.id
    for update of delivery skip locked
    limit batch_size
  ), claimed as (
    update public.outbox_delivery delivery
    set delivery_state = 'LEASED',
        attempt_count = delivery.attempt_count + 1,
        lease_owner = worker_id,
        lease_until = statement_timestamp() + make_interval(secs => lease_seconds),
        next_attempt_at = null,
        last_error_code = null,
        updated_at = statement_timestamp()
    from candidates
    where delivery.event_id = candidates.event_id
    returning delivery.event_id, delivery.attempt_count
  )
  select event.id, event.initiating_audit_log_id,
         event.actor_kind, event.actor_user_id, event.effective_actor_user_id,
         event.anonymous_subject_fingerprint, event.system_actor_id,
         event.event_type, event.aggregate_type, event.aggregate_id,
         event.resource_version, event.correlation_id, event.causation_id,
         event.payload_schema_id, event.payload_schema_version, event.payload,
         claimed.attempt_count
  from claimed
  join public.outbox_event event on event.id = claimed.event_id;
end
$$;

create or replace function app_private.mark_outbox_delivered(
  target_event_id uuid,
  worker_id text,
  delivered_time timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.outbox_delivery
  set delivery_state = 'DELIVERED', lease_owner = null, lease_until = null,
      delivered_at = delivered_time, updated_at = statement_timestamp()
  where event_id = target_event_id
    and delivery_state = 'LEASED'
    and lease_owner = worker_id;
  if not found then
    raise exception 'outbox lease not held' using errcode = '55000';
  end if;
end
$$;

create or replace function app_private.mark_outbox_retry(
  target_event_id uuid,
  worker_id text,
  error_code text,
  retry_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.is_stable_code(error_code) or retry_at <= statement_timestamp() then
    raise exception 'invalid retry envelope' using errcode = '22023';
  end if;
  update public.outbox_delivery
  set delivery_state = 'RETRY_WAIT', lease_owner = null, lease_until = null,
      next_attempt_at = retry_at, last_error_code = error_code,
      updated_at = statement_timestamp()
  where event_id = target_event_id
    and delivery_state = 'LEASED'
    and lease_owner = worker_id;
  if not found then
    raise exception 'outbox lease not held' using errcode = '55000';
  end if;
end
$$;

create or replace function app_private.mark_outbox_dead_letter(
  target_event_id uuid,
  worker_id text,
  error_code text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.is_stable_code(error_code) then
    raise exception 'invalid dead-letter error code' using errcode = '22023';
  end if;
  update public.outbox_delivery
  set delivery_state = 'DEAD_LETTER', lease_owner = null, lease_until = null,
      next_attempt_at = null, last_error_code = error_code,
      updated_at = statement_timestamp()
  where event_id = target_event_id
    and delivery_state = 'LEASED'
    and lease_owner = worker_id;
  if not found then
    raise exception 'outbox lease not held' using errcode = '55000';
  end if;
end
$$;

create or replace function app_private.record_consumer_result(
  consumer_id text,
  target_event_id uuid,
  result_reference uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.is_stable_code(consumer_id) then
    raise exception 'invalid consumer ID' using errcode = '22023';
  end if;
  insert into public.outbox_consumer_ledger(consumer_id, event_id, result_reference)
  values (consumer_id, target_event_id, result_reference)
  on conflict do nothing;
  return found;
end
$$;

create or replace function app_private.register_idempotency_key(
  entry_scope_id text,
  entry_key_value text,
  entry_request_hash text,
  entry_expiry timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private, extensions
as $$
declare
  record_id uuid;
begin
  if not app_private.is_stable_code(entry_scope_id)
    or not app_private.is_opaque_key(entry_key_value)
    or not app_private.is_sha256(entry_request_hash) then
    raise exception 'invalid idempotency envelope' using errcode = '22023';
  end if;

  insert into public.idempotency_key_record(
    scope_id, idempotency_key, request_hash, correlation_id, expires_at
  ) values (
    entry_scope_id, entry_key_value, entry_request_hash,
    app_private.required_setting('app.correlation_id'), entry_expiry
  )
  returning id into record_id;

  insert into public.idempotency_result(idempotency_record_id) values (record_id);
  return record_id;
exception
  when unique_violation then
    select id into record_id
    from public.idempotency_key_record
    where idempotency_key_record.scope_id = entry_scope_id
      and idempotency_key_record.idempotency_key = entry_key_value
      and idempotency_key_record.request_hash = entry_request_hash;
    if record_id is null then
      raise exception 'idempotency key reused with different request' using errcode = '23505';
    end if;
    return record_id;
end
$$;

create or replace function app_private.complete_idempotency_key(
  entry_record_id uuid,
  entry_result_reference uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.idempotency_result
  set state = 'COMPLETED', result_reference = entry_result_reference,
      completed_at = statement_timestamp(), updated_at = statement_timestamp()
  where idempotency_record_id = entry_record_id and state = 'IN_PROGRESS';
  if not found then
    raise exception 'idempotency record is not in progress' using errcode = '55000';
  end if;
end
$$;

alter table public.aggregate_type_definition enable row level security;
alter table public.action_definition enable row level security;
alter table public.domain_event_definition enable row level security;
alter table public.state_machine_definition enable row level security;
alter table public.state_definition enable row level security;
alter table public.transition_definition enable row level security;
alter table public.audit_log enable row level security;
alter table public.state_transition_history enable row level security;
alter table public.outbox_event enable row level security;
alter table public.outbox_delivery enable row level security;
alter table public.outbox_consumer_ledger enable row level security;
alter table public.idempotency_key_record enable row level security;
alter table public.idempotency_result enable row level security;

alter table public.audit_log force row level security;
alter table public.state_transition_history force row level security;
alter table public.outbox_event force row level security;
alter table public.outbox_delivery force row level security;
alter table public.outbox_consumer_ledger force row level security;
alter table public.idempotency_key_record force row level security;
alter table public.idempotency_result force row level security;

revoke all on all tables in schema public from youone_request, youone_privileged_writer;
revoke all on all functions in schema app_private from public;

grant execute on function app_private.next_version(bigint, bigint) to youone_request, youone_privileged_writer;
grant execute on function app_private.append_audit(uuid, text, text, uuid, bigint, text, text, uuid, text, text, inet, timestamptz) to youone_request, youone_privileged_writer;
grant execute on function app_private.append_state_transition(uuid, uuid, text, uuid, text, text, text, text, bigint, bigint, text, uuid, text, text, timestamptz) to youone_request, youone_privileged_writer;
grant execute on function app_private.enqueue_outbox(uuid, uuid, text, text, uuid, bigint, text, text, text, bigint, jsonb, text, timestamptz, timestamptz) to youone_request, youone_privileged_writer;
grant execute on function app_private.register_idempotency_key(text, text, text, timestamptz) to youone_request, youone_privileged_writer;
grant execute on function app_private.complete_idempotency_key(uuid, uuid) to youone_request, youone_privileged_writer;
grant execute on function app_private.claim_outbox(text, integer, integer) to youone_privileged_writer;
grant execute on function app_private.mark_outbox_delivered(uuid, text, timestamptz) to youone_privileged_writer;
grant execute on function app_private.mark_outbox_retry(uuid, text, text, timestamptz) to youone_privileged_writer;
grant execute on function app_private.mark_outbox_dead_letter(uuid, text, text) to youone_privileged_writer;
grant execute on function app_private.record_consumer_result(text, uuid, uuid) to youone_privileged_writer;

comment on schema app_private is
  'Trusted server functions. Membership in a capability role never replaces application authorization.';
comment on table public.audit_log is
  'Append-only audit envelope. Sensitive source content and request bodies are prohibited.';
comment on table public.state_transition_history is
  'Append-only typed transition history, unique per aggregate target version.';
comment on table public.outbox_event is
  'Immutable event envelope. Consumers must re-authorize and re-query display data.';
comment on table public.outbox_delivery is
  'Mutable worker delivery state kept separate from immutable event/body/idempotency data.';
