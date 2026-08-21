# PostgreSQL and RLS Tests

`tests/m02/postgres.integration.test.ts` is the executable M02 harness.

- Without `TEST_DATABASE_URL`, only the PostgreSQL suite is explicitly skipped.
- The URL must point to an empty, dedicated database whose name contains `test`.
- `PSQL_BIN` may override the `psql` executable.
- CI must provide both values so this suite cannot skip.

It validates an upgrade fixture, clean migration, append-only evidence, direct
request-role denial, transaction rollback, forbidden payload keys, and concurrent
optimistic updates.
