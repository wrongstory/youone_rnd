-- P0 Identity: restricted ActivationContext and application-owned DeviceTrust.
--
-- Policy values are intentionally not seeded. Until an approved, canonical-hash-bound
-- DeviceTrustPolicyVersion exists, every policy lookup and enrollment command fails closed.
-- This migration never stores a raw device nonce, browser fingerprint, cookie, provider
-- token, password, or TOTP secret. Only a deployment-secret HMAC SHA-256 may cross the DB boundary.

do $activation_role$
begin
  if not exists (select 1 from pg_roles where rolname = 'youone_activation') then
    create role youone_activation
      nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  end if;
end
$activation_role$;

do $activation_role_guard$
declare
  target pg_roles%rowtype;
begin
  select * into target from pg_roles where rolname = 'youone_activation';
  if not found
    or target.rolsuper
    or target.rolcreatedb
    or target.rolcreaterole
    or target.rolinherit
    or target.rolcanlogin
    or target.rolreplication
    or target.rolbypassrls then
    raise exception 'unsafe or missing youone_activation attributes' using errcode = '42501';
  end if;
end
$activation_role_guard$;

grant usage on schema app_private to youone_activation;

insert into public.aggregate_type_definition(aggregate_type)
values ('DEVICE_TRUST'), ('DEVICE_TRUST_POLICY_VERSION'), ('IDENTITY_ACTIVATION_EVIDENCE')
on conflict do nothing;

insert into public.action_definition(action_id)
values
  ('identity.device-trust.enroll.activation'),
  ('identity.device-trust.activate.activation'),
  ('identity.device-trust.verify.activation'),
  ('identity.account.activate')
on conflict do nothing;

insert into public.state_machine_definition(machine_id, aggregate_type)
values ('SM-DEVICE-TRUST-V1', 'DEVICE_TRUST')
on conflict do nothing;

insert into public.state_definition(machine_id, state_id, is_terminal)
values
  ('SM-DEVICE-TRUST-V1', 'PENDING', false),
  ('SM-DEVICE-TRUST-V1', 'ACTIVE', false),
  ('SM-DEVICE-TRUST-V1', 'REVOKED', true),
  ('SM-DEVICE-TRUST-V1', 'EXPIRED', true)
on conflict do nothing;

insert into public.transition_definition(machine_id, event_id, from_state, to_state)
values
  ('SM-DEVICE-TRUST-V1', 'DEVICE_TRUST_ACTIVATED', 'PENDING', 'ACTIVE'),
  ('SM-DEVICE-TRUST-V1', 'DEVICE_TRUST_REVOKED', 'PENDING', 'REVOKED'),
  ('SM-DEVICE-TRUST-V1', 'DEVICE_TRUST_REVOKED', 'ACTIVE', 'REVOKED'),
  ('SM-DEVICE-TRUST-V1', 'DEVICE_TRUST_EXPIRED', 'PENDING', 'EXPIRED'),
  ('SM-DEVICE-TRUST-V1', 'DEVICE_TRUST_EXPIRED', 'ACTIVE', 'EXPIRED')
on conflict do nothing;

create table public.device_trust_policy_version (
  id uuid primary key,
  policy_code text not null unique check (app_private.is_stable_code(policy_code)),
  maximum_trust_seconds integer not null check (maximum_trust_seconds > 0),
  authentication_method text not null check (authentication_method = 'PASSWORD_TOTP_AAL2'),
  approval_evidence_id uuid not null unique,
  approval_snapshot_sha256 text not null check (app_private.is_sha256(approval_snapshot_sha256)),
  created_at timestamptz not null,
  approved_at timestamptz not null,
  effective_at timestamptz not null,
  valid_until timestamptz,
  check (created_at <= approved_at and approved_at <= effective_at),
  check (valid_until is null or valid_until > effective_at)
);

create table public.device_trust_policy_revocation (
  id uuid primary key,
  policy_version_id uuid not null unique references public.device_trust_policy_version(id),
  revoked_at timestamptz not null,
  revoked_by_user_id uuid not null references public.user_account(id),
  reason_record_ref uuid not null
);

create index device_trust_policy_revocation_actor_idx
  on public.device_trust_policy_revocation(revoked_by_user_id);

