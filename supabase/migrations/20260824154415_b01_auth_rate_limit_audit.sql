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
  effective_at timestamptz not null,
  check (created_at < effective_at)
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

create table public.auth_rate_limit_policy_approval (
  policy_version_id uuid primary key references public.auth_rate_limit_policy_version(id),
  approval_instance_id uuid not null unique references public.approval_instance(id),
  security_owner_action_id uuid not null unique references public.approval_action(id),
  lab_director_action_id uuid not null unique references public.approval_action(id),
  linked_at timestamptz not null,
  check (security_owner_action_id <> lab_director_action_id)
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

create trigger auth_rate_limit_policy_approval_immutable
before update or delete on public.auth_rate_limit_policy_approval
for each row execute function app_private.reject_immutable_change();

create trigger auth_rate_limit_policy_revocation_immutable
before update or delete on public.auth_rate_limit_policy_revocation
for each row execute function app_private.reject_immutable_change();

create or replace function app_private.auth_rate_limit_policy_sha256(target_policy_version_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private, extensions
as $$
declare
  canonical_policy text;
  rule_count integer;
begin
  select
    'YOUONE_AUTH_RATE_LIMIT_POLICY_V1' || E'\n' || policy.policy_version || E'\n' ||
      string_agg(
        rule.action_id || '|' || rule.window_seconds::text || '|' ||
        rule.subject_max_attempts::text || '|' || rule.global_max_attempts::text,
        E'\n' order by rule.action_id
      ),
    count(rule.action_id)::integer
  into canonical_policy, rule_count
  from public.auth_rate_limit_policy_version policy
  left join public.auth_rate_limit_policy_rule rule on rule.policy_version_id = policy.id
  where policy.id = target_policy_version_id
  group by policy.id, policy.policy_version;

  if canonical_policy is null or rule_count <> 6 then return null; end if;
  return encode(extensions.digest(convert_to(canonical_policy, 'UTF8'), 'sha256'), 'hex');
end
$$;

create or replace function app_private.auth_rate_limit_policy_approval_valid(
  target_policy_version_id uuid,
  target_time timestamptz
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select exists (
    select 1
    from public.auth_rate_limit_policy_version policy
    join public.auth_rate_limit_policy_approval evidence
      on evidence.policy_version_id = policy.id
    join public.approval_instance instance
      on instance.id = evidence.approval_instance_id
    join public.approval_policy_version approval_policy
      on approval_policy.id = instance.policy_version_id
    join public.approval_action security_action
      on security_action.id = evidence.security_owner_action_id
      and security_action.instance_id = instance.id
      and security_action.event_id = 'AGREE'
      and security_action.actor_kind = 'USER'
    join public.approval_step security_step
      on security_step.id = security_action.step_id
      and security_step.instance_id = instance.id
      and security_step.sequence_no = 1
      and security_step.step_role = 'AGREEMENT'
      and security_step.completion_mode = 'SPECIFIC'
      and security_step.required
      and security_step.state = 'AGREED'
    join public.approval_participant security_participant
      on security_participant.id = security_action.participant_id
      and security_participant.step_id = security_step.id
      and security_participant.state = 'ACTED'
      and security_participant.required_for_completion
      and security_participant.participant_order = 1
      and security_participant.participant_user_id = security_action.effective_actor_user_id
    join public.role security_role
      on security_role.id = security_participant.role_id_snapshot
      and security_role.stable_code = 'ADMIN_SECURITY'
      and security_role.status = 'ACTIVE'
    join public.user_role_assignment security_assignment
      on security_assignment.id = security_participant.assignment_evidence_id
      and security_assignment.user_id = security_participant.participant_user_id
      and security_assignment.role_id = security_participant.role_id_snapshot
      and security_assignment.valid_from <= security_action.occurred_at
      and (security_assignment.valid_until is null or security_assignment.valid_until > security_action.occurred_at)
      and (security_assignment.revoked_at is null or security_assignment.revoked_at > security_action.occurred_at)
    join public.user_account security_user
      on security_user.id = security_participant.participant_user_id
      and security_user.account_kind = 'INTERNAL'
      and security_user.status = 'ACTIVE'
      and security_user.valid_from <= security_action.occurred_at
      and (security_user.valid_until is null or security_user.valid_until > security_action.occurred_at)
    join public.approval_action director_action
      on director_action.id = evidence.lab_director_action_id
      and director_action.instance_id = instance.id
      and director_action.event_id = 'APPROVE'
      and director_action.actor_kind = 'USER'
    join public.approval_step director_step
      on director_step.id = director_action.step_id
      and director_step.instance_id = instance.id
      and director_step.sequence_no = 2
      and director_step.step_role = 'APPROVAL'
      and director_step.completion_mode = 'SPECIFIC'
      and director_step.required
      and director_step.state = 'APPROVED'
    join public.approval_participant director_participant
      on director_participant.id = director_action.participant_id
      and director_participant.step_id = director_step.id
      and director_participant.state = 'ACTED'
      and director_participant.required_for_completion
      and director_participant.participant_order = 1
      and director_participant.participant_user_id = director_action.effective_actor_user_id
    join public.position director_position
      on director_position.id = director_participant.position_id_snapshot
      and director_position.stable_code = 'POSITION_LAB_DIRECTOR'
      and director_position.status = 'ACTIVE'
    join public.user_position_assignment director_assignment
      on director_assignment.id = director_participant.assignment_evidence_id
      and director_assignment.user_id = director_participant.participant_user_id
      and director_assignment.position_id = director_participant.position_id_snapshot
      and director_assignment.is_primary
      and director_assignment.valid_from <= director_action.occurred_at
      and (director_assignment.valid_until is null or director_assignment.valid_until > director_action.occurred_at)
      and (director_assignment.revoked_at is null or director_assignment.revoked_at > director_action.occurred_at)
    join public.user_account director_user
      on director_user.id = director_participant.participant_user_id
      and director_user.account_kind = 'INTERNAL'
      and director_user.status = 'ACTIVE'
      and director_user.valid_from <= director_action.occurred_at
      and (director_user.valid_until is null or director_user.valid_until > director_action.occurred_at)
    where policy.id = target_policy_version_id
      and approval_policy.subject_kind = 'AUTH_RATE_LIMIT_POLICY_VERSION'
      and instance.state = 'COMPLETED'
      and instance.line_checksum is not null
      and instance.completed_at is not null
      and security_action.effective_actor_user_id <> director_action.effective_actor_user_id
      and security_action.occurred_at <= director_action.occurred_at
      and director_action.occurred_at <= instance.completed_at
      and instance.completed_at <= evidence.linked_at
      and evidence.linked_at <= policy.effective_at
      and policy.effective_at <= target_time
      and policy.approval_snapshot_sha256 = app_private.auth_rate_limit_policy_sha256(policy.id)
      and (select count(*) from public.approval_step step where step.instance_id = instance.id) = 2
      and (select count(*) from public.approval_participant participant
           join public.approval_step step on step.id = participant.step_id
           where step.instance_id = instance.id) = 2
      and (select count(*) from public.approval_action action
           where action.instance_id = instance.id
             and action.event_id in ('REVIEW','AGREE','APPROVE','REJECT','REFERENCE_RECEIPT')) = 2
  )
$$;

create or replace function app_private.consume_auth_rate_limit(
  entry_subject_fingerprint text,
  entry_global_fingerprint text,
  entry_action_id text,
  entry_policy_version text,
  entry_occurred_at timestamptz
) returns table(allowed boolean, policy_version_id uuid, retry_after_seconds integer)
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
    and app_private.auth_rate_limit_policy_approval_valid(policy.id, entry_occurred_at)
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
    select count(*) from public.auth_rate_limit_policy_rule policy_rule
    where policy_rule.policy_version_id = selected_policy_id
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
  policy_version_id := selected_policy_id;
  retry_after_seconds := case when allowed then 0 else greatest(
    case when global_count > selected_global_max
      then ceil(extract(epoch from global_window_end - entry_occurred_at))::integer else 0 end,
    case when subject_count > selected_subject_max
      then ceil(extract(epoch from subject_window_end - entry_occurred_at))::integer else 0 end
  ) end;
  return next;
end
$$;

create or replace function app_private.append_auth_rate_limit_outcome(
  entry_audit_id uuid,
  entry_attempt_id uuid,
  entry_action_id text,
  entry_policy_version_id uuid,
  entry_result text,
  entry_reason_code text,
  entry_occurred_at timestamptz
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if app_private.required_setting('app.actor_kind') <> 'ANONYMOUS'
    or entry_action_id not in (
      'auth.login', 'auth.logout', 'auth.mfa.enroll',
      'auth.mfa.verify', 'auth.recovery', 'auth.refresh'
    )
    or entry_result not in ('DENIED', 'FAILED', 'SUCCEEDED')
    or not app_private.is_stable_code(entry_reason_code)
    or entry_occurred_at is distinct from app_private.request_time() then
    raise exception 'trusted Auth outcome required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.audit_log consumed
    where consumed.resource_type = 'AUTH_SECURITY_ATTEMPT'
      and consumed.resource_id = entry_attempt_id
      and consumed.resource_version = 0
      and consumed.action_id = entry_action_id || '.rate_limit.consume'
      and consumed.reason_record_ref = entry_policy_version_id
      and consumed.actor_kind = 'ANONYMOUS'
      and consumed.anonymous_subject_fingerprint = app_private.required_setting('app.anonymous_subject_fingerprint')
      and consumed.correlation_id = app_private.required_setting('app.correlation_id')
      and consumed.occurred_at = entry_occurred_at
  ) then
    raise exception 'matching Auth rate-limit consume evidence required' using errcode = '23514';
  end if;

  perform app_private.append_audit(
    entry_audit_id, entry_action_id || '.result', 'AUTH_SECURITY_ATTEMPT',
    entry_attempt_id, 0, entry_result, entry_reason_code,
    entry_policy_version_id, null, null, null, entry_occurred_at
  );
end
$$;

alter table public.auth_rate_limit_policy_version enable row level security;
alter table public.auth_rate_limit_policy_rule enable row level security;
alter table public.auth_rate_limit_policy_approval enable row level security;
alter table public.auth_rate_limit_policy_revocation enable row level security;
alter table public.auth_rate_limit_bucket enable row level security;
alter table public.auth_rate_limit_policy_version force row level security;
alter table public.auth_rate_limit_policy_rule force row level security;
alter table public.auth_rate_limit_policy_approval force row level security;
alter table public.auth_rate_limit_policy_revocation force row level security;
alter table public.auth_rate_limit_bucket force row level security;

revoke all on public.auth_rate_limit_policy_version from public, youone_request, youone_privileged_writer, youone_identity_resolver;
revoke all on public.auth_rate_limit_policy_rule from public, youone_request, youone_privileged_writer, youone_identity_resolver;
revoke all on public.auth_rate_limit_policy_approval from public, youone_request, youone_privileged_writer, youone_identity_resolver;
revoke all on public.auth_rate_limit_policy_revocation from public, youone_request, youone_privileged_writer, youone_identity_resolver;
revoke all on public.auth_rate_limit_bucket from public, youone_request, youone_privileged_writer, youone_identity_resolver;
revoke all on function app_private.consume_auth_rate_limit(text,text,text,text,timestamptz)
  from public, youone_privileged_writer, youone_identity_resolver;
revoke all on function app_private.auth_rate_limit_policy_sha256(uuid)
  from public, youone_request, youone_privileged_writer, youone_identity_resolver;
revoke all on function app_private.auth_rate_limit_policy_approval_valid(uuid,timestamptz)
  from public, youone_request, youone_privileged_writer, youone_identity_resolver;
revoke all on function app_private.append_auth_rate_limit_outcome(uuid,uuid,text,uuid,text,text,timestamptz)
  from public, youone_privileged_writer, youone_identity_resolver;

do $auth_rate_limit_data_api_revoke$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.auth_rate_limit_policy_version from anon';
    execute 'revoke all on public.auth_rate_limit_policy_rule from anon';
    execute 'revoke all on public.auth_rate_limit_policy_approval from anon';
    execute 'revoke all on public.auth_rate_limit_policy_revocation from anon';
    execute 'revoke all on public.auth_rate_limit_bucket from anon';
    execute 'revoke all on function app_private.consume_auth_rate_limit(text,text,text,text,timestamptz) from anon';
    execute 'revoke all on function app_private.auth_rate_limit_policy_sha256(uuid) from anon';
    execute 'revoke all on function app_private.auth_rate_limit_policy_approval_valid(uuid,timestamptz) from anon';
    execute 'revoke all on function app_private.append_auth_rate_limit_outcome(uuid,uuid,text,uuid,text,text,timestamptz) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.auth_rate_limit_policy_version from authenticated';
    execute 'revoke all on public.auth_rate_limit_policy_rule from authenticated';
    execute 'revoke all on public.auth_rate_limit_policy_approval from authenticated';
    execute 'revoke all on public.auth_rate_limit_policy_revocation from authenticated';
    execute 'revoke all on public.auth_rate_limit_bucket from authenticated';
    execute 'revoke all on function app_private.consume_auth_rate_limit(text,text,text,text,timestamptz) from authenticated';
    execute 'revoke all on function app_private.auth_rate_limit_policy_sha256(uuid) from authenticated';
    execute 'revoke all on function app_private.auth_rate_limit_policy_approval_valid(uuid,timestamptz) from authenticated';
    execute 'revoke all on function app_private.append_auth_rate_limit_outcome(uuid,uuid,text,uuid,text,text,timestamptz) from authenticated';
  end if;
end
$auth_rate_limit_data_api_revoke$;

grant execute on function app_private.consume_auth_rate_limit(text,text,text,text,timestamptz)
  to youone_request;
grant execute on function app_private.append_auth_rate_limit_outcome(uuid,uuid,text,uuid,text,text,timestamptz)
  to youone_request;

comment on table public.auth_rate_limit_policy_version is
  'Immutable operational Auth rate-limit rule snapshot; activation requires exact canonical hash and completed Security owner plus Lab Director Approval evidence.';
comment on table public.auth_rate_limit_policy_approval is
  'Immutable typed link to one completed ApprovalInstance with distinct ADMIN_SECURITY agreement and POSITION_LAB_DIRECTOR approval actions.';
comment on table public.auth_rate_limit_bucket is
  'Mutable distributed counters keyed only by one-way HMAC fingerprints; raw identifiers, credentials, tokens and network addresses are prohibited.';
