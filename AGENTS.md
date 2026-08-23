# AGENTS.md

## Mission

Build the mobile-first PWA 업무관리 system for (주)유원산업기술 기업부설연구소 without weakening its approval, security, contract, evidence, and audit rules.

## Current Phase

`IMPLEMENTATION_ACTIVE`. The user approved the P0 Development Gate on 2026-08-21 (Asia/Seoul). P0 `M00` through `M16` are merged; finish the P0 production-activation Release Gate in GitHub issue `#36`. P1 is planning-only until `P1-SCOPE-V1.0`, the P1 Development Gate, and the P0 release promotion are explicitly approved.

Implementation rules in this phase:

- Keep canonical design documents synchronized with behavior changes.
- Complete vertical slices through Domain, Application, Infrastructure, Interface, and Test where the merge item requires them.
- Do not implement P1/P2-only modules, guessed company forms, or unresolved production policy defaults.
- Do not write DB migrations outside the Platform/Security workstream or before the related ADR and public contracts are approved.

## Branch Workflow

- `dev` is the default integration branch. Start ordinary feature/fix branches from `dev` and target their pull requests to `dev`.
- `main` is release-only. Update it only through an explicit release promotion pull request from `dev` after the release gate is approved.
- Never merge an ordinary feature or workstream branch directly into `main`.

## Source Precedence

1. Latest explicit user decision.
2. `15_Codex_인수인계_마스터_v0.1`.
3. Applicable law, government R&D agreement, and company superior regulations after their actual source text is provided and reviewed.
4. Google Drive sources `00`, `02`, `03`, `04`.
5. Google Drive sources `05`, `06`, `07`.
6. Google Drive annexes `08` through `14`.
7. Source `01` only as historical decision context.

Never silently choose between unresolved sources. Record the conflict in `docs/source-audit.md` and the decision in `docs/open-decisions.md`.

## Canonical Repository Documents

- `PROJECT_MEMORY.md`: stable product memory and current phase.
- `docs/source-audit.md`: source inventory, conflicts, obsolete text, canonical rulings.
- `docs/architecture.md`: module and dependency boundaries.
- `docs/domain-model.md`: aggregates, entities, identifiers, invariants.
- `docs/permissions.md`: authorization and data-scope model.
- `docs/workflows.md`: end-to-end business workflows.
- `docs/erd.md`: logical relational model.
- `docs/state-machines.md`: states, transitions, actors, events, audits.
- `docs/open-decisions.md`: unresolved decisions and blocking level.
- `docs/legal-policy-baseline.md`: versioned initial contract, approval, acceptance/payment, controlled-print, and allowance-tax policies.
- `docs/p0-scope-checklist.md`: user-owned P0/P1/P2 implementation cut and Development Gate confirmation.
- `docs/p1-scope-checklist.md`: user-owned P1 module depth and Development Gate checklist; no P1 code before approval.
- `docs/p1-roadmap.md`: proposed P1 prerequisites, merge order, invariants, verification, and release gates.
- `docs/project-structure.md`: workspace, package, route, dependency, DB, and P0 physical-boundary specification.
- `docs/agent-workstreams.md`: subagent ownership, delivery waves, merge order, handoff packet, and Definition of Done.
- `docs/security-operations.md`: M16 trusted runtime, readiness, logging, recovery, incident, and production-activation gate.

When a stable decision changes, update every affected canonical document in the same change.

## Non-Negotiable Rules

- Vendor access is Deny by Default.
- Allow every active internal user to create an ordinary Project. Do not designate it as a formal research project/team without a separate immutable application and Lab Director review/consent. Do not add Senior or Representative approval to this designation route.
- Enforce authorization at the application server and database policy layers; UI hiding is not authorization.
- Do not grant official approval authority to the Senior Researcher position.
- Do not add Representative approval to the Research Note finalization flow.
- Do not let `Admin-System` automatically read L3/L4 technical-document source content.
- Do not expose contract amount or payment fields in vendor list responses.
- Do not treat review, intermediate approval, inspection, final acceptance, or payment as a waiver of vendor responsibility.
- Do not call the Supabase SDK throughout UI components. Keep it behind adapters/repositories and trusted application services.
- Do not overwrite an approved `DocumentVersion`.
- Do not automatically overwrite a server or local version during an offline conflict.
- Do not clone RCMS accounting or payment functions.
- Do not present internal contract presets as statutory values. Store the selected preset/policy version, per-contract override, reason, and approval snapshot.
- Do not treat L1 classification as automatic permission to export technical information; external release requires Lab Director approval.
- Do not assign one global research-allowance cadence. Use an approved per-project policy version, aggregate the monthly tax-exemption cap across projects, and preserve tax and wage classifications separately.
- Do not provide L3/L4 source-file download or recipient-controlled printing. External delivery uses approved, internally generated, watermarked controlled copies with handover and return/destruction evidence.
- Do not collapse Approval, DocumentVersion, WBS, Contract, Inspection, NCR/CAR, or ECR/ECO into one unvalidated JSON field.
- Do not represent core lifecycles with unconstrained `status: string` values.

