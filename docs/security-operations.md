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
| `OD-035` numeric recovery/backup values are approved but actual monitoring/evidence stable IDs, incident/recovery approver/executor actor UUIDs and drill proof are unbound | Versioned policy snapshot with disjoint approver/executor bindings plus RPO 60m/RTO 240m isolated recovery evidence |
| `OD-019` policy values are approved but provider enforcement lacks Staging proof | Versioned policy snapshot and TOTP `aal2`/session/device enforcement evidence |
| `OD-036` mechanism and residual risk are approved but live target-JWT/global-sign-out capability is unproved | Versioned policy snapshot, trusted binding, audited retry/reconciliation and Staging logout proof |

These blockers prevent production activation, but do not cause the repository to invent credentials, provider behavior, company policy values or unsafe placeholder handlers.

The R03 repository implementation closes the code-composition portion of the five-handler blocker: four internal-only typed draft handlers and the exact assigned WBS progress handler run through the same trusted PostgreSQL transaction as command registration and terminal evidence. Same-ID concurrent replay is serialized with a transaction-scoped advisory lock; stale versions produce safe immutable conflicts and authorization/state failures remain stable denials. Production activation still requires the PostgreSQL CI matrix and retained Staging readiness evidence against the deployed migration.

### 8.1 R01 request PostgreSQL implementation status

The repository now contains the concrete `pg` request pool, trusted Web composition and live database readiness probe. The adapter requires a deployment-provisioned login that is `NOINHERIT`, `NOBYPASSRLS`, non-superuser and permitted to `SET ROLE youone_request` but no other role; `youone_request` itself stays `NOLOGIN`. It verifies the effective role and `row_security=on`, rejects dirty transaction-local actor context, uses bounded connection/query/statement/idle/idle-in-transaction timeouts and pool size, requires certificate-verifying TLS in production, rejects URL options that could override trusted TLS/timeouts, and destroys a connection that fails the boundary check. Connections with uncertain commit/rollback cleanup are also destroyed instead of returned to the pool, while idle-client failures are handled as stable secretless operational events. The trusted request UnitOfWork applies the role and RLS setting with `SET LOCAL` before ActorContext.

R01 unit and PostgreSQL 16 CI tests cover unsafe superuser and extra-role membership rejection, uncertain rollback destruction, plus actor-context cleanup after both commit and rollback on a reused physical connection. This closes the repository-code portion only. The first blocker remains open until an actual Staging secret provisions the same least-privileged login and the database readiness component returns `ready` with retained review evidence. R03 provides the reviewed offline handlers in the repository; overall production readiness still requires deployed R02 Auth/Identity Resolver and R03 handler-capability evidence.

### 8.2 R02 request Auth and active-session implementation status

The repository contains a concrete publishable-key Supabase request adapter with disabled persistence/refresh, bounded provider calls and explicit-token `getUser + getClaims`. Trusted ActorContext creation now passes the verified `session_id` into a separate least-privileged Identity Resolver pool. The resolver returns identity only when `auth.sessions.id` belongs to the exact verified subject, and fails closed if the provider session capability is absent or incompatible. Auth readiness requires both a non-redirected GoTrue health response and the resolver capability probe; a configured URL/key or an unrelated HTTP 200 alone is never ready. Browser `NEXT_PUBLIC_SUPABASE_URL` and server `SUPABASE_URL` must identify the same project and are checked during deployment review; server readiness never trusts the browser-visible setting as its authority. Cached server adapters are configuration-bound and fail closed if a running process observes changed connection or tenant settings, requiring a controlled restart after secret/configuration rotation.

The request-verification portion is implemented, but Staging live-login/logout evidence remains required. Account disable/revoke orchestration is not mapped to Supabase ban or delete: ban leaves existing sessions active and delete is not reversible disablement. The user approved `SUPABASE_GLOBAL_SIGN_OUT_WITH_TARGET_JWT`, exact `auth.sessions` verification on every request, a maximum 60-minute residual token risk, three retries and 15-minute reconciliation on 2026-08-23. The blocker remains open until a versioned approval snapshot binds the actual approver and Staging proves trusted target JWT acquisition, exact subject/session/issuer binding, global sign-out and post-sign-out session absence without retaining the JWT. Staging must also prove that the selected Supabase plan supports time-box/inactivity/single-session, measure refresh/JWT-expiry enforcement latency up to the approved 60-minute JWT lifetime, and treat new-device/managed-device enforcement as a separate application/device-trust capability that fails closed when absent.