create table public.identity_activation_evidence (
  id uuid primary key,
  user_account_id uuid not null references public.user_account(id),
  evidence_kind text not null check (evidence_kind in ('REGISTRATION_APPROVAL', 'OD042_BOOTSTRAP')),
  source_evidence_id uuid not null unique,
  source_evidence_sha256 text not null check (app_private.is_sha256(source_evidence_sha256)),
  provider_auth_subject uuid not null,
  approved_at timestamptz not null,
  provider_invitation_accepted_at timestamptz not null,
  password_established_at timestamptz not null,
  valid_from timestamptz not null,
  valid_until timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  check (approved_at <= provider_invitation_accepted_at),
  check (approved_at <= password_established_at),
  check (provider_invitation_accepted_at <= valid_from),
  check (password_established_at <= valid_from),
  check (valid_from <= created_at),
  check (valid_until is null or valid_until > valid_from)
);

create index identity_activation_evidence_user_validity_idx
  on public.identity_activation_evidence(user_account_id, valid_from, valid_until);
create index identity_activation_evidence_subject_idx
  on public.identity_activation_evidence(provider_auth_subject);

create table public.identity_activation_evidence_revocation (
  id uuid primary key,
  activation_evidence_id uuid not null unique references public.identity_activation_evidence(id),
  revoked_at timestamptz not null,
  revoked_by_user_id uuid not null references public.user_account(id),
  reason_record_ref uuid not null
);

create index identity_activation_evidence_revocation_actor_idx
  on public.identity_activation_evidence_revocation(revoked_by_user_id);

create table public.device_trust (
  id uuid primary key,
  user_account_id uuid not null references public.user_account(id),
  provider_session_id uuid not null,
  device_credential_hmac_sha256 text not null check (app_private.is_sha256(device_credential_hmac_sha256)),
  activation_evidence_id uuid not null references public.identity_activation_evidence(id),
  policy_version_id uuid not null references public.device_trust_policy_version(id),
  state text not null check (state in ('PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED')),
  authentication_method text not null check (authentication_method = 'PASSWORD_TOTP_AAL2'),
  created_at timestamptz not null,
  approved_at timestamptz,
  expires_at timestamptz not null,
  expired_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.user_account(id),
  revoke_reason_record_ref uuid,
  version_no bigint not null default 0 check (version_no >= 0),
  check (expires_at > created_at),
  check (
    (state = 'PENDING' and approved_at is null and expired_at is null and revoked_at is null
      and revoked_by_user_id is null and revoke_reason_record_ref is null)
    or
    (state = 'ACTIVE' and approved_at is not null and approved_at < expires_at
      and expired_at is null and revoked_at is null and revoked_by_user_id is null
      and revoke_reason_record_ref is null)
    or
    (state = 'REVOKED' and revoked_at is not null and revoked_by_user_id is not null
      and revoke_reason_record_ref is not null and expired_at is null)
    or
    (state = 'EXPIRED' and expired_at is not null and expired_at >= expires_at
      and revoked_at is null and revoked_by_user_id is null and revoke_reason_record_ref is null)
  )
);

create index device_trust_user_idx on public.device_trust(user_account_id);
create index device_trust_activation_evidence_idx on public.device_trust(activation_evidence_id);
create index device_trust_policy_version_idx on public.device_trust(policy_version_id);
create index device_trust_expiry_idx on public.device_trust(expires_at)
  where state in ('PENDING', 'ACTIVE');
create unique index device_trust_live_session_unique
  on public.device_trust(user_account_id, provider_session_id)
  where state in ('PENDING', 'ACTIVE');
create unique index device_trust_credential_binding_unique
  on public.device_trust(user_account_id, provider_session_id, device_credential_hmac_sha256);

create trigger device_trust_policy_version_immutable
before update or delete on public.device_trust_policy_version
for each row execute function app_private.reject_immutable_change();

create trigger device_trust_policy_revocation_immutable
before update or delete on public.device_trust_policy_revocation
for each row execute function app_private.reject_immutable_change();

create trigger identity_activation_evidence_immutable
before update or delete on public.identity_activation_evidence
for each row execute function app_private.reject_immutable_change();

create trigger identity_activation_evidence_revocation_immutable
before update or delete on public.identity_activation_evidence_revocation
for each row execute function app_private.reject_immutable_change();

