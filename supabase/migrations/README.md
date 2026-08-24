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
- `20260822000300_m04_approval_engine.sql`: `SM-APPROVAL-V1`, immutable versioned policy/line snapshots, exact FK-backed typed subject link, participant/action evidence, optimistic commands, audit/transition/outbox atomicity, and deny-first RLS.
- `20260822000400_m05_document_file.sql`: versioned Template/Document/File metadata, content/manifest/scan evidence, exact `DocumentVersion` approval subject links, private-storage broker boundaries, immutable history, and deny-first RLS.
- `20260822000500_m06_project_wbs.sql`: Product/Project/ProjectMember, free-hierarchy WBS, exact VendorMembership-bound Project grants, and immutable Lab-Director-only formal-research designation.
- `20260822000600_m07_vendor_contract.sql`: normalized VendorContract/immutable ContractVersion, exact ContractProject and ContractMilestone finance, Deliverable evidence manifests, Guarantee/Warranty bases, exact VendorMembership-bound ContractScope, typed ContractVersion approval subject, separate safe/basic/finance projections, and atomic activation/close/termination scope obligations.
- `20260822000700_m08_quality_inspection.sql`: direct-next Requirement revisions, sealed TestPlan/TestResult evidence, exact Inspection checklist/attempt/result/evidence snapshots, versioned score/payment policies, immutable AcceptancePaymentDecision/adjustment bases, exact typed approval links, Vendor-safe projections, separate finance permission, and evidence-backed eligibility without transfer/accounting execution.
- `20260822000800_m09_ncr_car.sql`: exact sealed InspectionAttempt lineage, append-only responsibility/containment/root-cause/CAR/verification/close/reopen evidence, independent effectiveness verification, exact Vendor assignment and Contract/Project Scope, narrow Vendor action projection, and atomic transition/audit/outbox commands without Contract state mutation.
- `20260822000900_m10_ecr_eco.sql`: immutable ECR/ECO versions, structured impact review, exact typed before/after targets, signed ContractVersion obligations, implementation scope and independent reverification.
- `20260822001000_m11_purchase_rnd.sql`: Purchase request/resolution/receipt/inspection and R&D budget/expenditure/evidence/deadline records without payment execution or RCMS cloning.
- `20260822001100_m12_research_note.sql`: immutable ResearchNote entry lineage, optional Senior review, Lab Director finalization and generic PDF evidence manifest.
- `20260822001200_m13_safety_light.sql`: effective-dated safety assignment, weekly/monthly inspection, training, incident and 48-hour investigation evidence.
- `20260822001300_m14_controlled_copy.sql`: exact L3/L4 controlled-copy request/approval/render/print/handover/return/destruction evidence, watermark manifest and Vendor-safe projection.
- `20260823001400_m15_pwa_offline_sync.sql`: allowlisted offline command registry, canonical payload hash, immutable command/result/conflict/resolution, exact retry successor, owner RLS and direct-write denial.
- `20260823001500_m16_force_registry_rls.sql`: forward-fix that applies FORCE RLS and explicit deny-all grants to the six M02 stable definition registries, closing table-owner policy bypass for non-migration identities.
- `20260823001600_r02_active_auth_session.sql`: Identity Resolver-only exact Supabase `auth.sessions` subject/session capability with fail-closed provider-schema detection.
- `20260824115454_b01_auth_session_revocation_confirmation.sql`: resolver-only post-sign-out session presence probe plus exact actor/session-bound audit and 15-minute reconciliation outbox enforcement.
- `20260824154415_b01_auth_rate_limit_audit.sql`: canonical six-rule hash, distinct `ADMIN_SECURITY` + Lab Director Approval evidence, subject/global Auth buckets and exact-policy append-only HMAC audit capability; no numeric production policy is seeded.
- `20260823001700_r03_offline_handlers.sql`: command-ID advisory serialization and five explicit R03 offline handlers with typed normalized drafts, exact actor/scope/state/version checks, safe stale projections, atomic transition/audit/outbox evidence, FORCE RLS, and Vendor-deny-by-default boundaries. This is a forward-only M15 race fix: a failed deployment or command transaction is rolled back in full; after production data exists, correction uses a new forward migration rather than dropping immutable command/evidence rows or draft tables.

M03 intentionally does not create ProjectScope, ContractScope, or DocumentVersion grants before their typed FK targets exist.

M04 initially supports `ApprovalPolicyVersion` as a real typed subject. Each later feature migration adds its own FK-backed subject-link table and extends `app_private.approval_subject_snapshot`; a generic `subject_type + subject_id` fallback is prohibited.

M06 intentionally does not create `project_rnd_program`: M11 owns the real `rnd_program` target and must add the typed N:M table with its actual FK in that migration. A placeholder UUID, generic resource link, or fake registry row is prohibited.

M07 intentionally does not implement M08 Inspection, acceptance, conditional-payment calculation, or payment execution. Contract preset/legal-baseline fields record reviewed provenance and per-contract overrides; they are not statutory values.

M08 stores policy thresholds and rounding only in immutable published versions and links payment policy to the exact score-policy version sealed into the InspectionAttempt. Approval freezes the final rate; residual-condition satisfaction and external-payment eligibility remain separate audited transitions. No M08 function transfers money, posts accounting entries, or weakens Vendor responsibility.

M09 stores NCR/CAR lifecycle records in normalized tables rather than a generic JSON object. It implements `CLOSED → REOPENED` with exact prior-close evidence but intentionally registers no `REOPENED` exit transition until `OD-031-NCR-REOPEN-FOLLOWUP` is decided. NCR/CAR outcomes emit review facts only and never update Contract, acceptance, warranty, payment, or responsibility-waiver state.
