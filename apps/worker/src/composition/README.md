# Worker Composition Boundary

Only the worker composition root may assemble worker-only adapters. Job handlers call Application use cases and must not update Feature tables directly.

- `WORKER_DATABASE_URL` identifies a dedicated `NOINHERIT`, `NOBYPASSRLS`, non-superuser login that can set only `youone_privileged_writer` and owns no database object.
- Worker DB readiness verifies the effective role, `row_security=on`, no direct business-table privilege, clean transaction context and exact Outbox capability.
- Private Storage readiness verifies every configured bucket is live and private.
- Readiness probes are bounded and never become ready from environment-variable presence alone.
- `staging:e2e` refuses non-Staging and Preview targets and emits only the versioned allowlisted evidence contract described in `docs/staging-e2e.md`.
- `release:verify` accepts only approved versioned `OD-019`/`OD-035`/`OD-036` snapshots and the exact allowlisted evidence set. It never promotes a branch; `READY_FOR_RELEASE_PR` still requires explicit user approval.
