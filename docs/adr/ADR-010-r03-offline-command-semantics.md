# ADR-010: R03 Offline Command Semantics and Atomic Dispatch

- Status: Accepted
- Date: 2026-08-23
- Decision IDs: Release Gate `#36` R03, `ARC-007-OFFLINE-ALLOWLIST`, `OD-018-OFFLINE-MERGE`

## Context

M15 registered five low-risk offline command names and immutable command/conflict evidence, but intentionally did not define their payloads or connect real Application handlers. The names `CHECKLIST`, `INSPECTION`, `FIELD_NOTE` and `FIELD_RECORD` are not interchangeable with finalized SafetyInspection, sealed InspectionAttempt, or ResearchNote content. Guessing those mappings would either mutate official evidence from an offline draft or collapse unrelated business records.

The original handler contract also did not expose the active `OfflineSyncTransaction`. A handler opening another UnitOfWork could commit a business change while command/result evidence rolled back, or the reverse.

## Decision

### Command contracts

Schema version 1 uses exact aggregate and payload contracts.

| Command | Aggregate | Payload | Authority |
|---|---|---|---|
| `CMD-OFFLINE-CHECKLIST-DRAFT-UPSERT` | `SAFETY_CHECKLIST_DRAFT` | exact SafetyInspection, note, bounded typed checklist items | direct active INTERNAL exact inspector with current `safety.inspection.perform`, Project scope and effective Safety assignment |
| `CMD-OFFLINE-INSPECTION-DRAFT-UPSERT` | `INSPECTION_ATTEMPT_DRAFT` | exact open M08 InspectionAttempt, summary, bounded typed criterion results | direct active INTERNAL exact inspector with `inspection.record.inspect` and Contract scope |
| `CMD-OFFLINE-FIELD-NOTE-DRAFT-UPSERT` | `FIELD_NOTE_DRAFT` | exact Project, optional same-Project WBS, observed time, bounded narrative | direct active INTERNAL creator with current Project edit scope |
| `CMD-OFFLINE-WORK-ITEM-PROGRESS-UPDATE` | `WBS_NODE` | integer progress `0..99` | internal assignee/PM or exact assigned VendorUser with active VendorMembership and exact current Project `project.wbs.update` grant |
| `CMD-OFFLINE-FIELD-RECORD-DRAFT-UPSERT` | `FIELD_RECORD_DRAFT` | exact Project, optional same-Project WBS, observed time, stable record type, summary/location and bounded typed measurements | direct active INTERNAL creator with current Project edit scope |

The four draft commands deny Vendor actors. This is the safe initial policy until a named Vendor payload/projection and Project/Contract permission is approved. WBS is the only Vendor-enabled command and never accepts Project, Vendor, membership or Scope identity from payload.

Checklist and inspection drafts are separate mutable draft aggregates. They do not append official `safety_inspection_item`, seal an `inspection_attempt`, decide acceptance, or finalize evidence. FieldNoteDraft is not a ResearchNote and FieldRecordDraft is not a SafetyIncident or finalized inspection record.

### Lifecycle and evidence

- New drafts transition `null → DRAFT`; edits transition `DRAFT → DRAFT` with version `+1`.
- WBS progress uses `EVT-WBS-PROGRESS-UPDATED`, an `IN_PROGRESS → IN_PROGRESS` transition. It cannot set `100`, complete, accept, cancel or otherwise bypass the online WBS lifecycle.
- Every applied command writes the business aggregate, transition, business audit, minimum-reference outbox event, offline command and terminal result on one PostgreSQL connection and transaction.
- The transaction-scoped handler contract is mandatory. No handler may open an independent UnitOfWork.
- Exact stale version creates `SYNC_CONFLICT`; authorization, Scope, state, schema and precondition failures return stable `REJECTED` reasons without revealing resource existence.
- Conflict safe projections contain only ID, version, state and bounded non-sensitive comparison metadata. They exclude contract amount/payment, internal evaluation, attachment object coordinates, signed URLs and other actors' details.

### Integrity and request limits

- `command_id` registration takes a transaction advisory lock before the idempotency lookup so concurrent identical replays serialize.
- Request and database canonical payload limits are both 32,768 UTF-8 bytes. The Web route rejects an oversized stream before JSON parsing or database dispatch.
- Command payload objects reject unknown keys, wrong aggregate types, invalid branded values, unbounded arrays/text and non-finite numbers.
- Field-level merge remains disabled. Only discard-local or retry-as-new against the preserved server version is allowed.

## Consequences

- R03 adds typed draft tables rather than a generic JSON business table.
- Official Safety, Inspection and ResearchNote evidence stays untouched until its existing online workflow validates and seals it.
- A later Vendor-enabled field draft requires a new policy/permission/projection review, not a silent schema relaxation.
- Readiness remains `503` unless live Auth, request DB and exactly all five reviewed handlers/capabilities are composed.

## Verification

- Five exact schema/aggregate handler contract tests.
- PostgreSQL internal/Vendor/cross-scope/stale/idempotent/concurrent/rollback tests.
- One-transaction evidence counts for business row, transition, audit, outbox and result.
- 32,768-byte multi-byte request boundary and malformed identifier normalization tests.
- Vendor response/projection forbidden-field tests and no-auto-overwrite conflict tests.
