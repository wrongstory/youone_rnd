# Security and Operations Gate

## 1. Purpose and release status

`M16-SECURITY-OPERATIONS-V1` is the final P0 integration gate. It verifies application authorization, PostgreSQL RLS, immutable evidence, concurrency, recovery, PWA safety and operational observability as one release-candidate boundary.

Passing repository tests does not itself authorize production activation. The current repository intentionally remains **not ready for production traffic** until every item in section 8 is closed with staging evidence. Preview data is never operational data.

## 2. Trusted request boundary

- `/api/v1/sync/commands` accepts identity only from a `Bearer` session. Actor, organization, vendor, Project, Contract, permission and Scope values in request JSON are not evidence.
- A server verifier must validate the Supabase user and claims and must receive a provider-issued non-empty `session_id`. The separate Identity Resolver must also match that ID to the same subject in the current `auth.sessions` record on every request. Subject-derived session fallback is prohibited. Provider errors, revoked users, malformed expiry, missing/cross-subject sessions and unavailable session capability fail closed.
- The server reloads the active `UserAccount`, effective assignments, VendorMembership and typed Scope at request time. Acting authority is an explicit UUID selection and is revalidated; Vendor actors cannot select it.
- Caller correlation IDs are restricted to a short safe character set. Invalid values are replaced. The returned `X-Correlation-Id` links HTTP, Application, database audit and operational logs.
- Offline command bodies must be `application/json`, at most 32,768 UTF-8 bytes, structurally allowlisted, canonical-hash verified and bound to the current actor/session. Online-only commands remain rejected.
- Reviewed Application handlers must exist for each enabled offline command and must recheck authorization, exact Scope, aggregate state, preconditions and optimistic version. No generic “mark applied” fallback is permitted.

## 3. Privileged provider boundary

Supabase service operations are server-only and are not authorized by a route flag or a structurally similar object. A privileged Auth operation requires all of the following:

1. `TrustedActorContext` created from the live verified session and current database records.
2. Server-loaded `TrustedResourceContext` for the exact resource.
3. An exact `ALLOW` decision carrying provenance for the same actor, action and resource.
4. The target `USER_ACCOUNT` auth subject loaded from the trusted resource, never from request JSON.
5. A mandatory audit wrapper that records success or failure around the provider call.

Service-role credentials remain isolated from request/UI imports. Provider SDK absence must produce an unavailable readiness component, not a permissive fallback.

Private Storage backup/restore uses the separate Worker-only service entry point. It accepts only a configured private-bucket allowlist, verifies each bucket's live `public=false` setting, rejects unsafe/absolute/traversal keys, paginates all objects and never creates a public URL. Restore requires a different Storage instance and an empty configured target, validates every artifact byte before the first write, uploads with provider overwrite disabled, then re-downloads and hashes the complete target. A partial provider failure makes the isolated target unusable; it is not automatically deleted or retried over because that would erase recovery evidence.

## 4. Health, logging and alerting contract

- `GET /api/health/live` answers only whether the web process is alive.
- `GET /api/health/ready` is `503 not_ready` until request DB, request Auth and offline-sync compositions are actually assembled. Environment-variable presence alone does not make an adapter ready.
- Both probes are `private, no-store` and expose reason codes only, never connection strings, tokens or tenant secrets.
- Security logs use a fixed allowlist: timestamp, level, stable event, correlation ID, route, outcome and HTTP status. Request/response bodies, bearer tokens, cookies, personal data, Storage keys and signed URLs have no log field.
- Production monitoring must alert on readiness loss, repeated authentication/binding failure, cross-vendor denial spikes, immutable-write attempts, audit persistence failure, job retry exhaustion and backup/restore verification failure.

## 5. Database and evidence gate

The M16 PostgreSQL job applies the complete ordered migration chain against a clean PostgreSQL 16 database and checks an upgrade fixture. It then verifies:

- every business table has `FORCE ROW LEVEL SECURITY`;
- request, privileged writer and identity resolver roles are `NOBYPASSRLS` and have no direct business-table mutation grants;
- missing, disabled, expired and cross-vendor actors fail closed;
- offline command ownership and current session binding are exact;
- audit, transition, outbox, approval/document/note/copy and sync evidence cannot be updated or deleted;
- failed mutations do not leave audit, transition or outbox residue;
- concurrent commands have one winner and preserve the losing attempt as a deterministic conflict/failure result.

## 6. Backup and recovery runbook