## Stable Naming

- Use stable English IDs for policy, permission, event, state, and entity identifiers.
- Display labels may be Korean and configurable; persistent IDs must not depend on a translated label.
- Use UUID primary keys for business records unless a reviewed design specifies otherwise.
- Human document numbers are alternate unique identifiers, not primary keys.
- Persist timestamps in UTC and render them in the user's time zone.

## Required Boundaries

- `domain`: pure rules and state transitions; no Supabase, web framework, or browser imports.
- `application`: use cases, transaction boundaries, authorization decisions, ports.
- `infrastructure`: Supabase/Postgres/Storage/Auth and external integration adapters.
- `interface`: web routes, server actions/API handlers, PWA UI.
- Feature modules may depend on Core contracts; Core must not depend on feature UI or provider SDKs.
- Cross-feature writes go through an application service or domain event, not direct table manipulation from UI.

## Security and Data Rules

- Every request derives a trusted `ActorContext`; never accept actor, organization, vendor, project, or permission identity solely from request fields.
- Vendor scope requires matching active vendor membership plus an active project/contract grant.
- Use explicit field projection for vendor responses. A row allowed for detail does not imply all columns are allowed.
- Use private storage buckets and short-lived authorized delivery. Do not persist public file URLs.
- Service-role credentials remain server-only. A service-role call must still pass application authorization and record the actor.
- Record append-only audit events for authorization changes, approvals, sensitive reads/downloads, temporary grants, deletions, and state transitions.
- Expired or disabled vendor accounts lose access immediately.

## State and Transaction Rules

- State transitions must use the definitions in `docs/state-machines.md`.
- Validate current state, actor permission, scope, preconditions, and optimistic version in one transaction.
- Append transition history and required audit events in the same transaction as the state change.
- Automated expiry and notification jobs use idempotency keys.
- Approved snapshots, finalized research notes, signed contract versions, and audit events are immutable; corrections are new linked records.

## Change Workflow After Gate Approval

1. Identify the canonical requirement and stable IDs affected.
2. Update design documents first when behavior changes.
3. Implement the smallest vertical slice through interface, application, domain, and infrastructure layers.
4. Add migrations with constraints and rollback/forward-fix notes.
5. Add authorization, state-transition, audit, and concurrency tests.
6. Verify vendor isolation and forbidden-field responses explicitly.
7. Update `PROJECT_MEMORY.md` with completed work and next step.

## Subagent Coordination After Gate

- Root is Integration/Release owner and owns workspace configuration, ADR approval, composition root, shared public-contract review, cross-feature E2E, and final merges.
- Platform/Security owns Identity, Authorization, Audit, Postgres/Auth infrastructure, RLS tests, and is the only concurrent writer of `supabase/migrations`.
- Approval/Evidence owns Approval, Document, File, Notification, ResearchNote, TechCopy, and Storage/PDF adapter requirements.
- Business/Quality owns Project, Vendor, Contract, Quality, Change, Purchase, R&D, Safety, and cross-feature process requirements.
- Assign disjoint file ownership before spawning implementation agents. Never let two active agents edit the same module or migration path.
- Feature agents submit table/constraint/RLS requirements to Platform/Security; they do not create independently numbered migration files.
- Cross-feature behavior uses a public Application Port or domain event. An agent must not import another module's internal entities or repositories.
- Every handoff includes requirement IDs, public contracts, data/RLS needs, state/audit rules, tests run, changed files, and remaining risks as defined in `docs/agent-workstreams.md`.
- Parallel preparation is allowed, but development merges into `dev` follow `M00` through `M16` order. Release promotion into `main` is a separate gate.

## Verification Gates

Before merging future implementation work, verify at minimum:

- Domain unit tests for state and invariant rules.
- Application integration tests for transaction and authorization paths.
- Postgres/RLS tests for internal, vendor, disabled, expired, and cross-vendor actors.
- Contract tests for list/detail field redaction.
- Approval immutability and concurrent-action tests.
- Offline conflict tests proving no automatic overwrite.
- Audit tests proving required events are emitted and not user-editable.
- Migration verification against a clean database and an upgrade fixture.
- PWA installability and key mobile flows on supported browsers.

## Development Gate

Product implementation may begin only after the user approves:

- Source audit and conflict decisions.
- Logical ERD.
- Permission model.
- Core state machines.
- Technology-stack recommendation.
- Blocking versus non-blocking TBD classification.
- Final P0 selections in `docs/p0-scope-checklist.md`.

The planned implementation order is: project scaffolding → DB migrations → Auth/RBAC/Scope → Approval Engine → Document Engine → Project/WBS → Vendor/Contract/Inspection → Purchase/R&D → PWA/offline → Audit/Security.
