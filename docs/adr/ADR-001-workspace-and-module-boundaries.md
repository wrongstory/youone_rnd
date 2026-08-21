# ADR-001: Workspace and Module Boundaries

- Status: Accepted
- Date: 2026-08-21
- Decision IDs: `ARC-001-MODULAR-MONOLITH`, `ARC-002-HEX-BOUNDARY`, `OD-027-PROJECT-STRUCTURE`

## Context

The product has one small operating organization but many policy-heavy domains. It needs strong boundaries without the deployment and transaction cost of microservices.

## Decision

- Use a pnpm workspace and Turborepo task graph with `apps/web`, `apps/worker`, and workspace packages.
- Use one modular-monolith deployment boundary. Core, Feature, Process, Infrastructure, Interface, and Composition remain separate code boundaries.
- Domain packages import only their own domain and the shared kernel. Feature packages expose cross-module contracts only through `public.ts`.
- Root owns workspace configuration and the composition root. `supabase/migrations` has one serialized owner.
- Enforce dependency rules through package exports, TypeScript project references, lint rules, and architecture tests.
- P1/P2-only packages and routes are not scaffolded during P0.

## Consequences

Cross-feature changes must use an Application Port or domain event. Shared contracts require integration review, but deployment and cross-domain transactions remain operationally simple.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` run from the root.
- Architecture tests reject provider imports in Domain/Application packages and internal imports across features.
