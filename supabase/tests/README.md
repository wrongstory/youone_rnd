# PostgreSQL and RLS Tests

`tests/m02/postgres.integration.test.ts` is the executable M02 harness.

`tests/m03/postgres.integration.test.ts` is the executable M03 Identity/RBAC/RLS harness. It uses the separate `M03_TEST_DATABASE_URL` because both suites apply global `public` migrations and must not race on one database.

`tests/m04/postgres.integration.test.ts` is the executable M04 Approval/RLS harness. It applies M02 → M03 → M04 to the separate `M04_TEST_DATABASE_URL` and requires a clean database.

`tests/m05/postgres.integration.test.ts` is the executable M05 Document/File/RLS harness. It applies M02 → M03 → M04 → M05 to the separate `M05_TEST_DATABASE_URL` and requires a clean database.

`tests/m06/postgres.integration.test.ts` is the executable M06 Project/WBS/RLS harness. It applies M02 → M03 → M04 → M05 → M06 to the separate `M06_TEST_DATABASE_URL` and requires a clean database.

- Without its matching database URL, that PostgreSQL suite is explicitly skipped.
- The URL must point to an empty, dedicated database whose name contains `test`.
- `PSQL_BIN` may override the `psql` executable.
- CI provides `TEST_DATABASE_URL`, `M03_TEST_DATABASE_URL`, `M04_TEST_DATABASE_URL`, `M05_TEST_DATABASE_URL`, and `M06_TEST_DATABASE_URL`, so no PostgreSQL suite may skip.

It validates an upgrade fixture, clean migration, append-only evidence, direct
request-role denial, transaction rollback, forbidden payload keys, and concurrent
optimistic updates.

The M03 suite validates active/disabled/expired actors and Vendors, exact/cross/revoked membership, account-kind and primary-position integrity, acting-authority revalidation, direct request-role write denial, atomic audited lifecycle changes, optimistic stale rejection, and rejection of caller-controlled historical authorization time.

The M04 suite validates clean ordered migration, exact policy/subject/line/participant snapshots, request/worker capability separation, Vendor/RLS denial, append-only actions, exact current official authority, delegated-authority expiry/evidence, atomic rollback when outbox persistence fails, exact-subject completion, concurrent one-winner terminal action, every completion mode, and the same-sequence parallel barrier.

The M05 suite validates clean ordered migration, exact composite evidence constraints, FORCE RLS, request/worker capability separation, forbidden direct table writes, and denial of raw editor/private-object/evidence columns.

The M06 suite validates ordinary Project creation by active internal users, Product/member/WBS relational integrity, exact VendorMembership plus Project-grant isolation, Vendor transition restrictions, OD-014 close fail-closed behavior, immutable exact research-application approval subjects, Lab-Director-only consent, typed recall, atomic designation/audit/outbox persistence, and optimistic concurrency.
