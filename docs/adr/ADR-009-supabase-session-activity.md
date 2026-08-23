# ADR-009: Supabase Request Session Activity and Account Lifecycle

- Status: Accepted
- Date: 2026-08-23
- Decision IDs: Release Gate `#36` R02, `ARC-003-SERVER-AUTHZ`, `OD-019-MFA-SESSION`, `OD-036-SUPABASE-SESSION-REVOKE`

## Context

The application must reject expired, revoked and disabled sessions on the next request. A verified JWT signature and expiry are necessary but not sufficient evidence that the provider session still exists. Supabase access JWTs remain usable until expiry unless the application also checks the provider-issued `session_id` against the current session record.

The ordinary request database principal cannot read identity bootstrap data, and the Web request runtime must never receive a service/secret Auth credential. Supabase currently provides admin logout by a target JWT rather than a reviewed non-destructive revoke-all-by-user-ID operation. A provider ban does not revoke existing sessions, while user deletion is not equivalent to reversible account disablement.

## Decision

- The request adapter uses `@supabase/supabase-js` only inside `infrastructure.supabase-auth/request` with a publishable key, disabled persistence, disabled refresh and an explicit token on both `getUser(token)` and `getClaims(token)`.
- Trusted identity bootstrap requires all three checks on every request: Auth `getUser`, verified claims containing exact subject/expiry/provider `session_id`, and an exact `auth.sessions.id + user_id` match.
- `ActorContextSource.load` receives both verified subject and session ID. The PostgreSQL implementation calls `app_private.resolve_active_actor_context_snapshot` through a separate deployment-provisioned login that can set only the `NOLOGIN`, `NOBYPASSRLS` `youone_identity_resolver` role.
- The resolver function fails closed when the provider session table is absent or incompatible. It returns no snapshot for a missing, revoked, malformed or cross-subject session.
- Request Auth readiness requires both the bounded Auth health probe and a successful Identity Resolver principal/capability probe. Health success alone is not evidence of a working live user session; Staging must retain a real login/session test.
- Raw access and refresh tokens are never persisted in audit, outbox or logs.
- Account disablement remains DB-first: local `DISABLED`, append-only Audit and a provider-revocation Outbox request must be atomic before a Worker provider call. Provider failure never re-enables the local account.
- No concrete provider operation may map `disable` to temporary ban or destructive user deletion. The provider session-revocation port remains unavailable until a reviewed non-destructive revoke-by-user mechanism is selected under `OD-036`.
- Service/secret Auth credentials remain Worker-only. Web request composition cannot import or name them.

## Consequences

- R02 can close the request-verification and revoked-session detection portion without guessing the open MFA/session duration/device policy in `OD-019`.
- Production activation remains blocked until Staging proves the real Supabase session schema/capability and `OD-036` selects a supported provider revocation mechanism.
- Supabase-managed schema compatibility is verified by a capability probe and Staging evidence; the migration uses a fixed dynamic reference so a non-Supabase PostgreSQL migration can install while runtime use still fails closed.

## Verification

- Unit tests cover explicit-token projection, provider error normalization, expiry, subject/session mismatch, secret-key rejection, bounded health readiness and metadata exclusion.
- PostgreSQL 16 tests cover exact active session/subject matching, revoked-session denial and overprivileged Identity Resolver LOGIN rejection.
- Architecture tests keep Supabase SDK imports inside provider adapters and service credentials outside Web/UI/request packages.
- Staging evidence must include live login, `getUser + getClaims`, active-session resolution, logout/revoke rejection and disabled-account rejection.

## References

- [Supabase Auth user sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase JavaScript `getUser`](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Supabase JavaScript `getClaims`](https://supabase.com/docs/reference/javascript/auth-getclaims)
- [Supabase user management and access-token revocation limits](https://supabase.com/docs/guides/auth/managing-user-data)
