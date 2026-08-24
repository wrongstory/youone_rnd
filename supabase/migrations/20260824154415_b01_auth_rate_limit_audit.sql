-- B01 application-owned distributed Auth rate limiting and durable audit support.
-- Policy values are intentionally not seeded: OD-039 and an actual UserAccount
-- approval binding must exist before operational Auth mutations can pass.

insert into public.aggregate_type_definition(aggregate_type)
values ('AUTH_SECURITY_ATTEMPT')
on conflict do nothing;

insert into public.action_definition(action_id)
values
  ('auth.login.rate_limit.consume'), ('auth.login.result'),
  ('auth.logout.rate_limit.consume'), ('auth.logout.result'),
  ('auth.mfa.enroll.rate_limit.consume'), ('auth.mfa.enroll.result'),
  ('auth.mfa.verify.rate_limit.consume'), ('auth.mfa.verify.result'),
  ('auth.recovery.rate_limit.consume'), ('auth.recovery.result'),
  ('auth.refresh.rate_limit.consume'), ('auth.refresh.result')
on conflict do nothing;

create table public.auth_rate_limit_policy_version (
  id uuid primary key,
  policy_version text not null unique check (app_private.is_stable_code(policy_version)),
  approval_snapshot_sha256 text not null check (app_private.is_sha256(approval_snapshot_sha256)),
  created_at timestamptz not null,
  approved_at timestamptz not null,
  effective_at timestamptz not null,
  approved_by_user_id uuid not null references public.user_account(id),
  check (created_at <= approved_at and approved_at <= effective_at)
);

create table public.auth_rate_limit_policy_rule (
  policy_version_id uuid not null references public.auth_rate_limit_policy_version(id),
  action_id text not null check (action_id in (
    'auth.login', 'auth.logout', 'auth.mfa.enroll',
    'auth.mfa.verify', 'auth.recovery', 'auth.refresh'
  )),
  window_seconds integer not null check (window_seconds between 10 and 86400),
  subject_max_attempts integer not null check (subject_max_attempts between 1 and 1000000),
  global_max_attempts integer not null check (global_max_attempts between 1 and 1000000),
  primary key (policy_version_id, action_id)
);

create table public.auth_rate_limit_policy_revocation (
  id uuid primary key,
  policy_version_id uuid not null unique references public.auth_rate_limit_policy_version(id),
  revoked_at timestamptz not null,
  revoked_by_user_id uuid not null references public.user_account(id),
  reason_record_ref uuid not null
);

create table public.auth_rate_limit_bucket (
  scope_kind text not null check (scope_kind in ('GLOBAL', 'SUBJECT')),
  scope_fingerprint text not null check (app_private.is_sha256(scope_fingerprint)),
  action_id text not null check (action_id in (
    'auth.login', 'auth.logout', 'auth.mfa.enroll',
    'auth.mfa.verify', 'auth.recovery', 'auth.refresh'
  )),
  policy_version text not null check (app_private.is_stable_code(policy_version)),
  window_started_at timestamptz not null,
  window_ends_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0),
  updated_at timestamptz not null,
  primary key (scope_kind, scope_fingerprint, action_id),
  check (window_started_at < window_ends_at and updated_at >= window_started_at)
);

create index auth_rate_limit_bucket_expiry_idx
  on public.auth_rate_limit_bucket(window_ends_at);

create trigger auth_rate_limit_policy_version_immutable
before update or delete on public.auth_rate_limit_policy_version
for each row execute function app_private.reject_immutable_change();

create trigger auth_rate_limit_policy_rule_immutable
before update or delete on public.auth_rate_limit_policy_rule
for each row execute function app_private.reject_immutable_change();

create trigger auth_rate_limit_policy_revocation_immutable
before update or delete on public.auth_rate_limit_policy_revocation
for each row execute function app_private.reject_immutable_change();

create or replace function app_private.consume_auth_rate_limit(
  entry_subject_fingerprint text,
  entry_global_fingerprint text,
  entry_action_id text,
  entry_policy_version text,
  entry_occurred_at timestamptz
) returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  selected_policy_id uuid;
  selected_window_seconds integer;
  selected_subject_max integer;
  selected_global_max integer;
  subject_count integer;
  global_count integer;
  subject_window_end timestamptz;
  global_window_end timestamptz;
