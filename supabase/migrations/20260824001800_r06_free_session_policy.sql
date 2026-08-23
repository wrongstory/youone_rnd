-- R06: Free-tier application-side enforcement for the user-approved OD-019 session policy.
-- Supabase native time-box/inactivity/single-session controls are Pro-only; this migration
-- enforces equivalent fail-closed checks on every trusted identity bootstrap without mutating
-- provider-owned auth tables.

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
  session_is_eligible boolean := false;
begin
  if verified_auth_subject is null or verified_auth_subject = ''
    or verified_session_id is null or verified_session_id = ''
    or requested_at is null then
    return null;
  end if;

  if pg_catalog.to_regclass('auth.sessions') is null
    or pg_catalog.to_regclass('auth.mfa_factors') is null then
    raise exception 'Supabase Auth session capability unavailable' using errcode = '55000';
  end if;

  begin
    execute $session_policy$
      select exists (
        select 1
        from auth.sessions current_session
        join auth.mfa_factors factor
          on factor.id = current_session.factor_id
         and factor.user_id = current_session.user_id
        where current_session.id = $1::uuid
          and current_session.user_id = $2::uuid
          and current_session.created_at is not null
          and current_session.created_at <= $3
          and $3 < current_session.created_at + interval '480 minutes'
          and $3 < coalesce(
            current_session.refreshed_at at time zone 'UTC',
            current_session.created_at
          ) + interval '60 minutes'
          and (current_session.not_after is null or $3 < current_session.not_after)
          and current_session.aal::text = 'aal2'
          and factor.factor_type::text = 'totp'
          and factor.status::text = 'verified'
          and not exists (
            select 1
            from auth.sessions newer_session
            where newer_session.user_id = current_session.user_id
              and newer_session.created_at is not null
              and (
                newer_session.created_at > current_session.created_at
                or (
                  newer_session.created_at = current_session.created_at
                  and newer_session.id::text > current_session.id::text
                )
              )
          )
      )
    $session_policy$
      into session_is_eligible
      using verified_session_id, verified_auth_subject, requested_at;
  exception
    when invalid_text_representation then
      return null;
    when undefined_column or undefined_table then
      raise exception 'Supabase Auth session capability incompatible' using errcode = '55000';
  end;

  if not session_is_eligible then
    return null;
  end if;

  return app_private.resolve_actor_context_snapshot(verified_auth_subject, requested_at);
end
$$;

revoke all on function app_private.resolve_active_actor_context_snapshot(text, text, timestamptz)
  from public, youone_request, youone_privileged_writer;
grant execute on function app_private.resolve_active_actor_context_snapshot(text, text, timestamptz)
  to youone_identity_resolver;

comment on function app_private.resolve_active_actor_context_snapshot(text, text, timestamptz) is
  'R06 Free-tier OD-019 enforcement: exact subject/session, TOTP aal2, 480m absolute lifetime, 60m refresh inactivity, provider not_after, and newest-sign-in-only checks on every trusted identity bootstrap.';
