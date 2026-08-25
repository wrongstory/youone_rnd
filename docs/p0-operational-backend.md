# P0 Operational Backend Status

## 1. Purpose

This document tracks GitHub issue `#58` without treating repository contracts or preview data as a live Supabase deployment. The baseline inspected for the first slice is `dev@7ba96d0c9cf4a8d5127a9af569f9282029dbd751` on 2026-08-24 (Asia/Seoul).

## 2. Implemented before #58

- Ordered SQL migrations `M02` through `M16` plus R02/R03/R06 forward contracts exist for identity, RBAC/Scope, Approval, Document/File, Project/WBS, Vendor/Contract, Quality, Change, Purchase/R&D, ResearchNote, Safety, controlled copies and offline sync.
- Supabase request verification uses a publishable key, explicit access-token `getUser + getClaims`, no SDK persistence/refresh, mandatory `aal2`, UUID `session_id`, expiry validation and exact subject match.
- The separate Identity Resolver requires the provider `session_id` to remain in `auth.sessions` for the same subject before it returns the current `UserAccount` and effective assignments.
- Request PostgreSQL composition requires a least-privileged `NOINHERIT`, `NOBYPASSRLS` login and activates `youone_request` plus transaction-local trusted actor context.
- Project/WBS and formal-research designation domain/application contracts and tables exist, but the ordinary Project HTTP routes still use an unavailable/preview Query boundary and have no live write Command composition.
- Private Storage backup/restore and release evidence contracts exist, but no actual primary/recovery Staging project drill or retained 27-item evidence set exists.

The connected Supabase account has two `ACTIVE_HEALTHY` Postgres 17 projects in `ap-northeast-1`. On 2026-08-25 the user bound `wrongstory's Project` (`dttwfqzkhjujqkcatyav`) to `YOUONE_STAGING_PRIMARY` and retained `YOUONE_STAGING_RECOVERY` (`jzxhetszlucgutnwidkd`) as the isolated restore target. M11-M16, R02/R03/R06 and the three B01 forward-fixes were then applied in repository order, giving Primary 21 hosted migrations with zero Auth/UserAccount/Project rows. Recovery remains empty with no repository migration, public table, Auth user or Storage bucket. The user subsequently fixed the organization to Free for now. Native Pro session controls are therefore not an activation dependency; equivalent request-time enforcement and the remaining DeviceTrust/StepUpGrant plus external Worker evidence follow `docs/supabase-free-operations.md`.

Before activation the Primary Security Advisor reported five mutable helper `search_path` findings plus 124 `SECURITY DEFINER` RPCs directly executable by each of `anon` and `authenticated`. Migration `20260824101551_b01_lock_down_data_api_functions.sql` revoked both Data API roles, hardened future `postgres` default function privileges and fixed the helper search paths. Post-apply SQL proves zero public tables without RLS and zero public `SECURITY DEFINER` functions executable by `anon`/`authenticated`; the Security Advisor now reports zero WARN/ERROR and only `rls_enabled_no_policy` INFO for deny-by-default/FORCE-RLS tables.

## 3. #58 first slice

The first slice fixes the browser/server authentication contract before Project writes are opened.

- `GET /api/auth/csrf`
- `POST /api/auth/login`
- `POST /api/auth/mfa/enroll`
- `POST /api/auth/mfa/verify`
- `POST /api/auth/refresh`
- `POST /api/auth/recovery`
- `POST /api/auth/logout`
- `GET /api/auth/session`

The Supabase SDK remains under `@youone/infra-supabase-auth/operational`. Routes consume a provider-independent gateway through Web composition. Access/refresh/factor values are server-only `HttpOnly`, `SameSite=Strict` cookies; production cookies use `Secure` valid `__Host-` attributes. Mutation routes require exact same-origin plus double-submit CSRF. Responses and fixed-field security logs have no slot for token, cookie, password, provider error body or session/factor identifier. AAL1 can only continue to TOTP enrollment/challenge; `GET /api/auth/session` succeeds only after the existing trusted ActorContext factory revalidates `aal2`, `auth.sessions`, current UserAccount and effective assignments.

Global logout now derives the exact provider subject/session from that trusted ActorContext, invokes provider `global` sign-out, and uses a separate resolver-only `auth_session_exists(subject, session_id)` capability up to three times. Confirmed absence and unresolved absence are both written as append-only audit evidence. An unresolved or unavailable probe creates a typed outbox event exactly 15 minutes later in the same transaction; a database trigger binds its subject to the authenticated `UserAccount`, its session to transaction-local `app.session_id`, and its retry/cadence values to the approved `3 / 15 minutes`. JWTs, refresh values and cookies are never retained in audit/outbox. The event consumer and live Staging reconciliation execution remain open.

Provider-dependent configuration is `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APP_ORIGIN`, `REQUEST_AUTH_TIMEOUT_MS` and the existing Identity Resolver settings. Missing or changed runtime composition is fail-closed. `service_role` remains forbidden in Web.

