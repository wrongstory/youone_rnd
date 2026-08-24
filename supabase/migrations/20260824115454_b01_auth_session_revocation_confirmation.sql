-- B01 exact Supabase session revocation confirmation and durable reconciliation handoff.
-- No provider token, refresh token, cookie, password, or raw provider response is persisted.
-- Plain PostgreSQL CI does not define Supabase Data API roles. PUBLIC and internal
-- capability revokes are unconditional; anon/authenticated revokes are conditional
-- while remaining exact on hosted Supabase where those roles exist.

revoke execute on all functions in schema app_private from public;
alter default privileges for role postgres in schema app_private
  revoke execute on functions from public;

do $data_api_role_lockdown$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema app_private from anon';
    execute 'alter default privileges for role postgres in schema app_private revoke execute on functions from anon';
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on all functions in schema app_private from authenticated';
    execute 'alter default privileges for role postgres in schema app_private revoke execute on functions from authenticated';
  end if;
end
$data_api_role_lockdown$;

insert into public.aggregate_type_definition(aggregate_type)
values ('AUTH_SESSION_REVOCATION')
on conflict do nothing;

insert into public.action_definition(action_id)
values
  ('auth.session.global_sign_out.confirmed'),
  ('auth.session.global_sign_out.reconcile')
on conflict do nothing;

insert into public.domain_event_definition(event_id,payload_schema_id,payload_schema_version)
values (
  'AUTH_SESSION_REVOCATION_RECONCILIATION_REQUESTED',
  'AUTH_SESSION_REVOCATION_RECONCILIATION_V1',
  1
)
on conflict do nothing;

create or replace function app_private.auth_session_exists(
  verified_auth_subject text,
  verified_session_id text
) returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  session_exists boolean := false;
begin
  if verified_auth_subject is null or verified_auth_subject = ''
    or verified_session_id is null or verified_session_id = '' then
    return false;
  end if;

  if pg_catalog.to_regclass('auth.sessions') is null then
    raise exception 'Supabase Auth session capability unavailable' using errcode = '55000';
  end if;

  begin
    execute 'select exists (
      select 1 from auth.sessions
      where id = $1::uuid and user_id = $2::uuid
    )'
      into session_exists
      using verified_session_id, verified_auth_subject;
  exception
    when invalid_text_representation then
      return false;
    when undefined_column or undefined_table then
      raise exception 'Supabase Auth session capability incompatible' using errcode = '55000';
  end;

  return session_exists;
end
$$;

revoke all on function app_private.auth_session_exists(text,text)
  from public, youone_request, youone_privileged_writer;
do $auth_session_exists_data_api_revoke$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function app_private.auth_session_exists(text,text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function app_private.auth_session_exists(text,text) from authenticated';
  end if;
end
$auth_session_exists_data_api_revoke$;
grant execute on function app_private.auth_session_exists(text,text)
  to youone_identity_resolver;

comment on function app_private.auth_session_exists(text,text) is
  'B01 resolver-only exact subject/session presence probe used after global sign-out; returns no identity snapshot.';

create or replace function app_private.enforce_auth_session_revocation_reconciliation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  payload_subject text;
  payload_session text;
begin
  if new.event_type <> 'AUTH_SESSION_REVOCATION_RECONCILIATION_REQUESTED' then
    return new;
  end if;

  if new.aggregate_type <> 'AUTH_SESSION_REVOCATION'
    or new.payload_schema_id <> 'AUTH_SESSION_REVOCATION_RECONCILIATION_V1'
    or new.payload_schema_version <> 1
    or new.resource_version <> 0
    or new.actor_kind <> 'USER'
    or new.actor_user_id is null
    or pg_catalog.jsonb_typeof(new.payload) <> 'object'
    or pg_catalog.jsonb_object_length(new.payload) <> 4
    or new.payload->>'retryAttempts' <> '3'
    or new.payload->>'reconciliationIntervalMinutes' <> '15'
    or new.available_at <> new.occurred_at + interval '15 minutes' then
    raise exception 'invalid auth session reconciliation envelope' using errcode = '23514';
  end if;

  payload_subject := new.payload->>'authSubjectId';
  payload_session := new.payload->>'providerSessionId';

  begin
    perform payload_subject::uuid, payload_session::uuid;
  exception when invalid_text_representation then
    raise exception 'invalid auth session reconciliation binding' using errcode = '23514';
  end;

  if payload_session is distinct from app_private.required_setting('app.session_id')
    or not exists (
      select 1
      from public.user_account account
      where account.id = new.actor_user_id
        and account.auth_subject = payload_subject
    ) then
    raise exception 'auth session reconciliation actor binding mismatch' using errcode = '42501';
  end if;

  return new;
end
$$;

revoke all on function app_private.enforce_auth_session_revocation_reconciliation()
  from public, youone_request, youone_privileged_writer, youone_identity_resolver;
do $reconciliation_data_api_revoke$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function app_private.enforce_auth_session_revocation_reconciliation() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function app_private.enforce_auth_session_revocation_reconciliation() from authenticated';
  end if;
end
$reconciliation_data_api_revoke$;

create trigger auth_session_revocation_reconciliation_binding
before insert on public.outbox_event
for each row execute function app_private.enforce_auth_session_revocation_reconciliation();