Issue `#58` adds the first operational browser/server Auth slice: same-origin plus double-submit CSRF, HttpOnly strict cookies, password login, TOTP enroll/verify, refresh, generic recovery request, global sign-out invocation and a current-session endpoint that reuses the trusted ActorContext chain. Provider credentials and factor/session identifiers are absent from response and fixed-field log schemas. Distributed rate-limit code is now composed and `OD-039` values are approved, but it remains operationally fail-closed until the exact rules and two-person approval evidence are provisioned; recovery confirmation, device trust/step-up, actual Staging configuration and live evidence also remain required.

The next `#58` slice implements exact post-sign-out confirmation without retaining a JWT. The logout target comes only from the AAL2 trusted ActorContext; a resolver-only capability checks the exact subject/session row up to three times. Confirmed absence or a failed/unresolved check is audited, and the latter schedules a typed event at the approved 15-minute interval in the same transaction. A trigger rejects any event whose subject is not the authenticated `UserAccount`, whose session differs from transaction-local `app.session_id`, or whose retry/cadence differs from `3 / 15`. The Worker reconciliation consumer, incident escalation and live Staging evidence remain production blockers.

The B01 limiter places an application-owned distributed gate before login, logout, TOTP enroll/verify, refresh and recovery provider calls. Login/recovery HMAC the normalized identifier; successful login creates a separate 256-bit nonce and signs it with a deployment-secret HMAC over the `YOUONE_AUTH_RATE_SUBJECT_V1` context. The HttpOnly strict cookie stores `nonce.signature`; every later session mutation verifies that MAC in constant time before limiter or Provider dispatch and uses only the authenticated nonce. Supabase access/refresh rotation and client-supplied replacement values therefore cannot reset its subject bucket. PostgreSQL atomically consumes subject/global buckets and appends the decision; the result row can append only after matching consume evidence and both reference the exact policy UUID. The database recomputes a canonical six-rule hash and requires one completed ApprovalInstance with distinct active `ADMIN_SECURITY` agreement and `POSITION_LAB_DIRECTOR` approval, including exact assignment/action evidence. Post-provider application or outcome-audit failure triggers best-effort global session compensation. FORCE RLS and explicit revokes keep all policy, approval and bucket tables outside Data API/request direct access. Approved `OD-039` rules are LOGIN `900/5/100`, LOGOUT `60/10/300`, MFA_ENROLL `900/3/30`, MFA_VERIFY `300/5/100`, RECOVERY `3600/3/30`, REFRESH `60/10/500` (`seconds/subject/global`). Actual actors/evidence and deployment secret remain intentionally absent.

The bound Primary received M11-M16, R02/R03/R06 and all three B01 forward-fixes in repository order on 2026-08-25. The Data API-role revocation and search-path hardening removed the former 248 executable-definer warnings and five search-path warnings. Post-apply SQL reports zero public tables without RLS and zero public `SECURITY DEFINER` functions executable by `anon`/`authenticated`; Security Advisor has zero WARN/ERROR and retains only deny-by-default `rls_enabled_no_policy` INFO. This proves the upgrade application path only; clean/forward-fix evidence and live least-privilege connection probes remain required.

### 8.3 R04 Private Storage and recovery implementation status

The repository contains a Worker-only Supabase Storage SDK adapter with a bounded provider client, explicit service-role-key validation, configuration-bound private bucket allowlist and live `public=false` capability probe. Cursor pagination, provider key validation, byte download, existence check and `upsert=false` upload are concrete. The recovery coordinator creates exact size/SHA-256 evidence for every object, validates all artifacts before the first restore write, rejects the source instance and non-empty targets, re-downloads restored objects and calls the versioned manifest verifier. Worker readiness now reports separate database and private-storage components and stays `not_ready` when either concrete probe is missing or fails.

This closes the repository-code portion only. The production blocker remains open until two actual non-production Supabase projects complete the same no-public-object restore drill, the resulting evidence is retained, and the R05 Staging E2E gate accepts it. The user approved RPO 60 minutes, RTO 240 minutes, database backup every 60 minutes retained 14 days, and Storage backup every 60 minutes retained 30 days on 2026-08-23. On 2026-08-25 the user approved the monitoring stable IDs, `OPS_EVIDENCE_PRIVATE_PRIMARY`, and a cost-sensitive encrypted Google Drive private backup destination. The private Drive root and separate manifest/DB/Storage/evidence/drill folders exist and are not shared; their provider IDs and OAuth credentials are restricted runtime configuration, not repository or release-artifact fields. Actual incident owner and disjoint recovery approver/executor sets remain unbound, the hourly Drive API job is not yet credentialed, and no Staging drill has proved the objectives. Database restore evidence must include custom Web/Identity Resolver/Worker login password reprovisioning and subsequent readiness verification because provider database backups do not restore custom role passwords.

