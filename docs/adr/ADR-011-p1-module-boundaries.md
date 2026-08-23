# ADR-011: P1 Module, Search, Offline, and Migration Boundaries

- Status: Proposed
- Date: 2026-08-23
- Decision IDs: `OD-037-P1-DEVELOPMENT-GATE`, `OD-010-SEARCH-SCOPE`, `OD-024-ALLOWANCE-REFERENCE`
- Tracking: GitHub `#48`

## Context

P1 adds BOM, research equipment/calibration, safety extensions, research allowance, and permission-filtered search to a completed P0 modular monolith. The new work touches existing Item/ECR/ECO, TestResult, Safety, Project/R&D, Authorization/Projection/Audit, PWA/offline and Worker boundaries.

Creating independent vertical silos would duplicate P0 masters and security. Putting every feature into one shared package or JSON schema would make ownership, RLS and lifecycle enforcement ambiguous. Search and offline also risk becoming authorization bypasses if they treat an index hit or cached command as authority.

## Decision

### 1. Module ownership

| Delivery item | Physical owner after Gate | Reused public contracts |
|---|---|---|
| `P1-M01` BOM | existing `feature.purchase` | Item, Product, Change/ECO, Approval, Document/File |
| `P1-M02` Equipment | new `feature.equipment` | Project/WBS, Quality TestResult port, Approval, File |
| `P1-M03` Safety extension | existing `feature.safety` | M13 assignment/inspection/training/incident, Project/Vendor, File |
| `P1-M04` Allowance | new `feature.allowance` | Project/R&D, Identity, Approval, Document/File |
| `P1-M05` Search | new `feature.search` read model | Authorization projection registry, Feature source projection ports, Audit |
| `P1-M06` Integration | existing Web/Worker/PWA/Notification composition | approved command/event contracts only |

No new `feature.bom` or duplicate Item module is created. `feature.search` owns no source business aggregate and never becomes a source of truth.

### 2. Dependency direction

- Domain packages contain pure rules/state transitions and import no framework, provider, SQL, browser or other Feature internals.
- Application services own authorization/transaction boundaries and define public ports.
- Infrastructure implements Postgres, search provider, file, notification and offline adapters behind public ports.
- Interface routes/actions/UI call Application contracts only.
- Cross-feature writes use an Application Port/domain event. Direct manipulation of another Feature table is forbidden.
- Core Authorization/Approval/Audit never depends on P1 Feature UI or provider SDKs.

### 3. Search architecture

Search is a permission-filtered derived read model.

1. Each source Feature publishes an allowlisted `SearchProjectionSourcePort` result with stable field IDs and security/scope metadata.
2. A trusted Worker creates an index entry under an effective `SearchIndexPolicyVersion`.
3. Query returns opaque candidate source IDs only.
4. Before result/snippet delivery, the Application server rebuilds trusted ActorContext and asks each source Feature to reauthorize the live source and projection.
5. Permission/security/source changes enqueue idempotent purge/reindex. `PURGE_QUEUED`, stale policy or failed live authorization entries are not delivered.

P1 first release is metadata-only for Project, Document, Item/BOM, Equipment, Safety/MSDS and R&D, with an explicit field allowlist per entity. L1/L2 body fields remain disabled until a separate post-P1 decision and newly approved `SearchIndexPolicyVersion`. Vendor technical repository search and L3/L4 body indexing are hard-denied.

Search provider credentials and provider document IDs remain Infrastructure-only. Public URLs are not persisted. PostgreSQL remains the default provider-neutral starting point; an external engine requires a later adapter decision and equivalent authorization/purge tests.

### 4. Offline boundary

P1 scope approval makes only equipment use/return draft capture and safety field draft capture possible candidates. It does not register them. Every actual state transition remains online-only.

Before any P1 offline command is added, its own ADR must define exact command/aggregate/schema, actor/Scope, safe projection, size limits, state/precondition, one-transaction handler, conflict behavior and purge/cache policy. BOM approval/effectivity, calibration certificate finalization, MSDS effectivity, waste handover/disposal confirmation, allowance calculation/approval/export and all search/index operations remain online-only.

