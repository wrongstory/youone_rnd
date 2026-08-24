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

The connected Supabase account currently has two `ACTIVE_HEALTHY` Postgres 17 projects in `ap-northeast-1`: `wrongstory's Project` (`dttwfqzkhjujqkcatyav`) and `YOUONE_STAGING_RECOVERY` (`jzxhetszlucgutnwidkd`). The first is only a **primary candidate** until its stable environment ID is explicitly confirmed. It has hosted migrations M02 through M10, zero `UserAccount`/Project business rows, and no M11-M16/R02/R03/R06 migrations. The Recovery project has no repository migration or public table. Neither project is linked through repository/local runtime configuration.

The primary candidate's Supabase Security Advisor reported 253 WARN findings: five mutable helper `search_path` findings plus 124 `SECURITY DEFINER` RPCs directly executable by each of `anon` and `authenticated`. Live `pg_proc.proacl` confirmed that those roles have direct grants even where repository migrations revoked `PUBLIC`. Migration `20260824101551_b01_lock_down_data_api_functions.sql` explicitly revokes both Data API roles, changes future `postgres` default function privileges, fixes the five helper search paths and fails if any public definer remains executable by those roles. It is committed as a forward-fix but is not applied to the ambiguous primary candidate in this slice.

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

- Two Supabase projects exist, but the primary candidate is not named/bound as `YOUONE_STAGING_PRIMARY`; no project reference, publishable key, custom SMTP, Web/Identity Resolver login or live user is configured in the repository or local environment.
- Global sign-out, exact post-sign-out presence probing, three attempts and durable 15-minute reconciliation handoff are implemented, but the Worker consumer, incident escalation and live Staging evidence are not.
- Provider rate-limit reason mapping exists; an application-owned distributed limiter and append-only login/MFA/logout audit store are not yet composed.
- New-device/managed-device trust and sensitive-action step-up remain fail-closed design requirements without a provider implementation.
- Password recovery request is generic and non-enumerating, but recovery-link exchange, new-password mutation and global session reconciliation are not implemented.
- Internal/Vendor invitation, provisioning, effective assignment/grant changes, disable/revoke sagas and UserAccount display-profile fields are not implemented as live APIs.
- Project/WBS/member/link/formal-research Command repositories, actual Project Query projection and server-calculated allowed actions are not composed.
- There is no `supabase/config.toml` or linked local project; therefore no claim is made that migrations have been applied to a live Supabase instance.

Any schema needed for display profiles, auth audit/rate limit, device trust or operational commands requires reviewed public contracts and a Platform/Security-owned migration. This slice deliberately creates no guessed migration.

## 5. Current Supabase compatibility notes

- Supabase client libraries dropped Node.js 20 support on 2026-06-30; this repository requires Node.js 24, so the runtime baseline is compatible.
- New tables are moving to explicit Data API exposure. Grants and RLS are separate gates; `authenticated` access is never granted without reviewed object grants and row policies.
- TOTP MFA is available on all projects, while time-box, inactivity and single-session settings still require plan/Staging verification. Session-policy changes are observed on refresh and may lag by the JWT lifetime.
- New Free projects using default SMTP cannot customize Auth email templates; production recovery/invitation email requires a reviewed custom SMTP setup.

Official references: [Supabase changelog](https://supabase.com/changelog), [Auth sessions](https://supabase.com/docs/guides/auth/sessions), [TOTP MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp), [Data API security](https://supabase.com/docs/guides/api/securing-your-api).

## 6. Next merge slices

1. Complete B01 with exact post-logout session absence, durable audit, distributed rate limit, recovery confirmation and device/step-up ports.
2. Implement B02 UserAccount/assignment/Vendor grant Query and audited Command workflows.
3. Implement B03 Project/WBS/member/link/formal designation repositories and HTTP Commands.
4. Replace preview Query paths under B04 and return server-authorized action lists.
5. Bind #59 Frontend to the exact DTOs, then execute live Supabase Staging contract/E2E tests and regenerate #36 evidence from the resulting exact `dev` SHA.
