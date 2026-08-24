-- B01 hosted Supabase Data API function lockdown.
-- Managed projects can grant EXECUTE on newly-created public functions directly to
-- anon/authenticated through default privileges. PUBLIC-only revokes do not remove
-- those direct grants, so request-role RPCs must be explicitly closed again.
-- Plain PostgreSQL CI does not define Supabase Data API roles, so provider-role
-- revokes are applied only when those roles exist. Hosted Supabase still receives
-- the exact anon/authenticated lockdown below.

revoke execute on all functions in schema public from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

do $data_api_role_lockdown$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from anon';
    execute 'alter default privileges for role postgres in schema public revoke execute on functions from anon';
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on all functions in schema public from authenticated';
    execute 'alter default privileges for role postgres in schema public revoke execute on functions from authenticated';
  end if;
end
$data_api_role_lockdown$;

-- Supabase Advisor requires a fixed search_path even for small immutable helpers.
alter function app_private.is_stable_code(text) set search_path = pg_catalog;
alter function app_private.is_opaque_key(text) set search_path = pg_catalog;
alter function app_private.is_sha256(text) set search_path = pg_catalog;
alter function app_private.payload_contains_forbidden_key(jsonb) set search_path = pg_catalog;
alter function app_private.next_version(bigint,bigint) set search_path = pg_catalog;

do $security_contract$
declare
  exposed_count integer;
begin
  select count(*) into exposed_count
  from pg_proc function_record
  join pg_namespace function_schema on function_schema.oid = function_record.pronamespace
  where function_schema.nspname = 'public'
    and function_record.prosecdef
    and (
      (
        pg_catalog.to_regrole('anon') is not null
        and has_function_privilege(pg_catalog.to_regrole('anon'), function_record.oid, 'execute')
      )
      or (
        pg_catalog.to_regrole('authenticated') is not null
        and has_function_privilege(pg_catalog.to_regrole('authenticated'), function_record.oid, 'execute')
      )
    );

  if exposed_count <> 0 then
    raise exception 'public SECURITY DEFINER functions remain executable by Data API roles'
      using errcode = '42501';
  end if;
end
$security_contract$;