No P1 field-level merge is enabled by this ADR. Existing no-auto-overwrite behavior remains.

### 5. Notifications

Only in-app Notification/Outbox is in P1. Candidate events are calibration due/expired, MSDS superseded, drill/action due, allowance review due and search purge failure. External email/push/Hiworks delivery remains behind `OD-017` and provider adapters.

Notification payloads store stable record IDs, event IDs and due times only. They do not contain allowance amounts/tax detail, MSDS private file locations, search query text, object keys or tokens.

### 6. Approval subjects

BOMVersion, EquipmentUseException, CalibrationPolicyVersion, MsdsVersion, EmergencyPlanVersion, AllowancePolicyVersion, AllowanceCalculationRun and SearchIndexPolicyVersion use exact typed Approval subject-link tables following ADR-003. Approval Core receives sealed identity/checksum/version/time and never imports Feature entities/repositories.

Every submitted version is sealed. A returned version transitions to immutable terminal `RETURNED`; correction creates a new `DRAFT` version/run with `predecessor_id`. No state transition unseals or sends the same row back to `DRAFT`.

Approval rejection/recall effects must be defined by each reviewed state machine. A generic approval result must not mutate a Feature state by guessed convention.

### 7. Migration ownership/order

Platform/Security is the sole writer of `supabase/migrations`. Feature workstreams submit table/FK/check/index/RLS/guarded-function requirements and tests. Migration order follows `P1-M01 → M02 → M03 → M04 → M05 → M06 → M07`; preparation may be parallel but merge order is serial.

Every migration is additive first and is verified against:

- a clean database;
- the exact P0 release fixture;
- forward upgrade with existing evidence;
- failure/forward-fix rehearsal;
- RLS/field projection and concurrency tests;
- DB + private Storage recovery manifest where files are involved.

No guessed backfill creates fake equipment, calibration, allowance, MSDS or historical payment facts.

### 8. Runtime/provider rules

- Supabase SDK remains behind Infrastructure adapters/composition.
- Request DB principal remains `NOBYPASSRLS`, transaction-local trusted actor context.
- Worker/service role calls require Application authorization and Audit provenance.
- private files use existing private bucket/authorized delivery contracts.
- all scheduled jobs are idempotent and emit stable safe reason codes without credential-bearing logs.

## Consequences

- BOM extends Purchase without duplicating Item, while its delivery and review can remain independently sequenced.
- Equipment and Allowance gain explicit bounded contexts because neither belongs inside Quality/Project internals.
- Safety extension reuses the M13 root/module and assignments.
- Search is replaceable and rebuildable; deletion of an index does not delete source records.
- P1 implementation cannot begin from this proposed ADR alone. It requires P0 release promotion, full P1 delta approval and explicit `OD-037` approval.

## Rejected alternatives

- One generic P1 package/table with JSON records: rejects relational/state/audit guarantees.
- Search engine ACL as the sole authorization layer: stale index/ACL can leak data.
- One Search `FAILED` state for index and purge: loses the security-critical pending operation; use `INDEX_FAILED` and `PURGE_FAILED` with separate retry paths.
- UI-only Vendor filtering: not authorization.
- New BOM Item master: duplicates Purchase Item and breaks ECR/ECO identity.
- Global research allowance cadence/default legal values: conflicts with per-project policy and source requirements.
- Register all P1 operations offline: expands sensitive state mutation without command-specific review.

## Verification required before Accepted

- entity/state/action/projection IDs match all P1 delta documents;
- package dependency/layer tests updated without implementation imports;
- P0 clean/release fixture migration plan reviewed;
- Vendor/L3/L4/allowance/search denial matrices approved;
- `docs/p1-open-decisions-checklist.md` decisions recorded;
- user approves P1 design Gate and later separately approves implementation Gate.