create or replace function app_private.device_trust_policy_sha256(target_policy_version_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, app_private, extensions
as $$
  select encode(
    extensions.digest(
      convert_to(
        'YOUONE_DEVICE_TRUST_POLICY_V1' || E'\n' ||
        policy.policy_code || '|' || policy.maximum_trust_seconds::text || '|' ||
        policy.authentication_method || '|' || policy.approval_evidence_id::text || '|' ||
        to_char(policy.approved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
        to_char(policy.effective_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
        coalesce(to_char(policy.valid_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'null'),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  from public.device_trust_policy_version policy
  where policy.id = target_policy_version_id
$$;

create or replace function app_private.load_effective_device_trust_policy(target_time timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
  select jsonb_build_object(
    'policyVersionId', policy.id,
    'policyCode', policy.policy_code,
    'state', 'EFFECTIVE',
    'maximumTrustSeconds', policy.maximum_trust_seconds,
    'approvedAt', policy.approved_at,
    'effectiveAt', policy.effective_at,
    'validUntil', policy.valid_until,
    'approvalEvidenceId', policy.approval_evidence_id
  )
  from public.device_trust_policy_version policy
  where target_time is not null
    and policy.effective_at <= target_time
    and (policy.valid_until is null or policy.valid_until > target_time)
    and policy.approval_snapshot_sha256 = app_private.device_trust_policy_sha256(policy.id)
    and not exists (
      select 1 from public.device_trust_policy_revocation revocation
      where revocation.policy_version_id = policy.id
        and revocation.revoked_at <= target_time
    )
  order by policy.effective_at desc, policy.id desc
  limit 1
$$;

create or replace function app_private.activation_basis_snapshot(
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
  business_snapshot jsonb;
  account_row public.user_account%rowtype;
  factor_id uuid;
  factor_verified_at timestamptz;
  evidence_row public.identity_activation_evidence%rowtype;
begin
  if verified_auth_subject is null or verified_auth_subject = ''
    or verified_session_id is null or verified_session_id = ''
    or requested_at is null then
    return null;
  end if;

  business_snapshot := app_private.resolve_active_actor_context_snapshot(
    verified_auth_subject,
    verified_session_id,
    requested_at
  );
  if business_snapshot is null or business_snapshot->>'accountStatus' <> 'PENDING' then
    return null;
  end if;

  begin
    select account.* into strict account_row
    from public.user_account account
    where account.auth_subject = verified_auth_subject
      and account.status = 'PENDING'
      and account.valid_from <= requested_at
      and (account.valid_until is null or account.valid_until > requested_at);

    execute $factor$
      select current_session.factor_id, coalesce(factor.updated_at, factor.created_at)
      from auth.sessions current_session
      join auth.mfa_factors factor
        on factor.id = current_session.factor_id
       and factor.user_id = current_session.user_id
      where current_session.id = $1::uuid
        and current_session.user_id = $2::uuid
        and current_session.aal::text = 'aal2'
        and factor.factor_type::text = 'totp'
        and factor.status::text = 'verified'
    $factor$
    into strict factor_id, factor_verified_at
    using verified_session_id, verified_auth_subject;
  exception
    when no_data_found or too_many_rows or invalid_text_representation then
      return null;
    when undefined_column or undefined_table then
      raise exception 'Supabase activation session capability incompatible' using errcode = '55000';
  end;

  select evidence.* into evidence_row
  from public.identity_activation_evidence evidence
  where evidence.user_account_id = account_row.id
    and evidence.provider_auth_subject = verified_auth_subject::uuid
    and evidence.approved_at <= requested_at
    and evidence.provider_invitation_accepted_at <= requested_at
    and evidence.password_established_at <= requested_at
    and evidence.valid_from <= requested_at
    and (evidence.valid_until is null or evidence.valid_until > requested_at)
    and not exists (
      select 1 from public.identity_activation_evidence_revocation revocation
      where revocation.activation_evidence_id = evidence.id
        and revocation.revoked_at <= requested_at
    )
  order by evidence.valid_from desc, evidence.id desc
  limit 1;

  if evidence_row.id is null then return null; end if;

  return jsonb_build_object(
    'userAccountId', account_row.id,
    'authSubject', account_row.auth_subject,
    'accountKind', account_row.account_kind,
    'accountStatus', account_row.status,
    'accountValidFrom', account_row.valid_from,
    'accountValidUntil', account_row.valid_until,
    'accountVersion', account_row.version_no,
    'providerSessionId', verified_session_id,
    'providerSessionIsLive', true,
    'totp', jsonb_build_object(
      'method', 'TOTP',
      'assuranceLevel', 'AAL2',
      'verifiedAt', factor_verified_at,
      'factorEvidenceId', factor_id
    ),
    'activationEvidence', jsonb_build_object(
      'evidenceId', evidence_row.id,
      'evidenceKind', evidence_row.evidence_kind,
      'state', 'APPROVED',
      'userAccountId', evidence_row.user_account_id,
      'authSubject', evidence_row.provider_auth_subject,
      'approvedAt', evidence_row.approved_at,
      'providerInvitationAcceptedAt', evidence_row.provider_invitation_accepted_at,
      'passwordEstablishedAt', evidence_row.password_established_at,
      'validUntil', evidence_row.valid_until,
      'evidenceSha256', evidence_row.source_evidence_sha256
    )
  );
exception
  when invalid_text_representation then
    return null;
end
$$;

create or replace function app_private.resolve_activation_context_snapshot(
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
  snapshot jsonb;
begin
  snapshot := app_private.activation_basis_snapshot(
    verified_auth_subject,
    verified_session_id,
    requested_at
  );
  return snapshot;
exception when invalid_text_representation then
  return null;
end
$$;

create or replace function app_private.activation_transaction_matches(
  snapshot jsonb,
  expected_session_id text,
  expected_evidence_id uuid,
  expected_time timestamptz
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, app_private
as $$
  select snapshot is not null
    and app_private.required_setting('app.actor_kind') = 'USER'
    and app_private.required_setting('app.actor_user_id') = snapshot->>'userAccountId'
    and app_private.required_setting('app.effective_actor_user_id') = snapshot->>'userAccountId'
    and app_private.required_setting('app.session_id') = expected_session_id
    and app_private.required_setting('app.assurance_level') = 'AAL2'
    and app_private.request_time() = expected_time
    and snapshot->>'providerSessionId' = expected_session_id
    and snapshot->'activationEvidence'->>'evidenceId' = expected_evidence_id::text
$$;

create or replace function app_private.create_pending_device_trust(
  entry_device_trust_id uuid,
  entry_auth_subject text,
  entry_session_id text,
  entry_activation_evidence_id uuid,
  entry_device_credential_hmac_sha256 text,
  entry_policy_version_id uuid,
  entry_expires_at timestamptz,
  entry_audit_id uuid,
  entry_occurred_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  snapshot jsonb;
  policy jsonb;
  target_user_id uuid;
  inserted public.device_trust%rowtype;
begin
  if not app_private.is_sha256(entry_device_credential_hmac_sha256) then
    raise exception 'invalid device credential evidence' using errcode = '22023';
  end if;

  snapshot := app_private.activation_basis_snapshot(entry_auth_subject, entry_session_id, entry_occurred_at);
  if snapshot is null then raise exception 'activation basis denied' using errcode = '42501'; end if;
  target_user_id := (snapshot->>'userAccountId')::uuid;

  -- All activation commands lock the UserAccount first, then DeviceTrust, to keep one lock order.
  perform 1 from public.user_account account where account.id = target_user_id for update;

  if not app_private.activation_transaction_matches(
    snapshot, entry_session_id, entry_activation_evidence_id, entry_occurred_at
  ) then
    raise exception 'activation transaction binding mismatch' using errcode = '42501';
  end if;

  policy := app_private.load_effective_device_trust_policy(entry_occurred_at);
  if policy is null
    or policy->>'policyVersionId' <> entry_policy_version_id::text
    or entry_expires_at is distinct from entry_occurred_at
      + make_interval(secs => (policy->>'maximumTrustSeconds')::integer) then
    raise exception 'effective DeviceTrust policy unavailable or mismatched' using errcode = '55000';
  end if;

  if exists (
    select 1 from public.device_trust trust
    where trust.user_account_id = target_user_id
      and trust.provider_session_id = entry_session_id::uuid
      and trust.state in ('PENDING', 'ACTIVE')
  ) then
    raise exception 'live DeviceTrust enrollment already exists' using errcode = '23505';
  end if;

  insert into public.device_trust(
    id, user_account_id, provider_session_id, device_credential_hmac_sha256,
    activation_evidence_id, policy_version_id, state, authentication_method,
    created_at, expires_at
  ) values (
    entry_device_trust_id, target_user_id, entry_session_id::uuid,
    entry_device_credential_hmac_sha256, entry_activation_evidence_id,
    entry_policy_version_id, 'PENDING', 'PASSWORD_TOTP_AAL2',
    entry_occurred_at, entry_expires_at
  ) returning * into inserted;

  perform app_private.append_audit(
    entry_audit_id, 'identity.device-trust.enroll.activation', 'DEVICE_TRUST',
    inserted.id, inserted.version_no, 'SUCCEEDED', 'DEVICE_TRUST_ENROLLMENT_PENDING',
    inserted.activation_evidence_id, null, inserted.device_credential_hmac_sha256,
    null, entry_occurred_at
  );

  return app_private.device_trust_snapshot(inserted.id);
exception when unique_violation then
  raise exception 'DeviceTrust enrollment replay or concurrent enrollment denied' using errcode = '40001';
end
$$;

create or replace function app_private.device_trust_snapshot(target_device_trust_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'deviceTrustId', trust.id,
    'userAccountId', trust.user_account_id,
    'providerSessionId', trust.provider_session_id,
    'deviceCredentialHmac', trust.device_credential_hmac_sha256,
    'state', trust.state,
    'authenticationMethod', trust.authentication_method,
    'policyVersionId', trust.policy_version_id,
    'createdAt', trust.created_at,
    'approvedAt', trust.approved_at,
    'expiresAt', trust.expires_at,
    'revokedAt', trust.revoked_at,
    'optimisticVersion', trust.version_no
  )
  from public.device_trust trust
  where trust.id = target_device_trust_id
$$;

create or replace function app_private.load_exact_device_trust(
  entry_auth_subject text,
  entry_session_id text,
  entry_activation_evidence_id uuid,
  entry_device_trust_id uuid,
  entry_device_credential_hmac_sha256 text,
  entry_occurred_at timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  snapshot jsonb;
  target_id uuid;
begin
  if not app_private.is_sha256(entry_device_credential_hmac_sha256) then return null; end if;
  snapshot := app_private.activation_basis_snapshot(entry_auth_subject, entry_session_id, entry_occurred_at);
  if not app_private.activation_transaction_matches(
    snapshot, entry_session_id, entry_activation_evidence_id, entry_occurred_at
  ) then return null; end if;

  select trust.id into target_id
  from public.device_trust trust
  where trust.user_account_id = (snapshot->>'userAccountId')::uuid
    and trust.provider_session_id = entry_session_id::uuid
    and trust.activation_evidence_id = entry_activation_evidence_id
    and trust.device_credential_hmac_sha256 = entry_device_credential_hmac_sha256
    and (entry_device_trust_id is null or trust.id = entry_device_trust_id)
  order by trust.created_at desc, trust.id desc
  limit 1;

  if target_id is null then return null; end if;
  return app_private.device_trust_snapshot(target_id);
exception when invalid_text_representation then
  return null;
end
$$;

create or replace function app_private.activate_pending_device_trust(
  entry_auth_subject text,
  entry_session_id text,
  entry_activation_evidence_id uuid,
  entry_device_trust_id uuid,
  entry_device_credential_hmac_sha256 text,
  entry_expected_version bigint,
  entry_policy_version_id uuid,
  entry_audit_id uuid,
  entry_transition_id uuid,
  entry_occurred_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  snapshot jsonb;
  policy jsonb;
  target_user_id uuid;
  updated public.device_trust%rowtype;
begin
  snapshot := app_private.activation_basis_snapshot(entry_auth_subject, entry_session_id, entry_occurred_at);
  if snapshot is null then raise exception 'activation basis denied' using errcode = '42501'; end if;
  target_user_id := (snapshot->>'userAccountId')::uuid;
  perform 1 from public.user_account account where account.id = target_user_id for update;
  perform 1 from public.device_trust trust where trust.id = entry_device_trust_id for update;

  if not app_private.activation_transaction_matches(
    snapshot, entry_session_id, entry_activation_evidence_id, entry_occurred_at
  ) then
    raise exception 'activation transaction binding mismatch' using errcode = '42501';
  end if;

  policy := app_private.load_effective_device_trust_policy(entry_occurred_at);
  if policy is null or policy->>'policyVersionId' <> entry_policy_version_id::text then
    raise exception 'effective DeviceTrust policy unavailable or mismatched' using errcode = '55000';
  end if;

  update public.device_trust trust
  set state = 'ACTIVE',
      approved_at = entry_occurred_at,
      version_no = app_private.next_version(trust.version_no, entry_expected_version)
  where trust.id = entry_device_trust_id
    and trust.user_account_id = target_user_id
    and trust.provider_session_id = entry_session_id::uuid
    and trust.activation_evidence_id = entry_activation_evidence_id
    and trust.device_credential_hmac_sha256 = entry_device_credential_hmac_sha256
    and trust.policy_version_id = entry_policy_version_id
    and trust.state = 'PENDING'
    and trust.approved_at is null
    and trust.expires_at > entry_occurred_at
  returning * into updated;

  if updated.id is null then
    raise exception 'DeviceTrust enrollment missing, stale, expired, or replayed' using errcode = '40001';
  end if;

  perform app_private.append_audit(
    entry_audit_id, 'identity.device-trust.activate.activation', 'DEVICE_TRUST',
    updated.id, updated.version_no, 'SUCCEEDED', 'DEVICE_TRUST_ACTIVATED',
    updated.activation_evidence_id, null, updated.device_credential_hmac_sha256,
    null, entry_occurred_at
  );
  perform app_private.append_state_transition(
    entry_transition_id, entry_audit_id, 'DEVICE_TRUST', updated.id,
    'SM-DEVICE-TRUST-V1', 'DEVICE_TRUST_ACTIVATED', 'PENDING', 'ACTIVE',
    entry_expected_version, updated.version_no, 'DEVICE_TRUST_ACTIVATED',
    updated.activation_evidence_id, app_private.required_setting('app.correlation_id'),
    app_private.optional_setting('app.causation_id'), entry_occurred_at
  );

  return app_private.device_trust_snapshot(updated.id);
end
$$;

create or replace function app_private.read_activation_readiness_facts(
  entry_auth_subject text,
  entry_session_id text,
  entry_activation_evidence_id uuid,
  entry_device_credential_hmac_sha256 text,
  entry_occurred_at timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  snapshot jsonb;
  policy jsonb;
  trust_snapshot jsonb;
  target_user_id uuid;
  target_account_kind text;
  has_assignment boolean := false;
  has_vendor_membership boolean := false;
begin
  snapshot := app_private.activation_basis_snapshot(entry_auth_subject, entry_session_id, entry_occurred_at);
  if not app_private.activation_transaction_matches(
    snapshot, entry_session_id, entry_activation_evidence_id, entry_occurred_at
  ) then return null; end if;
  target_user_id := (snapshot->>'userAccountId')::uuid;
  target_account_kind := snapshot->>'accountKind';
  policy := app_private.load_effective_device_trust_policy(entry_occurred_at);
  trust_snapshot := app_private.load_exact_device_trust(
    entry_auth_subject, entry_session_id, entry_activation_evidence_id, null,
    entry_device_credential_hmac_sha256, entry_occurred_at
  );

  if target_account_kind = 'INTERNAL' then
    has_assignment := exists(
      select 1 from public.user_organization_assignment assignment
      join public.organization organization
        on organization.id = assignment.organization_id and organization.status = 'ACTIVE'
      where assignment.user_id = target_user_id and assignment.revoked_at is null
        and assignment.valid_from <= entry_occurred_at
        and (assignment.valid_until is null or assignment.valid_until > entry_occurred_at)
      union all
      select 1 from public.user_department_assignment assignment
      join public.department department
        on department.id = assignment.department_id and department.status = 'ACTIVE'
      where assignment.user_id = target_user_id and assignment.revoked_at is null
        and assignment.valid_from <= entry_occurred_at
        and (assignment.valid_until is null or assignment.valid_until > entry_occurred_at)
      union all
      select 1 from public.user_position_assignment assignment
      join public.position position on position.id = assignment.position_id and position.status = 'ACTIVE'
      where assignment.user_id = target_user_id and assignment.revoked_at is null
        and assignment.valid_from <= entry_occurred_at
        and (assignment.valid_until is null or assignment.valid_until > entry_occurred_at)
      union all
      select 1 from public.user_role_assignment assignment
      join public.role role on role.id = assignment.role_id and role.status = 'ACTIVE'
      where assignment.user_id = target_user_id and assignment.revoked_at is null
        and assignment.valid_from <= entry_occurred_at
        and (assignment.valid_until is null or assignment.valid_until > entry_occurred_at)
    );
  else
    has_vendor_membership := exists(
      select 1 from public.vendor_user membership
      join public.vendor vendor on vendor.id = membership.vendor_id and vendor.status = 'ACTIVE'
      where membership.user_id = target_user_id
        and membership.status = 'ACTIVE'
        and membership.revoked_at is null
        and membership.valid_from <= entry_occurred_at
        and (membership.valid_until is null or membership.valid_until > entry_occurred_at)
    );
  end if;

  return jsonb_build_object(
    'identity', snapshot,
    'policy', policy,
    'deviceTrust', trust_snapshot,
    'hasActiveRequiredAssignment', has_assignment,
    'hasActiveVendorMembership', has_vendor_membership
  );
end
$$;

create or replace function app_private.activate_pending_user_account(
  entry_auth_subject text,
  entry_session_id text,
  entry_activation_evidence_id uuid,
  entry_device_trust_id uuid,
  entry_device_credential_hmac_sha256 text,
  entry_expected_account_version bigint,
  entry_audit_id uuid,
  entry_occurred_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  facts jsonb;
  policy jsonb;
  trust jsonb;
  target_user_id uuid;
  target_kind text;
  has_required_binding boolean;
  updated_version bigint;
begin
  facts := app_private.read_activation_readiness_facts(
    entry_auth_subject, entry_session_id, entry_activation_evidence_id,
    entry_device_credential_hmac_sha256, entry_occurred_at
  );
  if facts is null then raise exception 'account activation basis denied' using errcode = '42501'; end if;
  target_user_id := (facts->'identity'->>'userAccountId')::uuid;

  -- Re-lock and re-evaluate below in the same transaction; read readiness is advisory only.
  perform 1 from public.user_account account where account.id = target_user_id for update;
  perform 1 from public.device_trust device where device.id = entry_device_trust_id for update;
  facts := app_private.read_activation_readiness_facts(
    entry_auth_subject, entry_session_id, entry_activation_evidence_id,
    entry_device_credential_hmac_sha256, entry_occurred_at
  );
  if facts is null then raise exception 'account activation basis changed' using errcode = '40001'; end if;

  policy := facts->'policy';
  trust := facts->'deviceTrust';
  target_kind := facts->'identity'->>'accountKind';
  has_required_binding := case
    when target_kind = 'INTERNAL' then (facts->>'hasActiveRequiredAssignment')::boolean
    when target_kind = 'VENDOR' then (facts->>'hasActiveVendorMembership')::boolean
    else false
  end;

  if policy is null or policy = 'null'::jsonb
    or trust is null or trust = 'null'::jsonb
    or trust->>'deviceTrustId' <> entry_device_trust_id::text
    or trust->>'state' <> 'ACTIVE'
    or trust->>'deviceCredentialHmac' <> entry_device_credential_hmac_sha256
    or trust->>'policyVersionId' <> policy->>'policyVersionId'
    or (trust->>'approvedAt') is null
    or (trust->>'expiresAt')::timestamptz <= entry_occurred_at
    or (trust->>'revokedAt') is not null
    or not has_required_binding then
    raise exception 'all account activation conditions are required' using errcode = '42501';
  end if;

  update public.user_account account
  set status = 'ACTIVE',
      updated_at = entry_occurred_at,
      version_no = app_private.next_version(account.version_no, entry_expected_account_version)
  where account.id = target_user_id
    and account.auth_subject = entry_auth_subject
    and account.status = 'PENDING'
    and account.valid_from <= entry_occurred_at
    and (account.valid_until is null or account.valid_until > entry_occurred_at)
  returning account.version_no into updated_version;

  if updated_version is null then
    raise exception 'pending UserAccount missing or stale' using errcode = '40001';
  end if;

  perform app_private.append_audit(
    entry_audit_id, 'identity.account.activate', 'USER_ACCOUNT', target_user_id,
    updated_version, 'SUCCEEDED', 'IDENTITY_ACTIVATION_GATE_SATISFIED',
    entry_activation_evidence_id, null, entry_device_credential_hmac_sha256,
    null, entry_occurred_at
  );

  return jsonb_build_object('userAccountId', target_user_id, 'status', 'ACTIVE', 'accountVersion', updated_version);
end
$$;

do $device_trust_rls$
declare
  table_name text;
begin
  foreach table_name in array array[
    'device_trust_policy_version',
    'device_trust_policy_revocation',
    'identity_activation_evidence',
    'identity_activation_evidence_revocation',
    'device_trust'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'revoke all on table public.%I from public, youone_request, youone_privileged_writer, youone_identity_resolver, youone_activation',
      table_name
    );
  end loop;
end
$device_trust_rls$;

do $device_trust_data_api_revoke$
declare
  role_name text;
  table_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      foreach table_name in array array[
        'device_trust_policy_version',
        'device_trust_policy_revocation',
        'identity_activation_evidence',
        'identity_activation_evidence_revocation',
        'device_trust'
      ] loop
        execute format('revoke all on table public.%I from %I', table_name, role_name);
      end loop;
    end if;
  end loop;
end
$device_trust_data_api_revoke$;

revoke execute on all functions in schema app_private from public;

do $device_trust_function_revoke$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke execute on all functions in schema app_private from %I', role_name);
    end if;
  end loop;
end
$device_trust_function_revoke$;

revoke all on function app_private.device_trust_policy_sha256(uuid)
  from youone_request, youone_privileged_writer, youone_identity_resolver, youone_activation;
revoke all on function app_private.activation_basis_snapshot(text,text,timestamptz)
  from youone_request, youone_privileged_writer, youone_identity_resolver, youone_activation;
revoke all on function app_private.activation_transaction_matches(jsonb,text,uuid,timestamptz)
  from youone_request, youone_privileged_writer, youone_identity_resolver, youone_activation;
revoke all on function app_private.device_trust_snapshot(uuid)
  from youone_request, youone_privileged_writer, youone_identity_resolver, youone_activation;

revoke all on function app_private.load_effective_device_trust_policy(timestamptz)
  from youone_request, youone_privileged_writer, youone_identity_resolver;
revoke all on function app_private.resolve_activation_context_snapshot(text,text,timestamptz)
  from youone_request, youone_privileged_writer, youone_identity_resolver;
revoke all on function app_private.create_pending_device_trust(uuid,text,text,uuid,text,uuid,timestamptz,uuid,timestamptz)
  from youone_request, youone_privileged_writer, youone_identity_resolver;
revoke all on function app_private.load_exact_device_trust(text,text,uuid,uuid,text,timestamptz)
  from youone_request, youone_privileged_writer, youone_identity_resolver;
revoke all on function app_private.activate_pending_device_trust(text,text,uuid,uuid,text,bigint,uuid,uuid,uuid,timestamptz)
  from youone_request, youone_privileged_writer, youone_identity_resolver;
revoke all on function app_private.read_activation_readiness_facts(text,text,uuid,text,timestamptz)
  from youone_request, youone_privileged_writer, youone_identity_resolver;
revoke all on function app_private.activate_pending_user_account(text,text,uuid,uuid,text,bigint,uuid,timestamptz)
  from youone_request, youone_privileged_writer, youone_identity_resolver;

grant execute on function app_private.load_effective_device_trust_policy(timestamptz)
  to youone_activation;
grant execute on function app_private.resolve_activation_context_snapshot(text,text,timestamptz)
  to youone_activation;
grant execute on function app_private.create_pending_device_trust(uuid,text,text,uuid,text,uuid,timestamptz,uuid,timestamptz)
  to youone_activation;
grant execute on function app_private.load_exact_device_trust(text,text,uuid,uuid,text,timestamptz)
  to youone_activation;
grant execute on function app_private.activate_pending_device_trust(text,text,uuid,uuid,text,bigint,uuid,uuid,uuid,timestamptz)
  to youone_activation;
grant execute on function app_private.read_activation_readiness_facts(text,text,uuid,text,timestamptz)
  to youone_activation;
grant execute on function app_private.activate_pending_user_account(text,text,uuid,uuid,text,bigint,uuid,timestamptz)
  to youone_activation;

comment on role youone_activation is
  'NOLOGIN/NOINHERIT activation-only capability. It cannot create a business ActorContext or read application tables directly.';
comment on table public.device_trust is
  'Stores only deployment-secret HMAC SHA-256 credentials bound to exact UserAccount and provider session; raw device/browser/token material is forbidden.';
comment on function app_private.resolve_activation_context_snapshot(text,text,timestamptz) is
  'PENDING-only ActivationContext source: exact live newest TOTP aal2 provider session plus immutable unrevoked invitation/bootstrap evidence; persists through trust verification/readiness and ceases when the account leaves PENDING.';
comment on function app_private.activate_pending_user_account(text,text,uuid,uuid,text,bigint,uuid,timestamptz) is
  'Separate explicit command. Revalidates account, session, evidence, effective policy, active exact DeviceTrust, assignment/membership, expiry and optimistic version in one transaction.';
