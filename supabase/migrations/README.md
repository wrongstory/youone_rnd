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

M03 intentionally does not create ProjectScope, ContractScope, or DocumentVersion grants before their typed FK targets exist.

M04 initially supports `ApprovalPolicyVersion` as a real typed subject. Each later feature migration adds its own FK-backed subject-link table and extends `app_private.approval_subject_snapshot`; a generic `subject_type + subject_id` fallback is prohibited.

M06 intentionally does not create `project_rnd_program`: M11 owns the real `rnd_program` target and must add the typed N:M table with its actual FK in that migration. A placeholder UUID, generic resource link, or fake registry row is prohibited.

M07 intentionally does not implement M08 Inspection, acceptance, conditional-payment calculation, or payment execution. Contract preset/legal-baseline fields record reviewed provenance and per-contract overrides; they are not statutory values.

M08 stores policy thresholds and rounding only in immutable published versions and links payment policy to the exact score-policy version sealed into the InspectionAttempt. Approval freezes the final rate; residual-condition satisfaction and external-payment eligibility remain separate audited transitions. No M08 function transfers money, posts accounting entries, or weakens Vendor responsibility.

M09 stores NCR/CAR lifecycle records in normalized tables rather than a generic JSON object. It implements `CLOSED → REOPENED` with exact prior-close evidence but intentionally registers no `REOPENED` exit transition until `OD-031-NCR-REOPEN-FOLLOWUP` is decided. NCR/CAR outcomes emit review facts only and never update Contract, acceptance, warranty, payment, or responsibility-waiver state.
