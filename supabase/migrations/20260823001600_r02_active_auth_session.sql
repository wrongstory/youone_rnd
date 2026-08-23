-- R02: fail-closed Supabase session activity check for trusted identity bootstrap.

create or replace function app_private.resolve_active_actor_context_snapshot(
  verified_auth_subject text,
  verified_session_id text,
  requested_at timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  session_is_active boolean := false;
begin
  if verified_auth_subject is null or verified_auth_subject = ''
    or verified_session_id is null or verified_session_id = '' then
    return null;
  end if;

  if pg_catalog.to_regclass('auth.sessions') is null then
    raise exception 'Supabase Auth session capability unavailable' using errcode = '55000';
  end if;

  begin
    execute 'select exists (
      select 1 from auth.sessions
      where id = $1::uuid and user_id = $2::uuid
    )'
      into session_is_active
      using verified_session_id, verified_auth_subject;
  exception
    when invalid_text_representation then
      return null;
    when undefined_column or undefined_table then
      raise exception 'Supabase Auth session capability incompatible' using errcode = '55000';
  end;

  if not session_is_active then
    return null;
  end if;

  return app_private.resolve_actor_context_snapshot(verified_auth_subject, requested_at);
end
$$;

revoke all on function app_private.resolve_active_actor_context_snapshot(text, text, timestamptz)
  from public, youone_request, youone_privileged_writer;
revoke execute on function app_private.resolve_actor_context_snapshot(text, timestamptz)
  from youone_identity_resolver;
revoke execute on function app_private.resolve_user_account(text, timestamptz)
  from youone_identity_resolver;
grant execute on function app_private.resolve_active_actor_context_snapshot(text, text, timestamptz)
  to youone_identity_resolver;

comment on function app_private.resolve_active_actor_context_snapshot(text, text, timestamptz) is
  'R02 trusted identity bootstrap: requires exact verified subject/session match in auth.sessions; fails closed when provider session capability is absent or incompatible.';
