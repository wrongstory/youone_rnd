# ADR-004: Request DB Principal and Actor Context

- Status: Accepted
- Date: 2026-08-21
- Decision IDs: `ARC-003-SERVER-AUTHZ`, `ARC-004-RLS-DEFENSE`, `OD-028-DB-PRINCIPAL`

## Context

The server must run multi-step transactions while preserving RLS and must not use a service-role credential as the normal request identity.

## Decision

- The browser uses Supabase only for authentication session establishment. It does not directly access business tables or private Storage objects.
- The trusted server verifies the Supabase session, reloads active organization, role, position, vendor membership, and grants, and builds `ActorContext`; actor and scope identifiers from request fields are never trusted.
- Normal repositories use a dedicated request DB principal with `NOBYPASSRLS` and no service-role capability.
- At transaction start the Infrastructure UnitOfWork sets verified actor/session/correlation values with `SET LOCAL`. RLS helper functions read only those transaction-local values and database memberships.
- Application authorization runs before repository calls; RLS is the independent second enforcement layer.
- Worker/admin credentials use a separate pool and composition root unavailable to request handlers. A privileged job still records the initiating actor or system job identity and passes Application authorization.
- Fail closed when the actor context is absent, malformed, disabled, expired, or no longer scoped.

## Consequences

Infrastructure must prove connection cleanup and transaction-local isolation. Direct browser business queries and service-role request shortcuts are prohibited.

## Verification

- Internal, vendor, disabled, expired, missing-context, cross-vendor, and connection-reuse RLS tests.
- Tests prove request composition cannot resolve the worker/service-role adapter.
