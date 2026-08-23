# Web Composition Boundary

This directory is the only web location that may assemble concrete request-safe adapters.

- PostgreSQL imports must use `@youone/infra-postgres/request`.
- `REQUEST_DATABASE_URL` must identify a dedicated `NOINHERIT`, `NOBYPASSRLS`, non-superuser login that can only `SET ROLE youone_request`; the runtime activates that role with `SET LOCAL` for every request transaction.
- The concrete pool verifies the login role, effective request role, `row_security=on`, and an empty transaction-local actor context before it is considered ready.
- Production database TLS is `verify-full`; disabling it is limited to non-production local integration environments.
- Worker/service-role entries and credentials are forbidden.
- Route, Server Action, and UI code call Application use cases; they do not resolve repositories directly.