Every recoverable backup set consists of a PostgreSQL dump plus one versioned Storage manifest. The manifest records the migration head, DB artifact size/SHA-256, completion time and every private bucket/object key with exact size/SHA-256. Public URLs, absolute keys, traversal paths, duplicates and count drift are invalid.

Recovery rehearsal:

1. Select an isolated restore environment and verify its database name and credentials are non-production.
2. Verify the backup artifact SHA-256 and Storage manifest before restore.
3. Restore PostgreSQL with owner/ACL portability options and fail on the first error.
4. Restore private Storage objects without making a bucket public or issuing recipient URLs.
5. Compare migration head, business-table count, RLS-enabled table count and designated evidence fixtures.
6. Hash every restored Storage object and compare size/hash/count against the manifest.
7. Run authentication, Vendor isolation, sensitive projection and immutable-record smoke tests.
8. Record operator, start/end time, backup ID, target, results, exceptions and approval as append-only recovery evidence.
9. Destroy the isolated rehearsal target only after evidence is retained.

CI performs a clean migration/upgrade and full PostgreSQL dump/restore rehearsal. R04 also exercises the concrete Supabase SDK boundary through a deterministic provider contract and performs a manifest-backed byte-for-byte Storage backup/restore rehearsal against isolated fake instances. A staging drill with actual Supabase projects and retained operator evidence remains mandatory before production activation.

## 7. Incident actions

- **Compromised/disabled account:** disable through the audited service boundary, revoke sessions, expire VendorMembership/Scope where applicable and confirm immediate RLS denial.
- **Suspected cross-vendor exposure:** disable the affected external accounts and grants, preserve logs/audit evidence, identify exact projections/objects, notify the security owner and do not purge evidence.
- **L3/L4 copy incident:** block further render/handover, start controlled-copy recovery, preserve custody history and follow the approved return/destruction route. Do not grant Admin-System source access.
- **Audit or readiness failure:** remove the service from readiness, stop state-changing traffic, preserve correlation evidence and recover through a reviewed forward fix.
- **Credential rotation:** rotate provider/database secrets in the deployment secret store, restart affected server-only runtimes and validate old credential rejection plus new readiness. Never commit secret values.
- **Recovery activation:** use the verified manifest procedure above; do not restore over a live database or automatically overwrite a newer environment.

## 8. Production activation blockers

| Blocker | Required closure evidence |
|---|---|
| Concrete least-privileged PostgreSQL pool/composition lacks Staging proof | Reviewed request adapter, transaction-local ActorContext/RLS tests and staging readiness `ready` |
| Concrete Supabase request Auth/active-session composition lacks Staging proof | Live user+claims+exact active-session verification, logout/revocation and expiry tests |
| Five reviewed offline handlers lack deployed Staging proof | Per-command authorization/Scope/state/version/conflict integration tests and handler capability readiness |
| Live WBS adapter mapping is absent | `projectScopeProjectId`, valid-from and valid-until loaded from trusted ProjectScope, never from the command |
| Actual Supabase private Storage backup/restore is not drilled | Manifest-backed staging restore evidence and no-public-object test |
| Production RPO, RTO, backup retention, monitoring destinations and incident owners are unapproved | Approved `OD-035` operations policy version |
| MFA/session/device policy remains open | Approved `OD-019` policy and provider enforcement evidence |
| Non-destructive provider revoke-all-by-user operation is unresolved | Approved `OD-036` mechanism, Worker adapter and audited retry/reconciliation evidence |

These blockers prevent production activation, but do not cause the repository to invent credentials, provider behavior, company policy values or unsafe placeholder handlers.

The R03 repository implementation closes the code-composition portion of the five-handler blocker: four internal-only typed draft handlers and the exact assigned WBS progress handler run through the same trusted PostgreSQL transaction as command registration and terminal evidence. Same-ID concurrent replay is serialized with a transaction-scoped advisory lock; stale versions produce safe immutable conflicts and authorization/state failures remain stable denials. Production activation still requires the PostgreSQL CI matrix and retained Staging readiness evidence against the deployed migration.

### 8.1 R01 request PostgreSQL implementation status

The repository now contains the concrete `pg` request pool, trusted Web composition and live database readiness probe. The adapter requires a deployment-provisioned login that is `NOINHERIT`, `NOBYPASSRLS`, non-superuser and permitted to `SET ROLE youone_request` but no other role; `youone_request` itself stays `NOLOGIN`. It verifies the effective role and `row_security=on`, rejects dirty transaction-local actor context, uses bounded connection/query/statement/idle/idle-in-transaction timeouts and pool size, requires certificate-verifying TLS in production, rejects URL options that could override trusted TLS/timeouts, and destroys a connection that fails the boundary check. Connections with uncertain commit/rollback cleanup are also destroyed instead of returned to the pool, while idle-client failures are handled as stable secretless operational events. The trusted request UnitOfWork applies the role and RLS setting with `SET LOCAL` before ActorContext.

