# Open Decisions

## Status Vocabulary

- `OPEN`: no approved answer.
- `PARTIALLY_DECIDED`: stable boundary exists, details remain open.
- `WAITING_SOURCE`: required source artifact is missing.
- `PROPOSED`: Codex recommendation awaiting user approval.
- `WAITING_USER`: the user requested a checklist or selection artifact and has not returned the final selection.
- `DECIDED`: move the result into canonical documents and retain a link here.

Blocking levels:

- `GATE_BLOCKER`: blocks any product implementation.
- `P0_SCHEMA_BLOCKER`: blocks physical schema/migration for the affected P0 module.
- `FEATURE_BLOCKER`: blocks only the named feature or production activation.
- `NON_BLOCKING_CONFIG`: safe to postpone if the system stores a configuration point and no invented default.

## Decisions

| ID | Decision needed | Status | Blocking | Owner / evidence needed | Safe interim treatment |
|---|---|---|---|---|---|
| `OD-001-SUPERIOR-REGULATIONS` | Reconcile the actual `기업부설연구소 운영 규정`, `안전관리규정`, `연구수당 지급 규정` | `DECIDED` | none | Originals uploaded/read 2026-08-21 | Canonical rules reflected in source audit; unresolved internal contradictions split into new decisions |
| `OD-002-CONTRACT-NUMERICS` | Final guarantee ratios, liquidated-damages rate/cap, performance reduction criteria, liability cap/exclusions, warranty periods, insurance/legal review thresholds | `DECIDED` | none; per-contract confirmation remains an operational check | User F.4 + current official law, 2026-08-21 | Use versioned `POL-CONTRACT-BASELINE-V1`; never present public-contract comparison rates as private statutory values |
| `OD-003-ACCEPTANCE-EFFECTS` | Distinguish `PARTIAL_ACCEPTANCE` and `CONDITIONAL_ACCEPTANCE`, including payment eligibility and close conditions | `DECIDED` | none; included in P0 | User F.3 + `P0-SCOPE-V1.0` | Weighted score, distinct dispositions, adjustable approved payment rate, residual hold |
| `OD-004-APPROVAL-POLICY-TABLE` | Document-type, amount-band, security-level, required-step, specific/ALL representative presets | `DECIDED` | none; production policy version must be seeded after Gate | User F.5, `POL-APPROVAL-MATRIX-V1` | Initial version in `docs/legal-policy-baseline.md`; changes are effective-dated and audited |
| `OD-005-COMPANY-FORMS` | Exact fields, pagination, signatures, print/PDF layout for initial six forms and research evidence bundles | `WAITING_SOURCE` | `FEATURE_BLOCKER` for form-specific templates/print fidelity | User uploads originals | Build versioned generic editor/template concepts only after Gate; no guessed layout |
| `OD-006-DASHBOARD-KPI` | Role-specific cards, graphs, thresholds, drill-down, financial projections | `OPEN` | `NON_BLOCKING_CONFIG` | Stakeholder review | Minimal personal work/approval counts can be proposed later; no KPI hardcoding now |
| `OD-007-HIWORKS` | Mail, organization, SSO, approval, notification integration scope and real API capability | `OPEN` | `FEATURE_BLOCKER` for integration only | API/contract/tenant capability investigation | Keep Integration/Notification/Auth ports; no dependency in domain model |
| `OD-008-MOBILE-NAV` | Final five bottom tabs | `OPEN` | `NON_BLOCKING_CONFIG` | Mobile prototype usability review | Candidate remains Home/Work/Approval/Document/More |
| `OD-009-CALENDAR-IA` | Independent top-level calendar versus Work subpage | `OPEN` | `NON_BLOCKING_CONFIG` | IA/usability review | Route ownership remains feature-neutral |
| `OD-010-SEARCH-SCOPE` | P0 searchable entities and timing/method of technical-document full-text search | `OPEN` | `FEATURE_BLOCKER` for search; security blocker for technical full text | Security classification and user scenarios | Vendors cannot browse technical repository; start with metadata-only internal search if approved |
| `OD-011-L4-DELIVERY` | Whether an exceptional L4 grant permits preview only, watermark method, maximum period, device/MFA controls | `DECIDED` | none; included in P0 | User F.9 + `P0-SCOPE-V1.0` | No digital/source delivery; internally printed numbered watermarked copy, Director + Rep approval, custody ledger |
| `OD-012-L3-DOWNLOAD-EXCEPTION` | Who can authorize an exception, purpose, max time/count, stronger audit | `DECIDED` | none; P0 implementation awaits checklist | User F.9 | No vendor download/self-print; Director-approved internally printed controlled copy only |
| `OD-013-DOCUMENT-DISPOSAL` | Quarantine duration, purge authority/execution, legal hold, backup deletion behavior | `PARTIALLY_DECIDED` | `FEATURE_BLOCKER` for physical purge | Superior regulations + records policy | Representative approval and permanent audit required; stop at quarantine |
| `OD-014-PROJECT-CLOSE` | Required child states, open contract/warranty/R&D links, reopen policy | `OPEN` | `FEATURE_BLOCKER` for project close transition | Project owner | Closing checklist exists; no automatic cascade |
| `OD-015-TECH-STACK` | Approve Next.js modular monolith, data-access tool, editor, offline store, job runner, hosting | `DECIDED` | none | User F.1, 2026-08-21 | Approved stack in `docs/architecture.md`; exact versions lock after Development Gate |
| `OD-016-ONPREM-TARGET` | PocketBase versus self-hosted Supabase versus PostgreSQL + independent Auth/Storage, and migration RTO/RPO | `OPEN` | `NON_BLOCKING_CONFIG` for P0 if ports/exportability are preserved | Operations/security/cost review | Keep PostgreSQL-centric domain and provider ports; test export manifests |
| `OD-017-NOTIFICATION` | Push/email operational provider, Hiworks mail, opt-out/escalation rules | `OPEN` | `FEATURE_BLOCKER` for external delivery | Operations and Hiworks investigation | Transactional notification outbox only; channel adapter TBD |
| `OD-018-OFFLINE-MERGE` | Field-level merge rules per command and maximum offline data/security policy | `PARTIALLY_DECIDED` | `FEATURE_BLOCKER` for enabling field-level merge on a named command | Field scenarios + security review; common schema fixed by `ADR-007` | Allowlist only; base-version conflicts never auto-apply; merge disabled until a command policy is approved |
| `OD-019-MFA-SESSION` | MFA requirement by actor/action, session duration, device controls, password/SSO policy | `OPEN` | `FEATURE_BLOCKER` for production security | Security owner + Auth capability | Architecture supports step-up; production policy not guessed |
| `OD-020-LEGAL-VALIDATION` | Validate cited civil/subcontract/public-contract provisions and standard clauses for each transaction type | `DECIDED` | none; case-specific checklist remains mandatory | User F.4/F.5 + current official law | Initial internal review in `docs/legal-policy-baseline.md`; law applicability and overrides stored per contract |
| `OD-021-P0-MODULE-CUT` | Confirm optional P0/P1/P2 modules | `DECIDED` | none | User approved recommended selections as `P0-SCOPE-V1.0` and Development Gate, 2026-08-21 | P0: note/test/acceptance/NCR/CAR/ECR/ECO/safety-light/L3-L4 copy; remaining modules staged per checklist |
| `OD-022-ALLOWANCE-SCOPE` | Decide calculation/export scope and payment cadence | `DECIDED` | none; scheduled for P1 | User F.6 + `P0-SCOPE-V1.0` | Approved project policy decides scope and cadence; calculation/export supported only when enabled |
| `OD-023-ALLOWANCE-TAX` | Validate monthly KRW 200,000 tax-exemption text and payroll interface | `DECIDED` | none for logical design; operational revalidation required | User F.7 + Income Tax Act Enforcement Decree/NTS current guidance | Apply once per person/month across eligible projects; unsupported/performance amounts taxable by default; wage status separate |
| `OD-024-ALLOWANCE-REFERENCE` | Correct the allowance appendix reference to `운영규정 제5조`, which currently points to the meetings article | `OPEN` | `FEATURE_BLOCKER` for formal policy traceability | Approved regulation amendment | Preserve source text in audit only; do not use it as a rule link |
| `OD-025-SAFETY-P0` | Confirm P0 scope for safety manager, inspection schedules, training, MSDS/materials, waste, drills, incident/48-hour investigation | `DECIDED` | none | `P0-SCOPE-V1.0` | P0 light: assignments, monthly/weekly inspections, training, incident/investigation; MSDS, waste, drills in P1 |
| `OD-026-RESEARCH-STAFFING` | Confirm whether current `연구소 4명` description satisfies the operation regulation's principle of one Director plus four or more dedicated researchers | `OPEN` | not a software schema blocker; compliance follow-up | Management/KOITA compliance owner | Keep user scale separate from legal organization headcount; do not infer compliance |
| `OD-027-PROJECT-STRUCTURE` | Approve `STRUCTURE-PROPOSAL-V1` pnpm workspace, package boundaries, route tree, and agent ownership | `DECIDED` | none | User Development Gate approval, 2026-08-21 | Implement through `M00`/`M01`; preserve ownership and merge order |
| `OD-028-DB-PRINCIPAL` | Choose the least-privileged request DB execution pattern: user JWT versus validated transaction-local actor context; isolate service role | `DECIDED` | none; M02 PoC and RLS tests required before production use | `ADR-004`, 2026-08-21 | NOBYPASSRLS request principal + verified transaction-local ActorContext; service-role pool isolated |
| `OD-029-APPROVAL-SUBJECT` | Approve common ApprovalInstance plus typed subject-link tables/adapters for non-Document subjects | `DECIDED` | none | `ADR-003`, 2026-08-21 | Common instance + exactly one typed FK link and subject adapter transaction |

