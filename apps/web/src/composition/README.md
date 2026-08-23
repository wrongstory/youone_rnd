# Web Composition Boundary

This directory is the only web location that may assemble concrete request-safe adapters.

- PostgreSQL imports must use `@youone/infra-postgres/request`.
- `REQUEST_DATABASE_URL` must identify a dedicated `NOINHERIT`, `NOBYPASSRLS`, non-superuser login that can only `SET ROLE youone_request`; the runtime activates that role with `SET LOCAL` for every request transaction.
- The concrete pool verifies the login role, effective request role, `row_security=on`, and an empty transaction-local actor context before it is considered ready.
- Production database TLS is `verify-full`; disabling it is limited to non-production local integration environments.
- Connection URLs may contain no query options except a matching `sslmode=verify-full` (or local-only `sslmode=disable`); the adapter removes it before passing the URL to `pg` so URL parsing cannot override trusted TLS and timeout configuration.
- A connection is destroyed when commit/rollback cleanup is uncertain; idle-client failures are consumed and recorded only as stable secretless operational events.
- Request Auth uses only `SUPABASE_PUBLISHABLE_KEY`, disables SDK persistence/refresh, and passes each bearer token explicitly to `getUser` and `getClaims`.
- `IDENTITY_RESOLVER_DATABASE_URL` identifies a separate least-privileged LOGIN that can set only `youone_identity_resolver`; it verifies the exact provider subject/session before loading ActorContext.
- Auth readiness requires both the provider health probe and Identity Resolver principal/session capability probe. Staging live-session evidence remains a separate release gate.
- Browser `NEXT_PUBLIC_SUPABASE_URL` and server `SUPABASE_URL` must identify the same Supabase project. Deployment review verifies this invariant; readiness intentionally uses only the trusted server endpoint and never imports browser configuration as authority.
- Worker/service-role entries and credentials are forbidden.
- Route, Server Action, and UI code call Application use cases; they do not resolve repositories directly.
