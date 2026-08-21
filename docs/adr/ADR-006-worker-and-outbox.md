# ADR-006: Worker Runner and Transactional Outbox

- Status: Accepted
- Date: 2026-08-21
- Decision IDs: `ARC-010-TRANSACTIONAL-AUDIT`, `OD-017-NOTIFICATION`

## Context

Notifications, expiries, SLA checks, and evidence jobs must be reliable and idempotent, while delivery providers remain undecided.

## Decision

- Run a separate Node.js worker entry point from `apps/worker`; it is not imported into the normal web request composition root.
- Business transactions append versioned outbox messages in the same transaction as state and audit changes.
- Workers claim messages with bounded leases, idempotency keys, attempt counts, exponential retry, and dead-letter state.
- Handlers invoke Application use cases or provider ports; they do not manipulate feature tables directly.
- Notification provider selection remains an adapter decision. P0 guarantees an in-app/outbox record, not external channel delivery.
- Time-based jobs use deterministic schedule keys and are safe to retry.

## Consequences

The initial worker can use database polling without committing to a hosted queue. Scaling to a queue preserves the same handler and idempotency contracts.

## Verification

- Duplicate delivery, lease expiry, retry, dead-letter, transaction rollback, and request/worker credential isolation tests.
