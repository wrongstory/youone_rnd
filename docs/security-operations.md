# Security and Operations Gate

## 1. Purpose and release status

`M16-SECURITY-OPERATIONS-V1` is the final P0 integration gate. It verifies application authorization, PostgreSQL RLS, immutable evidence, concurrency, recovery, PWA safety and operational observability as one release-candidate boundary.

Passing repository tests does not itself authorize production activation. The current repository intentionally remains **not ready for production traffic** until every item in section 8 is closed with staging evidence. Preview data is never operational data.

## 2. Trusted request boundary

- `/api/v1/sync/commands` accepts identity only from a `Bearer` session. Actor, organization, vendor, Project, Contract, permission and Scope values in request JSON are not evidence.
- A server verifier must validate the Supabase user and claims and must receive a provider-issued non-empty `session_id`. Subject-derived session fallback is prohibited. Provider errors, revoked users, malformed expiry and missing sessions fail closed.
- The server reloads the active `UserAccount`, effective assignments, VendorMembership and typed Scope at request time. Acting authority is an explicit UUID selection and is revalidated; Vendor actors cannot select it.
- Caller correlation IDs are restricted to a short safe character set. Invalid values are replaced. The returned `X-Correlation-Id` links HTTP, Application, database audit and operational logs.
- Offline command bodies must be `application/json`, at most 64 KiB, structurally allowlisted, canonical-hash verified and bound to the current actor/session. Online-only commands remain rejected.
- Reviewed Application handlers must exist for each enabled offline command and must recheck authorization, exact Scope, aggregate state, preconditions and optimistic version. No generic “mark applied” fallback is permitted.

## 3. Privileged provider boundary

Supabase service operations are server-only and are not authorized by a route flag or a structurally similar object. A privileged Auth operation requires all of the following:

1. `TrustedActorContext` created from the live verified session and current database records.
2. Server-loaded `TrustedResourceContext` for the exact resource.
3. An exact `ALLOW` decision carrying provenance for the same actor, action and resource.
4. The target `USER_ACCOUNT` auth subject loaded from the trusted resource, never from request JSON.
5. A mandatory audit wrapper that records success or failure around the provider call.

Service-role credentials remain isolated from request/UI imports. Provider SDK absence must produce an unavailable readiness component, not a permissive fallback.

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

CI performs a clean migration/upgrade and full PostgreSQL dump/restore rehearsal. A staging drill with the actual Supabase Storage adapter remains mandatory before production activation.

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
| Concrete least-privileged PostgreSQL pool/composition is absent | Reviewed request adapter, transaction-local ActorContext/RLS tests and staging readiness `ready` |
| Concrete Supabase request Auth API/SDK composition is absent | Live user+claims+session verification, revocation and expiry tests |
| Reviewed handlers for the five offline command types are not composed | Per-command authorization/Scope/state/version/conflict integration tests |
| Live WBS adapter mapping is absent | `projectScopeProjectId`, valid-from and valid-until loaded from trusted ProjectScope, never from the command |
| Actual Supabase private Storage backup/restore is not drilled | Manifest-backed staging restore evidence and no-public-object test |
| Production RPO, RTO, backup retention, monitoring destinations and incident owners are unapproved | Approved `OD-035` operations policy version |
| MFA/session/device policy remains open | Approved `OD-019` policy and provider enforcement evidence |

These blockers prevent production activation, but do not cause the repository to invent credentials, provider behavior, company policy values or unsafe placeholder handlers.

## 9. Release evidence packet

The release PR must attach the CI run for quality, M07–M16 PostgreSQL jobs, production build, PWA/mobile verification and this blocker table. Promotion from `dev` to `main` remains a separate user-approved release gate.
