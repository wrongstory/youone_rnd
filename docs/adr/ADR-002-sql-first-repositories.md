# ADR-002: SQL-First Repositories and Migrations

- Status: Accepted
- Date: 2026-08-21
- Decision IDs: `ARC-012-SQL-FIRST-MIGRATION`

## Context

RLS, constraints, immutable evidence, and transactional audit rules require reviewable PostgreSQL behavior. Generated ORM migrations cannot become a second source of truth.

## Decision

- Keep all physical schema changes in globally ordered `supabase/migrations/*.sql` files.
- A migration contains its table, constraint, index, RLS enablement, deny-first policies, and forward-fix notes as one reviewed unit.
- Domain/Application depend on Repository and UnitOfWork ports. SQL clients and generated database types remain in Infrastructure.
- Use explicit queries and projections. Vendor list/detail queries must have separate DTOs and SQL projections.
- ORM/query helpers may be used only if they do not generate or apply an alternative schema history.
- Production reference codes and effective-dated policy versions are migrations; example records belong only in local/test seed data.

## Consequences

Database changes are deliberately serialized through Platform/Security. Feature agents provide table, constraint, index, and RLS requirements instead of creating migration files.

## Verification

- Apply every migration to a clean database and an upgrade fixture.
- Run constraint, RLS, forbidden-field, rollback/forward-fix, and schema-drift checks.