## 9. Release evidence packet

The release PR must attach the CI run for quality, M07–M16 and R01–R05 jobs, production build, PWA/mobile verification, the versioned Staging evidence packet and this blocker table. Promotion from `dev` to `main` remains a separate user-approved release gate.

### 9.1 R05 integrated readiness and Staging harness status

R05 adds the concrete minimum-privilege Worker PostgreSQL pool and exact five-component deployment readiness contract. The Worker login must be `NOINHERIT`, non-superuser, `NOBYPASSRLS`, own no database object, set only `youone_privileged_writer`, have no direct business-table privilege and expose the exact Outbox capability. Both Worker probes are time-bounded. Web/Worker readiness payloads with missing, duplicate, inconsistent or non-stable reason fields become `DEPLOYMENT_READINESS_PAYLOAD_INVALID` without echoing provider data.

The Staging runner rejects non-Staging, Preview, localhost and credential-bearing targets. Its evidence schema records only a stable environment ID, exact commit SHA, UTC interval, correlation ID, five readiness results, the required actor/Scope/immutability/concurrency/offline/PWA/mobile/recovery matrix and artifact SHA-256 values. Missing configuration returns a small `BLOCKED` record; a live failed readiness returns `NOT_READY`; only a credential-backed live run with every required check passing and retained artifact digests can return `READY`.

Repository CI validates this behavior and the Worker DB principal against PostgreSQL 16, but it is not Staging proof. The live executor, non-production credentials and retained artifacts are absent from the repository, so the activation blockers remain open. Execution and evidence-preservation steps are in `docs/staging-e2e.md`.

### 9.2 R06 operations policy and release evidence status

R06 requires approved versioned snapshots for `OD-019`, `OD-035` and `OD-036`. The user approved the policy values on 2026-08-23 as recorded in `docs/r06-release-gate.md`, but the actual approver `UserAccount` UUID, monitoring/evidence destinations, operations actor bindings and approval evidence digest are not yet assembled into effective snapshots. Each snapshot must be unrevoked and satisfy `createdAt <= approvedAt <= effectiveFrom <= evaluatedAt`; a pending/revoked approval, version mismatch, missing approver/evidence digest, null/placeholder value, future effective time, duplicate/unsupported value or backup cadence worse than the selected RPO fails closed. Each approval artifact also carries `approvedPolicySha256`; R06 canonicalizes and hashes the complete approval-excluded policy body and requires an exact match. OD-035 requires non-empty, disjoint recovery approver/executor actor sets. No provider credential is seeded in the repository.

The exact 27-item release evidence set covers quality, M07–M16, R01–R05, migration clean/upgrade/rollback-or-forward-fix, DB+Storage recovery, Staging E2E, PWA/mobile, critical/high-zero and three policy snapshots. Missing, duplicate, unknown, substituted or wrong-source evidence fails closed. Every reference, the R05 packet and the trusted promotion source must identify the same candidate commit. R06 reads each closed-ID artifact itself, recomputes raw SHA-256, reparses the R05 packet and recomputes its documented canonical digest before validating exact environment, five live readiness components, every required PASS check and artifact digest. It also parses `RECOVERY_DB_STORAGE`, binds its internal candidate commit to both the R06 candidate and trusted promotion source, requires `YOUONE_STAGING_PRIMARY → YOUONE_STAGING_RECOVERY`, compares its migration head with the head derived from the candidate checkout, binds it to the approved OD-035 payload, requires the actual approver/executors to belong to their approved disjoint sets and verifies completion within the approved RTO.

For `OD-036`, the target-token binder accepts no request-body user ID. It binds provider-verified JWT `sub`, UUID `session_id` and issuer to the server-loaded `USER_ACCOUNT` auth subject and the exact active provider session. Global sign-out is audit-wrapped and the same session is resolved again to prove removal. Provider/validator/internal failures expose only stable errors. The CLI emits only `BLOCKED` or `READY_FOR_RELEASE_PR`; all parse/read/internal failures use `BLOCKED` and a non-zero exit. Raw validation input is excluded from stdout, stderr, exceptions, snapshots and retained artifacts.

`READY_FOR_RELEASE_PR` does not update production or `main`; it only permits a separate user-approved promotion PR. Policy content is approved, but effective policy snapshots with actual actor/stable-ID bindings and live Staging artifacts are absent, so the production activation result remains `BLOCKED`. The checklist and execution contract are in `docs/r06-release-gate.md`.
