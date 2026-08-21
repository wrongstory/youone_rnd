# PostgreSQL and RLS Tests

`tests/m02/postgres.integration.test.ts` is the executable M02 harness.

`tests/m03/postgres.integration.test.ts` is the executable M03 Identity/RBAC/RLS harness. It uses the separate `M03_TEST_DATABASE_URL` because both suites apply global `public` migrations and must not race on one database.

- Without its matching database URL, that PostgreSQL suite is explicitly skipped.
- The URL must point to an empty, dedicated database whose name contains `test`.
- `PSQL_BIN` may override the `psql` executable.
- CI provides `TEST_DATABASE_URL` and `M03_TEST_DATABASE_URL`, so neither PostgreSQL suite may skip.

It validates an upgrade fixture, clean migration, append-only evidence, direct
request-role denial, transaction rollback, forbidden payload keys, and concurrent
optimistic updates.

The M03 suite validates active/disabled/expired actors and Vendors, exact/cross/revoked membership, account-kind and primary-position integrity, acting-authority revalidation, direct request-role write denial, atomic audited lifecycle changes, optimistic stale rejection, and rejection of caller-controlled historical authorization time.
