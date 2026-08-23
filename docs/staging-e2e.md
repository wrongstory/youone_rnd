# R05 Staging E2E Runbook

## 1. Status

`R05-STAGING-E2E-V1` is a repeatable evidence harness, not proof that Staging has already passed. Repository and CI contract tests may validate the harness, but only a credential-backed run against reviewed non-production deployments can produce a `READY` evidence packet.

## 2. Safety preconditions

- `DEPLOYMENT_STAGE` must be exactly `staging`.
- `YOUONE_PREVIEW_DATA` must not be `enabled`.
- `STAGING_WEB_BASE_URL` must be a credential-free HTTPS origin. Localhost, URL credentials, path, query and fragment are rejected.
- `STAGING_ENVIRONMENT_ID` is a non-secret stable deployment label, not a URL or credential.
- `STAGING_COMMIT_SHA` is the exact 40-character commit deployed to Staging.
- Web uses request-only DB/Auth credentials. Worker uses the separate minimum-privilege Worker DB login and service-role Storage credential. Values remain in the deployment secret store and are never written into evidence.
- The actual Storage restore target is a different reviewed non-production project and starts empty.

## 3. Required environment

Use `apps/worker/.env.example` as the name inventory. Required secret-bearing variables are injected by the deployment platform; do not commit a populated env file.

Web readiness requires `REQUEST_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `IDENTITY_RESOLVER_DATABASE_URL`. Worker readiness requires `WORKER_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_PRIVATE_BUCKETS`.

Run from the reviewed commit:

```text
pnpm --filter @youone/worker staging:e2e
```

The command writes one evidence JSON object to stdout and a fixed-field operational result to stderr. A non-`READY` result exits non-zero. Until a reviewed live check executor supplies every required check and artifact digest, the runner deliberately returns `BLOCKED`.

## 4. Required evidence matrix

Every item must be `PASS` with a SHA-256 digest of retained evidence:

- active internal login and trusted ActorContext;
- active Vendor login with exact Scope;
- disabled and expired actor denial;
- cross-Vendor/Project denial and forbidden-field redaction;
- Approval/DocumentVersion/ResearchNote/controlled-copy immutability;
- concurrent Approval single-winner behavior;
- offline conflict without automatic overwrite;
- HTTP → Application → database audit → Worker correlation continuity;
- secretless logging and readiness failure matrix;
- PWA installability and 375 px primary mobile flow;
- manifest-backed Private Storage restore.

## 5. Evidence handling

The versioned JSON packet contains only the environment label, commit SHA, UTC range, correlation ID, exact readiness components, stable result codes and SHA-256 artifact digests. It has no field for tokens, cookies, request bodies, personal data, database URLs, Storage object keys or signed URLs.

Retain the packet and referenced artifacts under the approved operations evidence location. Do not mark the release ready when the runner returns `BLOCKED` or `NOT_READY`, when a digest cannot be resolved, or when actual source/restore credentials and targets were not independently reviewed.

## 6. Current blocker

No Staging credentials or reviewed live matrix executor are stored in this repository. Therefore repository completion of R05 does not close the production activation blockers in `docs/security-operations.md`. R06 must attach an actual retained run and approved `OD-019`, `OD-035` and `OD-036` outcomes before release promotion can be considered.
