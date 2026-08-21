# ADR-003: Typed Approval Subjects

- Status: Accepted
- Date: 2026-08-21
- Decision IDs: `OD-029-APPROVAL-SUBJECT`

## Context

Approval is shared, but its subjects have different invariants and immutable versions. A free `subject_type + subject_id` pair cannot provide relational integrity or transactional subject handling.

## Decision

- Keep a common `approval_instance` and create a typed link table for each P0 subject family.
- Initial links include DocumentVersion, formal research designation application, PurchaseRequest, ContractVersion, technical access/copy request, and acceptance/payment decision.
- Each typed link has a real foreign key and stores the immutable subject version or sealed application identifier where applicable.
- An ApprovalInstance has exactly one typed subject link, enforced transactionally and by a deferred database integrity check.
- A subject adapter seals the subject, creates the approval instance/link, applies the final subject transition, and emits audit/outbox records in one UnitOfWork.
- Approval Engine never updates another module's tables directly and never treats a generic identifier as proof that the subject exists.

## Consequences

Adding an approval subject requires an explicit link and adapter, but broken references and untyped workflow shortcuts are prevented.

## Verification

- FK, exactly-one-link, immutable snapshot, concurrent action, and rollback tests.
- Contract tests for each public subject adapter.