begin
  if app_private.required_setting('app.actor_kind') <> 'ANONYMOUS'
    or entry_subject_fingerprint is distinct from app_private.required_setting('app.anonymous_subject_fingerprint')
    or entry_subject_fingerprint is null
    or entry_global_fingerprint is null
    or not app_private.is_sha256(entry_subject_fingerprint)
    or not app_private.is_sha256(entry_global_fingerprint)
    or entry_occurred_at is distinct from app_private.request_time()
    or entry_action_id is null or entry_action_id not in (
      'auth.login', 'auth.logout', 'auth.mfa.enroll',
      'auth.mfa.verify', 'auth.recovery', 'auth.refresh'
    ) then
    raise exception 'trusted anonymous Auth attempt required' using errcode = '42501';
  end if;

  select policy.id, rule.window_seconds, rule.subject_max_attempts, rule.global_max_attempts
    into selected_policy_id, selected_window_seconds, selected_subject_max, selected_global_max
  from public.auth_rate_limit_policy_version policy
  join public.auth_rate_limit_policy_rule rule on rule.policy_version_id = policy.id
  where policy.policy_version = entry_policy_version
    and policy.effective_at <= entry_occurred_at
    and rule.action_id = entry_action_id
    and not exists (
      select 1 from public.auth_rate_limit_policy_revocation revocation
      where revocation.policy_version_id = policy.id
        and revocation.revoked_at <= entry_occurred_at
    )
    and policy.effective_at = (
      select max(candidate.effective_at)
      from public.auth_rate_limit_policy_version candidate
      where candidate.effective_at <= entry_occurred_at
        and not exists (
          select 1 from public.auth_rate_limit_policy_revocation candidate_revocation
          where candidate_revocation.policy_version_id = candidate.id
            and candidate_revocation.revoked_at <= entry_occurred_at
        )
    );

  if selected_policy_id is null or (
    select count(*) from public.auth_rate_limit_policy_rule
    where policy_version_id = selected_policy_id
  ) <> 6 then
    raise exception 'effective complete Auth rate-limit policy unavailable' using errcode = '55000';
  end if;

  with expired as (
    select ctid
    from public.auth_rate_limit_bucket
    where window_ends_at < entry_occurred_at - interval '1 day'
    order by window_ends_at
    limit 100
  )
  delete from public.auth_rate_limit_bucket bucket
  using expired
  where bucket.ctid = expired.ctid;

  insert into public.auth_rate_limit_bucket(
    scope_kind, scope_fingerprint, action_id, policy_version,
    window_started_at, window_ends_at, attempt_count, updated_at
  ) values (
    'GLOBAL', entry_global_fingerprint, entry_action_id, entry_policy_version,
    entry_occurred_at, entry_occurred_at + make_interval(secs => selected_window_seconds), 1, entry_occurred_at
  )
  on conflict (scope_kind, scope_fingerprint, action_id) do update
  set policy_version = excluded.policy_version,
      window_started_at = case
        when auth_rate_limit_bucket.window_ends_at <= excluded.window_started_at
          or auth_rate_limit_bucket.policy_version <> excluded.policy_version
        then excluded.window_started_at else auth_rate_limit_bucket.window_started_at end,
      window_ends_at = case
        when auth_rate_limit_bucket.window_ends_at <= excluded.window_started_at
          or auth_rate_limit_bucket.policy_version <> excluded.policy_version
        then excluded.window_ends_at else auth_rate_limit_bucket.window_ends_at end,
      attempt_count = case
        when auth_rate_limit_bucket.window_ends_at <= excluded.window_started_at
          or auth_rate_limit_bucket.policy_version <> excluded.policy_version
        then 1 else auth_rate_limit_bucket.attempt_count + 1 end,
      updated_at = excluded.updated_at
  returning attempt_count, window_ends_at into global_count, global_window_end;

  insert into public.auth_rate_limit_bucket(
    scope_kind, scope_fingerprint, action_id, policy_version,
    window_started_at, window_ends_at, attempt_count, updated_at
  ) values (
    'SUBJECT', entry_subject_fingerprint, entry_action_id, entry_policy_version,
    entry_occurred_at, entry_occurred_at + make_interval(secs => selected_window_seconds), 1, entry_occurred_at
  )
  on conflict (scope_kind, scope_fingerprint, action_id) do update
  set policy_version = excluded.policy_version,
      window_started_at = case
        when auth_rate_limit_bucket.window_ends_at <= excluded.window_started_at
          or auth_rate_limit_bucket.policy_version <> excluded.policy_version
        then excluded.window_started_at else auth_rate_limit_bucket.window_started_at end,
      window_ends_at = case
        when auth_rate_limit_bucket.window_ends_at <= excluded.window_started_at
          or auth_rate_limit_bucket.policy_version <> excluded.policy_version
        then excluded.window_ends_at else auth_rate_limit_bucket.window_ends_at end,
      attempt_count = case
        when auth_rate_limit_bucket.window_ends_at <= excluded.window_started_at
          or auth_rate_limit_bucket.policy_version <> excluded.policy_version
        then 1 else auth_rate_limit_bucket.attempt_count + 1 end,
      updated_at = excluded.updated_at
  returning attempt_count, window_ends_at into subject_count, subject_window_end;

  allowed := global_count <= selected_global_max and subject_count <= selected_subject_max;
  retry_after_seconds := case when allowed then 0 else greatest(
    case when global_count > selected_global_max
      then ceil(extract(epoch from global_window_end - entry_occurred_at))::integer else 0 end,
    case when subject_count > selected_subject_max
      then ceil(extract(epoch from subject_window_end - entry_occurred_at))::integer else 0 end
  ) end;
  return next;
