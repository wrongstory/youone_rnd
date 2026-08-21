# Migration Ownership

- Platform/Security is the only concurrent writer of this directory.
- Use one global UTC timestamp prefix and descriptive suffix for every SQL migration.
- A Feature submits table, FK, constraint, index, RLS, audit, and forward-fix requirements; it does not create a competing migration.
- Never edit an applied migration. Corrections are new forward-fix migrations.
- Each business migration enables RLS and deny-first policies with its tables.
- Verify against a clean database and an upgrade fixture before merge.

Applied sequence:

- `20260821000100_m02_database_audit_kernel.sql`: registry, Audit, Transition, Outbox, idempotency, request/worker capability roles.
- `20260821000200_m03_auth_rbac_scope.sql`: Identity/RBAC, Vendor membership, acting authority, normalized action sets, actor/resource/action-bound field projections, request-time RLS helpers, and audited account/Vendor/membership/role lifecycle.

M03 intentionally does not create ProjectScope, ContractScope, or DocumentVersion grants before their typed FK targets exist.
