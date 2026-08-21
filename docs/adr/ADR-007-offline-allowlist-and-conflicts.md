# ADR-007: Offline Allowlist and Conflict Records

- Status: Accepted
- Date: 2026-08-21
- Decision IDs: `ARC-007-OFFLINE-ALLOWLIST`, `OD-018-OFFLINE-MERGE`

## Context

Field work needs offline drafts, but approvals and sensitive access cannot be safely replayed. Conflicts must never overwrite server or local data automatically.

## Decision

- Dexie stores only an explicit cache allowlist, local drafts, command outbox entries, attachment staging metadata, and conflict records.
- Every offline command has `command_id`, stable command type, actor/session binding, aggregate ID, `base_version`, schema version, creation time, and payload hash.
- The server accepts only registered offline command schemas and re-runs authentication, authorization, scope, state, precondition, and optimistic-version checks.
- A version mismatch creates a conflict containing base metadata, local payload, and a safe server comparison projection. Neither side is overwritten.
- Approval, authority/scope change, L2-L4 access, controlled copy, contract signing/termination, and payment confirmation remain online-only.
- Field-level merge behavior is command-specific and may be enabled only after a reviewed policy and test fixture exists.

## Consequences

This ADR unblocks the common conflict schema while leaving risky per-field merge policies disabled by default.

## Verification

- Allowlist rejection, stale version, actor change, expired session, cross-scope replay, duplicate command, and no-auto-overwrite tests.