end
$$;

alter table public.auth_rate_limit_policy_version enable row level security;
alter table public.auth_rate_limit_policy_rule enable row level security;
alter table public.auth_rate_limit_policy_revocation enable row level security;
alter table public.auth_rate_limit_bucket enable row level security;
alter table public.auth_rate_limit_policy_version force row level security;
alter table public.auth_rate_limit_policy_rule force row level security;
alter table public.auth_rate_limit_policy_revocation force row level security;
alter table public.auth_rate_limit_bucket force row level security;

revoke all on public.auth_rate_limit_policy_version from public, youone_request, youone_privileged_writer, youone_identity_resolver;
revoke all on public.auth_rate_limit_policy_rule from public, youone_request, youone_privileged_writer, youone_identity_resolver;
revoke all on public.auth_rate_limit_policy_revocation from public, youone_request, youone_privileged_writer, youone_identity_resolver;
revoke all on public.auth_rate_limit_bucket from public, youone_request, youone_privileged_writer, youone_identity_resolver;
revoke all on function app_private.consume_auth_rate_limit(text,text,text,text,timestamptz)
  from public, youone_privileged_writer, youone_identity_resolver;

do $auth_rate_limit_data_api_revoke$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.auth_rate_limit_policy_version from anon';
    execute 'revoke all on public.auth_rate_limit_policy_rule from anon';
    execute 'revoke all on public.auth_rate_limit_policy_revocation from anon';
    execute 'revoke all on public.auth_rate_limit_bucket from anon';
    execute 'revoke all on function app_private.consume_auth_rate_limit(text,text,text,text,timestamptz) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.auth_rate_limit_policy_version from authenticated';
    execute 'revoke all on public.auth_rate_limit_policy_rule from authenticated';
    execute 'revoke all on public.auth_rate_limit_policy_revocation from authenticated';
    execute 'revoke all on public.auth_rate_limit_bucket from authenticated';
    execute 'revoke all on function app_private.consume_auth_rate_limit(text,text,text,text,timestamptz) from authenticated';
  end if;
end
$auth_rate_limit_data_api_revoke$;

grant execute on function app_private.consume_auth_rate_limit(text,text,text,text,timestamptz)
  to youone_request;

comment on table public.auth_rate_limit_policy_version is
  'Immutable, explicitly approved operational Auth rate-limit policy snapshot; no production defaults are seeded.';
comment on table public.auth_rate_limit_bucket is
  'Mutable distributed counters keyed only by one-way HMAC fingerprints; raw identifiers, credentials, tokens and network addresses are prohibited.';