## Decisions Already Fixed and Not Open

The following must not be reintroduced as TBD:

- Vendor direct login and Deny by Default.
- Junior Researcher project creation.
- Senior Researcher has no official approval authority.
- Lab Director or above is the official approval tier.
- Representative default `ANY_ONE`.
- ResearchNote ends with Lab Director finalization and no Representative approval.
- L2 temporary digital access approval is Lab Director; default duration is 15 days and the approver may change it.
- L3/L4 external source download/self-print is prohibited; controlled printing requires Lab Director for L3 and Lab Director plus Representative for L4.
- Admin-System is separate from L3/L4 source-content access.
- WBS free hierarchy with default 3-level UI.
- Offline conflict comparison/choice/merge; no automatic overwrite.
- General document retention 5 years and technical document permanent retention, subject to superior rules.
- Technical-document deletion requires Representative approval and permanent audit.
- Supplier and Item masters are included in P0 requirements.
- RCMS full replication is prohibited.
- Every active internal user may create an ordinary Project; formal-research designation is a separate sealed application completed by Lab Director review/consent only, without Senior or Representative approval.
- Recommended Next.js/Supabase modular-monolith stack is approved.
- Partial/conditional acceptance uses weighted achievement and an adjustable, separately approved payment rate.
- Contract, legal-review, and approval-matrix initial policies are versioned internal presets in `docs/legal-policy-baseline.md`.
- Research-allowance scope and cadence are configured per approved project policy; tax assessment aggregates across projects per person/month.
- L3/L4 external delivery permits no source download or self-print; controlled watermarked paper handover is the approved route.

## Decision Recording Template

When the user decides an item, record:

```text
Decision ID:
Decision date/time zone:
Decision maker:
Chosen option:
Effective scope:
Effective date:
Source artifact/version:
Affected policy/state/entity IDs:
Migration/backfill impact:
Superseded text:
```

Update `docs/source-audit.md`, every affected design document, and `PROJECT_MEMORY.md` in the same change.