R01 unit and PostgreSQL 16 CI tests cover unsafe superuser and extra-role membership rejection, uncertain rollback destruction, plus actor-context cleanup after both commit and rollback on a reused physical connection. This closes the repository-code portion only. The first blocker remains open until an actual Staging secret provisions the same least-privileged login and the database readiness component returns `ready` with retained review evidence. R03 provides the reviewed offline handlers in the repository; overall production readiness still requires deployed R02 Auth/Identity Resolver and R03 handler-capability evidence.

### 8.2 R02 request Auth and active-session implementation status

The repository contains a concrete publishable-key Supabase request adapter with disabled persistence/refresh, bounded provider calls and explicit-token `getUser + getClaims`. Trusted ActorContext creation now passes the verified `session_id` into a separate least-privileged Identity Resolver pool. The resolver returns identity only when `auth.sessions.id` belongs to the exact verified subject, and fails closed if the provider session capability is absent or incompatible. Auth readiness requires both a non-redirected GoTrue health response and the resolver capability probe; a configured URL/key or an unrelated HTTP 200 alone is never ready. Browser `NEXT_PUBLIC_SUPABASE_URL` and server `SUPABASE_URL` must identify the same project and are checked during deployment review; server readiness never trusts the browser-visible setting as its authority. Cached server adapters are configuration-bound and fail closed if a running process observes changed connection or tenant settings, requiring a controlled restart after secret/configuration rotation.

The request-verification portion is implemented, but Staging live-login/logout evidence remains required. Account disable/revoke orchestration is intentionally not mapped to Supabase ban or delete: ban leaves existing sessions active and delete is not reversible disablement. Until `OD-036` selects a supported revoke-by-user operation, the service adapter remains unavailable and the related production activation blocker stays open.

### 8.3 R04 Private Storage and recovery implementation status

The repository contains a Worker-only Supabase Storage SDK adapter with a bounded provider client, explicit service-role-key validation, configuration-bound private bucket allowlist and live `public=false` capability probe. Cursor pagination, provider key validation, byte download, existence check and `upsert=false` upload are concrete. The recovery coordinator creates exact size/SHA-256 evidence for every object, validates all artifacts before the first restore write, rejects the source instance and non-empty targets, re-downloads restored objects and calls the versioned manifest verifier. Worker readiness now reports separate database and private-storage components and stays `not_ready` when either concrete probe is missing or fails.

This closes the repository-code portion only. The production blocker remains open until two actual non-production Supabase projects complete the same no-public-object restore drill, the resulting evidence is retained, and the R05 Staging E2E gate accepts it. Backup destination, schedule, retention, RPO/RTO and responsible owners remain governed by open `OD-035`; the code does not invent those production values.

## 9. Release evidence packet

The release PR must attach the CI run for quality, M07–M16 and R01–R05 jobs, production build, PWA/mobile verification, the versioned Staging evidence packet and this blocker table. Promotion from `dev` to `main` remains a separate user-approved release gate.

### 9.1 R05 integrated readiness and Staging harness status

R05 adds the concrete minimum-privilege Worker PostgreSQL pool and exact five-component deployment readiness contract. The Worker login must be `NOINHERIT`, non-superuser, `NOBYPASSRLS`, own no database object, set only `youone_privileged_writer`, have no direct business-table privilege and expose the exact Outbox capability. Both Worker probes are time-bounded. Web/Worker readiness payloads with missing, duplicate, inconsistent or non-stable reason fields become `DEPLOYMENT_READINESS_PAYLOAD_INVALID` without echoing provider data.

The Staging runner rejects non-Staging, Preview, localhost and credential-bearing targets. Its evidence schema records only a stable environment ID, exact commit SHA, UTC interval, correlation ID, five readiness results, the required actor/Scope/immutability/concurrency/offline/PWA/mobile/recovery matrix and artifact SHA-256 values. Missing configuration returns a small `BLOCKED` record; a live failed readiness returns `NOT_READY`; only a credential-backed live run with every required check passing and retained artifact digests can return `READY`.

Repository CI validates this behavior and the Worker DB principal against PostgreSQL 16, but it is not Staging proof. The live executor, non-production credentials and retained artifacts are absent from the repository, so the activation blockers remain open. Execution and evidence-preservation steps are in `docs/staging-e2e.md`.
