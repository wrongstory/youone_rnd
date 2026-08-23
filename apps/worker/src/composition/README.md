# Worker Composition Boundary

Only the worker composition root may assemble worker-only adapters. Job handlers call Application use cases and must not update Feature tables directly.

- `WORKER_DATABASE_URL` identifies a dedicated `NOINHERIT`, `NOBYPASSRLS`, non-superuser login that can set only `youone_privileged_writer` and owns no database object.
- Worker DB readiness verifies the effective role, `row_security=on`, no direct business-table privilege, clean transaction context and exact Outbox capability.
- Private Storage readiness verifies every configured bucket is live and private.
- Readiness probes are bounded and never become ready from environment-variable presence alone.
- `staging:e2e` refuses non-Staging and Preview targets and emits only the versioned allowlisted evidence contract described in `docs/staging-e2e.md`.
- `release:verify` reads the exact 27 allowlisted artifact files, recomputes every raw SHA-256 and the R05 canonical digest, and binds all evidence to the trusted promotion-source commit. It accepts only effective, unrevoked, version-matched `OD-019`/`OD-035`/`OD-036` snapshots whose `approvedPolicySha256` exactly matches the canonical approval-excluded policy payload. OD-035 also requires disjoint approved recovery approver/executor sets and parses the actual recovery drill actor/timing evidence. It never promotes a branch; `READY_FOR_RELEASE_PR` still requires explicit user approval.
- The CLI stdout contract is exactly `BLOCKED` or `READY_FOR_RELEASE_PR`. Parse/read/validator/provider failures remain `BLOCKED` with a non-zero exit and no input value in stdout, stderr or validation output.
