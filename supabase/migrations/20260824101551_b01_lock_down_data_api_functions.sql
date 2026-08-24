-- B01 hosted Supabase Data API function lockdown.
-- Managed projects can grant EXECUTE on newly-created public functions directly to
-- anon/authenticated through default privileges. PUBLIC-only revokes do not remove
-- those direct grants, so request-role RPCs must be explicitly closed again.

revoke execute on all functions in schema public from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

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
      has_function_privilege('anon', function_record.oid, 'execute')
      or has_function_privilege('authenticated', function_record.oid, 'execute')
    );

  if exposed_count <> 0 then
    raise exception 'public SECURITY DEFINER functions remain executable by Data API roles'
      using errcode = '42501';
  end if;
end
$security_contract$;