## 4. Still open in #58

This first slice does not close B01 or issue `#58`.

- The two Supabase projects are stably bound on Free, but no custom SMTP, Web/Identity Resolver/Worker login or live user is configured in the repository or runtime secret store.
- Global sign-out, exact post-sign-out presence probing, three attempts and durable 15-minute reconciliation handoff are implemented, but the Worker consumer, incident escalation and live Staging evidence are not.
- The application-owned distributed limiter and append-only request/result audit are composed and `OD-039` numeric rules are approved, but the exact six rules, distinct actual `ADMIN_SECURITY`/Lab Director actors, completed Approval evidence and deployment HMAC secret are not provisioned; operational mutation therefore remains fail-closed.
- New-device/managed-device trust and sensitive-action step-up remain fail-closed design requirements without a provider implementation.
- Password recovery request is generic and non-enumerating, but recovery-link exchange, new-password mutation and global session reconciliation are not implemented.
- Internal/Vendor invitation, provisioning, effective assignment/grant changes, disable/revoke sagas and UserAccount display-profile fields are not implemented as live APIs.
- Passwordless pre-Auth registration and direct Lab Director approval are now approved P0 requirements, but registration persistence, server-only provider invitation, bootstrap evidence and activation orchestration are not implemented.
- Project/WBS/member/link/formal-research Command repositories, actual Project Query projection and server-calculated allowed actions are not composed.
- There is no `supabase/config.toml` or linked local project; therefore no claim is made that migrations have been applied to a live Supabase instance.

Any additional schema needed for display profiles, device trust or operational commands requires reviewed public contracts and a Platform/Security-owned migration. The rate-limit schema below creates typed policy/rule/revocation/bucket relations without inventing or seeding company-specific numeric values.

The current B01 slice adds the application-owned distributed limiter and durable Auth attempt audit. Login/recovery use normalized identifier material; successful login issues an independent random 256-bit nonce in an HttpOnly/SameSite=Strict `nonce.signature` limiter-subject cookie. The signature is a domain-separated HMAC-SHA256 made with the deployment secret. Logout, TOTP enroll/verify and refresh verify the MAC in constant time before limiter or Provider dispatch and then use only the authenticated nonce, so provider-token rotation or client cookie replacement cannot reset its subject bucket. Only server-HMAC SHA-256 fingerprints and stable outcomes are persisted. The database recomputes the exact sorted canonical six-rule SHA-256, requires one completed immutable ApprovalInstance with distinct active `ADMIN_SECURITY` agreement and `POSITION_LAB_DIRECTOR` approval actions, and binds both consume/result Audit rows to the selected policy UUID. Result audit also requires matching prior consume evidence. Provider-created sessions are globally signed out best-effort after both post-provider application failures and outcome-audit failures. `OD-039` values are approved but are not seeded as an approval substitute: actual two-person actors, completed approval evidence and deployment secret remain production activation blockers.

## 5. Current Supabase compatibility notes

- Supabase client libraries dropped Node.js 20 support on 2026-06-30; this repository requires Node.js 24, so the runtime baseline is compatible.
- New tables are moving to explicit Data API exposure. Grants and RLS are separate gates; `authenticated` access is never granted without reviewed object grants and row policies.
- TOTP MFA is available on Free. Native time-box, refresh-inactivity and single-session settings are Pro-only, so Staging must instead prove the repository's request-time `auth.sessions` 480m absolute / 60m `refreshed_at`-based refresh-inactivity / newest-session checks. This is not a last-user-click timer.
- New Free projects using default SMTP cannot customize Auth email templates; production recovery/invitation email requires a reviewed custom SMTP setup.

Official references: [Supabase changelog](https://supabase.com/changelog), [Auth sessions](https://supabase.com/docs/guides/auth/sessions), [TOTP MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp), [Data API security](https://supabase.com/docs/guides/api/securing-your-api).

## 6. Next merge slices

1. Merge the approved OD-042/043 design Gate.
2. Implement the minimal DeviceTrust vertical slice, including the restricted `ActivationContext`, before creating the first real account.
3. Execute the `OD-042` first-actor bootstrap ceremony in `docs/identity-bootstrap.md` and activate the first Lab Director only after TOTP and DeviceTrust.
4. Implement B02 passwordless registration, direct Lab Director decision, server-only provider invite, UserAccount/assignment/Vendor grant Query and audited Command workflows under the effective `OD-043` policy.
5. Bind #59 registration Frontend to the exact DTOs and Turnstile contract.
6. Implement StepUpGrant and prove sensitive-action binding with the real Staging actors.
7. Implement B03 Project/WBS/member/link/formal designation repositories and HTTP Commands.
8. Replace preview Query paths under B04 and return server-authorized action lists.
9. Execute live Supabase Staging contract/E2E tests and regenerate #36 evidence from the resulting exact `dev` SHA.
